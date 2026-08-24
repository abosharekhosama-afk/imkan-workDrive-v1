import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { ConflictException, Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from './prisma/prisma.service';
import type { AccessTokenPayload } from './auth/jwt.types';

const scrypt = promisify(scryptCallback);

// تم إضافة القوس الإغلاقي هنا };
type AuthResult = { 
  access_token: string; 
  user: { id: string; name: string | null; email: string; org_id: string; role: string };
};

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) { }

  async signup(input: { name: string; email: string; password: string }): Promise<AuthResult> {
    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();
    if (name.length < 2 || name.length > 120) throw new BadRequestException('Name must be between 2 and 120 characters');
    if (!email || !email.includes('@')) throw new BadRequestException('A valid email is required');
    if (input.password.length < 8) throw new BadRequestException('Password must be at least 8 characters');
    const existing = await this.prisma.user.findFirst({ where: { email } });
    if (existing) throw new ConflictException('Email is already registered');
    const organization = await this.prisma.organization.create({ data: { name: `${name}'s Workspace` } });
    const user = await this.prisma.user.create({ data: { orgId: organization.id, email, name, passwordHash: await this.hash(input.password), role: 'MEMBER' } });
    return this.issue(user);
  }

  async login(input: { email: string; password: string }): Promise<AuthResult> {
    const user = await this.prisma.user.findFirst({ where: { email: input.email.trim().toLowerCase() } });
    if (!user?.passwordHash || !(await this.verify(input.password, user.passwordHash))) throw new UnauthorizedException('Invalid email or password');
    return this.issue(user);
  }

  async logout(user: AccessTokenPayload) {
    if (user.jti) await this.prisma.session.updateMany({ where: { id: user.jti, userId: user.sub, orgId: user.org_id, revokedAt: null }, data: { revokedAt: new Date() } });
    return { ok: true };
  }

  async logoutAll(user: AccessTokenPayload) {
    await this.prisma.session.updateMany({ where: { userId: user.sub, orgId: user.org_id, revokedAt: null }, data: { revokedAt: new Date() } });
    return { ok: true };
  }

  async forgotPassword(emailInput: string) {
    const email = emailInput.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({ where: { email } });
    if (!user) return { ok: true };
    const raw = randomBytes(32).toString('hex');
    await this.prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: this.hashToken(raw), expiresAt: new Date(Date.now() + 30 * 60 * 1000) } });
    return { ok: true, reset_token: this.config.get('NODE_ENV') === 'production' ? undefined : raw };
  }

  async resetPassword(token: string, password: string) {
    const record = await this.prisma.passwordResetToken.findFirst({ where: { tokenHash: this.hashToken(token), usedAt: null, expiresAt: { gt: new Date() } } });
    if (!record) throw new BadRequestException('Invalid or expired reset token');
    const passwordHash = await this.hash(password);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      this.prisma.session.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    return { ok: true };
  }

  async sessions(user: AccessTokenPayload) {
    return this.prisma.session.findMany({ where: { userId: user.sub, orgId: user.org_id, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: 'desc' }, select: { id: true, createdAt: true, lastSeenAt: true, expiresAt: true } });
  }

  async revokeSession(user: AccessTokenPayload, id: string) {
    await this.prisma.session.updateMany({ where: { id, userId: user.sub, orgId: user.org_id, revokedAt: null }, data: { revokedAt: new Date() } });
    return { ok: true };
  }

  async updateProfile(user: AccessTokenPayload, nameInput: string) {
    const name = nameInput.trim();
    if (name.length < 2 || name.length > 120) throw new BadRequestException('Name must be between 2 and 120 characters');
    const updated = await this.prisma.user.update({ where: { id: user.sub }, data: { name }, select: { id: true, name: true, email: true, orgId: true, role: true } });
    return { ...updated, org_id: updated.orgId };
  }

  async changePassword(user: AccessTokenPayload, currentPassword: string, newPassword: string) {
    if (newPassword.length < 10) throw new BadRequestException('New password must be at least 10 characters');
    const found = await this.prisma.user.findFirst({ where: { id: user.sub, orgId: user.org_id } });
    if (!found?.passwordHash || !(await this.verify(currentPassword, found.passwordHash))) throw new UnauthorizedException('Current password is incorrect');
    const passwordHash = await this.hash(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: found.id }, data: { passwordHash } }),
      this.prisma.session.updateMany({ where: { userId: found.id, orgId: found.orgId, revokedAt: null, id: { not: user.jti ?? '' } }, data: { revokedAt: new Date() } }),
    ]);
    return { ok: true };
  }

  async me(user: AccessTokenPayload) {
    const found = await this.prisma.user.findFirst({ where: { id: user.sub, orgId: user.org_id }, select: { id: true, name: true, email: true, orgId: true, role: true } });
    if (!found) throw new UnauthorizedException('Session is no longer valid');
    return { ...found, org_id: found.orgId };
  }

  frontendUrl(): string { return this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000'; }

  private oauthStateSecret(): string {
    const secret = this.config.get<string>('GOOGLE_STATE_SECRET') ?? this.config.get<string>('JWT_SECRET');
    if (!secret) throw new UnauthorizedException('OAuth state secret is not configured');
    return secret;
  }

  googleStart(): { url: string } {
    const clientId = this.config.get<string>('GOOGLE_ID');
    const callback = this.config.get<string>('GOOGLE_CALLBACK_URL');
    if (!clientId || !callback) throw new UnauthorizedException('Google sign-in is not configured');
    const state = jwt.sign({ purpose: 'google_oauth', nonce: randomBytes(16).toString('hex') }, this.oauthStateSecret(), { expiresIn: '10m' });
    const params = new URLSearchParams({ client_id: clientId, redirect_uri: callback, response_type: 'code', scope: 'openid email profile', state, access_type: 'offline', prompt: 'select_account' });
    return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` };
  }

  async googleCallback(code: string, state: string): Promise<AuthResult> {
    if (!state) throw new UnauthorizedException('Google authorization state is required');
    try {
      const decoded = jwt.verify(state, this.oauthStateSecret()) as { purpose?: string };
      if (decoded.purpose !== 'google_oauth') throw new Error('invalid state');
    } catch {
      throw new UnauthorizedException('Invalid or expired Google authorization state');
    }
    const clientId = this.config.get<string>('GOOGLE_ID');
    const clientSecret = this.config.get<string>('GOOGLE_SECRET');
    const callback = this.config.get<string>('GOOGLE_CALLBACK_URL');
    if (!clientId || !clientSecret || !callback) throw new UnauthorizedException('Google sign-in is not configured');
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: callback, grant_type: 'authorization_code' }) });
    if (!tokenResponse.ok) throw new UnauthorizedException('Google authorization failed');
    const tokens = (await tokenResponse.json()) as { access_token?: string };
    if (!tokens.access_token) throw new UnauthorizedException('Google authorization token missing');
    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    if (!profileResponse.ok) throw new UnauthorizedException('Google profile lookup failed');
    const profile = (await profileResponse.json()) as { sub?: string; email?: string; name?: string; email_verified?: boolean };
    if (!profile.sub || !profile.email || profile.email_verified !== true) throw new UnauthorizedException('Verified Google account is required');
    const email = profile.email.trim().toLowerCase();
    let user = await this.prisma.user.findFirst({ where: { googleId: profile.sub } });
    if (!user) {
      user = await this.prisma.user.findFirst({ where: { email } });
      if (user) user = await this.prisma.user.update({ where: { id: user.id }, data: { googleId: profile.sub, name: user.name ?? profile.name ?? null } });
    }
    if (!user) {
      const organization = await this.prisma.organization.create({ data: { name: `${profile.name?.trim() || email.split('@')[0]}'s Workspace` } });
      user = await this.prisma.user.create({ data: { orgId: organization.id, email, name: profile.name?.trim() || email.split('@')[0], googleId: profile.sub, role: 'MEMBER' } });
    }
    return this.issue(user);
  }

  private async issue(user: { id: string; name: string | null; email: string; orgId: string; role: string }): Promise<AuthResult> {
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret) throw new UnauthorizedException('JWT is not configured');
    const sessionId = randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const payload: AccessTokenPayload = { sub: user.id, org_id: user.orgId, email: user.email, role: user.role, jti: sessionId };
    const accessToken = jwt.sign(payload, secret, { expiresIn: '8h', jwtid: sessionId });
    await this.prisma.session.create({ data: { id: sessionId, orgId: user.orgId, userId: user.id, tokenHash: this.hashToken(accessToken), expiresAt } });
    return {
      access_token: accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        org_id: user.orgId,
        role: user.role,
      },
    };
  }

  private hashToken(value: string): string { return createHash('sha256').update(value).digest('hex'); }

  private async hash(value: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    const derived = (await scrypt(value, salt, 64)) as Buffer;
    return `${salt}:${derived.toString('hex')}`;
  }

  private async verify(value: string, stored: string): Promise<boolean> {
    const [salt, encoded] = stored.split(':');
    if (!salt || !encoded) return false;
    const expected = Buffer.from(encoded, 'hex');
    const actual = (await scrypt(value, salt, expected.length)) as Buffer;
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}