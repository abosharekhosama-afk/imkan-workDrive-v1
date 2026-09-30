import { randomUUID } from 'node:crypto';
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { ConflictException, ForbiddenException, Injectable, UnauthorizedException, BadRequestException, NotFoundException, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { InvitationStatus, OrgRole, MembershipStatus, EmailOtpPurpose, Prisma } from '@prisma/client';
import { PrismaService } from './prisma/prisma.service';
import type { AccessTokenPayload } from './auth/jwt.types';
import { MailService } from './mail/mail.service';
import { passwordResetEmail, verificationCodeEmail } from './mail/email-templates';
import {
  OTP_MAX_ATTEMPTS,
  OTP_TTL_MS,
  OTP_WINDOW_LIMIT,
  OTP_WINDOW_MS,
  generateOtpCode,
  hashOtpCode,
  loginDelivery,
  maskEmail,
  otpCodesMatch,
  type OtpChallengeResult,
  type OtpPurpose,
} from './mail/otp-logic';
import {
  ACCOUNT_CREATION_ERROR_CODE,
  SUPER_ADMIN_ONLY_MESSAGE,
} from './auth/super-admin.guard';

const scrypt = promisify(scryptCallback);

type AuthResult = {
  access_token: string;
  user: { id: string; name: string | null; email: string; org_id: string; role: string; membershipId: string };
};

type MembershipInfo = {
  id: string;
  organizationId: string;
  role: OrgRole;
  status: MembershipStatus;
};

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, private readonly mail: MailService) { }

  async signup(input: { name: string; email: string; password: string; inviteToken?: string }): Promise<OtpChallengeResult> {
    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();
    if (name.length < 2 || name.length > 120) throw new BadRequestException('Name must be between 2 and 120 characters');
    if (!email || !email.includes('@')) throw new BadRequestException('A valid email is required');
    if (input.password.length < 8) throw new BadRequestException('Password must be at least 8 characters');

    const existing = await this.prisma.user.findFirst({ where: { email } });
    if (!input.inviteToken && existing) throw new ConflictException('This email is already registered');
    const passwordHash = await this.hash(input.password);

    if (input.inviteToken) {
      const tokenHash = this.hashToken(input.inviteToken);
      const invitation = await this.prisma.organizationInvitation.findFirst({
        where: { tokenHash, email, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }
      });
      if (!invitation) throw new BadRequestException('Invitation is invalid, expired, or does not match this email');
    }

    return this.issueEmailOtp({
      email,
      purpose: 'SIGNUP',
      userId: existing?.id,
      payload: { name, passwordHash, ...(input.inviteToken ? { inviteToken: input.inviteToken } : {}) },
      action: 'Confirm your email to create your IMKAN WorkDrive account.',
    });
  }

  async verifySignupOtp(input: { challengeId: string; code: string }, context?: { ipAddress?: string; userAgent?: string }): Promise<AuthResult> {
    const challenge = await this.consumeOtp(input.challengeId, input.code, [EmailOtpPurpose.SIGNUP]);
    const payload = this.readSignupPayload(challenge.payload);
    return this.finalizeSignup(challenge.email, payload, context);
  }

  private async finalizeSignup(
    email: string,
    input: { name: string; passwordHash: string; inviteToken?: string },
    context?: { ipAddress?: string; userAgent?: string },
  ): Promise<AuthResult> {
    const name = input.name;
    const passwordHash = input.passwordHash;
    const existing = await this.prisma.user.findFirst({ where: { email } });
    if (input.inviteToken) {
      const tokenHash = this.hashToken(input.inviteToken);
      const invitation = await this.prisma.organizationInvitation.findFirst({
        where: { tokenHash, email, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      });
      if (!invitation) throw new BadRequestException('Invitation is invalid, expired, or does not match this email');

      const user = await this.prisma.$transaction(async (tx) => {
        let createdUser = existing;
        if (!createdUser) {
          createdUser = await tx.user.create({ data: { email, name, passwordHash, status: 'ACTIVE', emailVerifiedAt: new Date() } });
        } else if (!createdUser.passwordHash) {
          await tx.user.update({ where: { id: createdUser.id }, data: { passwordHash, name: createdUser.name ?? name, status: 'ACTIVE', emailVerifiedAt: createdUser.emailVerifiedAt ?? new Date() } });
        } else if (!createdUser.emailVerifiedAt) {
          await tx.user.update({ where: { id: createdUser.id }, data: { emailVerifiedAt: new Date() } });
        }

        const membership = await tx.organizationMembership.create({
          data: {
            userId: createdUser.id,
            organizationId: invitation.orgId,
            role: invitation.role,
            status: MembershipStatus.ACTIVE,
            invitedById: invitation.invitedById,
            isPrimary: !(await tx.organizationMembership.count({ where: { userId: createdUser.id } })),
          },
        });

        await tx.organizationInvitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date(), status: InvitationStatus.ACCEPTED } });
        await tx.auditLog.create({ data: { orgId: invitation.orgId, actorId: createdUser.id, action: 'ORG_INVITATION_ACCEPTED', resourceType: 'ORGANIZATION_INVITATION', resourceId: invitation.id } });

        await this.createPersonalFolder(tx, createdUser.id, membership.id, invitation.orgId);

        return { user: createdUser, membership };
      });
      return this.issue(user.user, user.membership, context);
    }

    if (existing) throw new ConflictException('This email is already registered');
    const organization = await this.prisma.organization.create({ data: { name: `${name}'s Workspace` } });
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({ data: { email, name, passwordHash, status: 'ACTIVE', emailVerifiedAt: new Date() } });

      const membership = await tx.organizationMembership.create({
        data: {
          userId: created.id,
          organizationId: organization.id,
          role: OrgRole.SUPER_ADMIN,
          status: MembershipStatus.ACTIVE,
          isPrimary: true,
        },
      });

      await tx.organization.update({ where: { id: organization.id }, data: { ownerId: created.id } });

      await this.createPersonalFolder(tx, created.id, membership.id, organization.id);

      return { user: created, membership };
    });
    return this.issue(user.user, user.membership, context);
  }

  /**
   * Creates a brand-new user account inside the actor's current organization.
   *
   * RBAC contract: only an organization Super Admin may create accounts
   * ("يُسمح فقط للسوبر أدمن بإنشاء حسابات جديدة داخل المنظمة"). The guard on
   * the route enforces this at the edge; this method re-checks defensively so
   * the rule cannot be bypassed by calling the service layer directly.
   */
  async createUserAccount(
    actor: AccessTokenPayload,
    input: { name: string; email: string; password: string; role?: 'ADMIN' | 'MEMBER' },
  ): Promise<{ id: string; email: string; name: string | null; role: OrgRole }> {
    if (actor.role !== OrgRole.SUPER_ADMIN) {
      throw new ForbiddenException({
        statusCode: 403,
        code: ACCOUNT_CREATION_ERROR_CODE,
        message: SUPER_ADMIN_ONLY_MESSAGE,
      });
    }

    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();
    const role = input.role ?? OrgRole.MEMBER;

    const existingUser = await this.prisma.user.findFirst({ where: { email } });
    if (existingUser) {
      const activeMembership = await this.prisma.organizationMembership.findFirst({
        where: { userId: existingUser.id, organizationId: actor.org_id, status: MembershipStatus.ACTIVE },
        select: { id: true },
      });
      if (activeMembership) {
        throw new ConflictException({
          statusCode: 409,
          code: 'ACCOUNT_EXISTS',
          message: 'This email already belongs to an active member of the organization',
        });
      }
    }

    const passwordHash = await this.hash(input.password);
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        let target = existingUser;
        if (!target) {
          target = await tx.user.create({ data: { email, name, passwordHash, status: 'ACTIVE', emailVerifiedAt: new Date() } });
        } else if (!target.passwordHash) {
          target = await tx.user.update({
            where: { id: target.id },
            data: { passwordHash, name: target.name ?? name, emailVerifiedAt: target.emailVerifiedAt ?? new Date() },
          });
        }

        const membership = await tx.organizationMembership.create({
          data: {
            userId: target.id,
            organizationId: actor.org_id,
            role,
            status: MembershipStatus.ACTIVE,
            invitedById: actor.sub,
            isPrimary: !(await tx.organizationMembership.count({ where: { userId: target.id } })),
          },
        });

        await tx.auditLog.create({
          data: {
            orgId: actor.org_id,
            actorId: actor.sub,
            action: 'USER_ACCOUNT_CREATED',
            resourceType: 'USER',
            resourceId: target.id,
          },
        });

        await this.createPersonalFolder(tx, target.id, membership.id, actor.org_id);

        return target;
      });

      return { id: result.id, email: result.email, name: result.name, role };
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        (error as { code?: unknown }).code === 'P2002'
      ) {
        throw new ConflictException({
          statusCode: 409,
          code: 'ACCOUNT_EXISTS',
          message: 'This email is already registered',
        });
      }
      throw error;
    }
  }

  private async createPersonalFolder(tx: any, userId: string, membershipId: string, orgId: string) {
    const personalFolder = await tx.folder.create({
      data: {
        name: 'My Folder',
        orgId,
        ownerId: userId,
        folderType: 'PERSONAL',
      },
    });

    await tx.organizationMembership.update({
      where: { id: membershipId },
      data: { personalFolderId: personalFolder.id },
    });
  }

  async login(input: { email: string; password: string; organizationId?: string }, context?: { ipAddress?: string; userAgent?: string }): Promise<AuthResult | OtpChallengeResult> {
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({ where: { email } });
    if (!user?.passwordHash || user.status !== 'ACTIVE' || !(await this.verify(input.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const membership = await this.requireActiveMembership(user.id, input.organizationId);
    if (loginDelivery({ hasAccount: true, method: 'password' }) === 'otp') {
      return this.issueEmailOtp({
        email,
        purpose: 'LOGIN',
        userId: user.id,
        payload: input.organizationId ? { organizationId: input.organizationId } : undefined,
        action: 'Use this code to finish signing in to IMKAN WorkDrive.',
      });
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { currentOrganizationId: membership.organizationId, lastLoginAt: new Date(), emailVerifiedAt: user.emailVerifiedAt ?? new Date() },
    });
    const result = await this.issue(user, membership, context);
    await this.prisma.securityEvent.create({ data: { orgId: membership.organizationId, userId: user.id, severity: 'INFO', eventType: 'LOGIN_SUCCESS', ipAddress: context?.ipAddress, metadata: { userAgent: context?.userAgent?.slice(0, 180), method: 'PASSWORD' } } });
    return result;
  }

  async requestPasswordlessOtp(emailInput: string): Promise<OtpChallengeResult> {
    const email = emailInput.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({ where: { email, status: 'ACTIVE' } });
    if (!user) throw new NotFoundException('No account was found for this email');
    await this.requireActiveMembership(user.id);
    return this.issueEmailOtp({
      email,
      purpose: 'PASSWORDLESS',
      userId: user.id,
      action: 'Use this code to sign in to IMKAN WorkDrive.',
    });
  }

  async verifyLoginOtp(input: { challengeId: string; code: string }, context?: { ipAddress?: string; userAgent?: string }): Promise<AuthResult> {
    const challenge = await this.consumeOtp(input.challengeId, input.code, [EmailOtpPurpose.LOGIN, EmailOtpPurpose.PASSWORDLESS]);
    if (!challenge.userId) throw new UnauthorizedException('The verification code is invalid or expired');
    const user = await this.prisma.user.findFirst({ where: { id: challenge.userId, status: 'ACTIVE' } });
    if (!user) throw new UnauthorizedException('The verification code is invalid or expired');
    const membership = await this.requireActiveMembership(user.id, this.readOrganizationId(challenge.payload));
    await this.prisma.user.update({ where: { id: user.id }, data: { currentOrganizationId: membership.organizationId, lastLoginAt: new Date(), emailVerifiedAt: user.emailVerifiedAt ?? new Date() } });
    const result = await this.issue(user, membership, context);
    await this.prisma.securityEvent.create({ data: { orgId: membership.organizationId, userId: user.id, severity: 'INFO', eventType: 'LOGIN_SUCCESS', ipAddress: context?.ipAddress, metadata: { userAgent: context?.userAgent, method: challenge.purpose } } });
    return result;
  }

  async resendOtp(challengeId: string): Promise<OtpChallengeResult> {
    const row = await this.prisma.emailOtpChallenge.findFirst({ where: { id: challengeId } });
    if (!row || row.usedAt) throw new BadRequestException('This verification request is no longer active');
    if (row.createdAt.getTime() < Date.now() - 30 * 60 * 1000) throw new BadRequestException('Request a new verification code from the sign-in page');
    const action = row.purpose === EmailOtpPurpose.SIGNUP
      ? 'Confirm your email to create your IMKAN WorkDrive account.'
      : 'Use this code to finish signing in to IMKAN WorkDrive.';
    return this.issueEmailOtp({
      email: row.email,
      purpose: row.purpose,
      userId: row.userId ?? undefined,
      payload: row.payload === null ? undefined : row.payload as Prisma.InputJsonValue,
      action,
    });
  }

  async switchOrganization(user: AccessTokenPayload, organizationId: string): Promise<AuthResult> {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { userId: user.sub, organizationId, status: MembershipStatus.ACTIVE },
    });
    if (!membership) throw new NotFoundException('No active membership in the specified organization');

    await this.prisma.user.update({ where: { id: user.sub }, data: { currentOrganizationId: organizationId } });

    const fullUser = await this.prisma.user.findFirst({ where: { id: user.sub } });
    return this.issue(fullUser!, membership);
  }

  async getUserMemberships(userId: string) {
    return this.prisma.organizationMembership.findMany({
      where: { userId, status: MembershipStatus.ACTIVE },
      include: { organization: { select: { id: true, name: true } } },
      orderBy: { joinedAt: 'desc' },
    });
  }

  async logout(user: AccessTokenPayload) {
    if (user.jti) {
      await this.prisma.session.updateMany({ where: { id: user.jti, userId: user.sub, orgId: user.org_id, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.prisma.securityEvent.create({ data: { orgId: user.org_id, userId: user.sub, severity: 'INFO', eventType: 'LOGOUT', resourceType: 'SESSION', resourceId: user.jti } });
    }
    return { ok: true };
  }

  async logoutAll(user: AccessTokenPayload) {
    await this.prisma.session.updateMany({ where: { userId: user.sub, orgId: user.org_id, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.prisma.securityEvent.create({ data: { orgId: user.org_id, userId: user.sub, severity: 'INFO', eventType: 'LOGOUT_ALL' } });
    return { ok: true };
  }

  async forgotPassword(emailInput: string) {
    const email = emailInput.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({ where: { email } });
    if (!user) return { ok: true };
    const raw = randomBytes(32).toString('hex');
    await this.prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: this.hashToken(raw), expiresAt: new Date(Date.now() + 30 * 60 * 1000) } });
    const link = `${this.frontendUrl()}/auth/reset-password?token=${encodeURIComponent(raw)}`;
    const message = passwordResetEmail({ link });
    const sent = await this.mail.send({ to: email, ...message });
    return { ok: true, reset_token: !sent.delivered && this.config.get('NODE_ENV') !== 'production' ? raw : undefined };
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
    const rows = await this.prisma.session.findMany({ where: { userId: user.sub, orgId: user.org_id, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: 'desc' }, select: { id: true, createdAt: true, lastSeenAt: true, expiresAt: true, ipAddress: true, userAgent: true, deviceId: true } });
    return rows.map((row) => ({ ...row, isCurrent: row.id === user.jti }));
  }

  async securityEvents(user: AccessTokenPayload) {
    return this.prisma.securityEvent.findMany({ where: { orgId: user.org_id, userId: user.sub }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, severity: true, eventType: true, ipAddress: true, metadata: true, createdAt: true } });
  }

  async revokeSession(user: AccessTokenPayload, id: string) {
    await this.prisma.session.updateMany({ where: { id, userId: user.sub, orgId: user.org_id, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.prisma.securityEvent.create({ data: { orgId: user.org_id, userId: user.sub, severity: 'INFO', eventType: 'SESSION_REVOKED', resourceType: 'SESSION', resourceId: id } });
    return { ok: true };
  }

  async updateProfile(user: AccessTokenPayload, nameInput: string) {
    const name = nameInput.trim();
    if (name.length < 2 || name.length > 120) throw new BadRequestException('Name must be between 2 and 120 characters');
    const updated = await this.prisma.user.update({ where: { id: user.sub }, data: { name }, select: { id: true, name: true, email: true, status: true, avatarUrl: true } });
    return { ...updated };
  }

  async preferences(user: AccessTokenPayload) {
    const found = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: { id: true, name: true, email: true, avatarUrl: true, themeMode: true, themeColor: true, fontFamily: true, lighterSidebar: true },
    });
    if (!found) throw new UnauthorizedException('Session is no longer valid');
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { userId: user.sub, organizationId: user.org_id, status: MembershipStatus.ACTIVE },
      select: { role: true },
    });
    if (!membership) throw new UnauthorizedException('Session is no longer valid');
    return { ...found, role: membership.role, organizationId: user.org_id };
  }

  async updatePreferences(user: AccessTokenPayload, input: { themeMode?: string; themeColor?: string; fontFamily?: string; lighterSidebar?: boolean }) {
    const allowedModes = new Set(['light', 'dark', 'system']);
    const allowedColors = new Set(['blue', 'green', 'red', 'yellow']);
    const allowedFonts = new Set(['Zoho Puvi', 'Lato', 'Roboto', 'PT Sans', 'Arial']);
    if (input.themeMode !== undefined && !allowedModes.has(input.themeMode)) throw new BadRequestException('Invalid theme mode');
    if (input.themeColor !== undefined && !allowedColors.has(input.themeColor)) throw new BadRequestException('Invalid theme color');
    if (input.fontFamily !== undefined && !allowedFonts.has(input.fontFamily)) throw new BadRequestException('Invalid font family');
    if (input.lighterSidebar !== undefined && typeof input.lighterSidebar !== 'boolean') throw new BadRequestException('Invalid sidebar preference');
    const updated = await this.prisma.user.update({
      where: { id: user.sub },
      data: {
        ...(input.themeMode !== undefined ? { themeMode: input.themeMode } : {}),
        ...(input.themeColor !== undefined ? { themeColor: input.themeColor } : {}),
        ...(input.fontFamily !== undefined ? { fontFamily: input.fontFamily } : {}),
        ...(input.lighterSidebar !== undefined ? { lighterSidebar: input.lighterSidebar } : {}),
      },
      select: { id: true, name: true, email: true, avatarUrl: true, themeMode: true, themeColor: true, fontFamily: true, lighterSidebar: true },
    });
    return updated;
  }

  async changePassword(user: AccessTokenPayload, currentPassword: string, newPassword: string) {
    if (newPassword.length < 10) throw new BadRequestException('New password must be at least 10 characters');
    const found = await this.prisma.user.findFirst({ where: { id: user.sub } });
    if (!found?.passwordHash || !(await this.verify(currentPassword, found.passwordHash))) throw new UnauthorizedException('Current password is incorrect');
    const passwordHash = await this.hash(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: found.id }, data: { passwordHash } }),
      this.prisma.session.updateMany({ where: { userId: found.id, orgId: user.org_id, revokedAt: null, id: { not: user.jti ?? '' } }, data: { revokedAt: new Date() } }),
      this.prisma.securityEvent.create({ data: { orgId: user.org_id, userId: user.sub, severity: 'WARNING', eventType: 'PASSWORD_CHANGED' } }),
    ]);
    return { ok: true };
  }

  async me(user: AccessTokenPayload) {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId: user.sub,
        organizationId: user.org_id,
        status: MembershipStatus.ACTIVE,
      },
      select: { id: true, role: true, status: true },
    });
    
    if (!membership) throw new UnauthorizedException('Session is no longer valid');

    const found = await this.prisma.user.findFirst({
      where: { id: user.sub },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        avatarUrl: true,
        currentOrganizationId: true,
      },
    });

    if (!found) throw new UnauthorizedException('Session is no longer valid');

    return {
      ...found,
      org_id: user.org_id,
      role: membership.role,
      membershipId: membership.id,
      membershipStatus: membership.status,
    };
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
      if (user) user = await this.prisma.user.update({ where: { id: user.id }, data: { googleId: profile.sub, name: user.name ?? profile.name ?? null, emailVerifiedAt: user.emailVerifiedAt ?? new Date() } });
    }
    if (!user) {
      const organization = await this.prisma.organization.create({ data: { name: `${profile.name?.trim() || email.split('@')[0]}'s Workspace` } });
      const result = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({ data: { email, name: profile.name?.trim() || email.split('@')[0], googleId: profile.sub, status: 'ACTIVE', emailVerifiedAt: new Date() } });
        const membership = await tx.organizationMembership.create({
          data: { userId: created.id, organizationId: organization.id, role: OrgRole.MEMBER, status: MembershipStatus.ACTIVE, isPrimary: true },
        });
        await tx.organization.update({ where: { id: organization.id }, data: { ownerId: created.id } });
        await this.createPersonalFolder(tx, created.id, membership.id, organization.id);
        return { user: created, membership };
      });
      return this.issue(result.user, result.membership);
    }

    const primaryMembership = await this.prisma.organizationMembership.findFirst({
      where: { userId: user.id, isPrimary: true, status: MembershipStatus.ACTIVE },
    });
    if (!primaryMembership) {
      const membership = await this.prisma.organizationMembership.findFirst({
        where: { userId: user.id, status: MembershipStatus.ACTIVE },
        orderBy: { joinedAt: 'desc' },
      });
      if (!membership) throw new UnauthorizedException('No active organization membership');
      await this.prisma.user.update({ where: { id: user.id }, data: { currentOrganizationId: membership.organizationId, emailVerifiedAt: user.emailVerifiedAt ?? new Date() } });
      return this.issue(user, membership);
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { currentOrganizationId: primaryMembership.organizationId, lastLoginAt: new Date(), emailVerifiedAt: user.emailVerifiedAt ?? new Date() } });
    return this.issue(user, primaryMembership);
  }

  async issueOAuthResumeCode(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, currentOrganizationId: true } });
    if (!user) throw new UnauthorizedException('User not found');
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { userId: user.id, status: MembershipStatus.ACTIVE, ...(user.currentOrganizationId ? { organizationId: user.currentOrganizationId } : {}) },
    });
    if (!membership) throw new UnauthorizedException('No active organization membership');
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret) throw new UnauthorizedException('JWT is not configured');
    return jwt.sign({ purpose: 'oauth_resume', sub: user.id, org_id: membership.organizationId, jti: randomUUID() }, secret, { expiresIn: '90s' });
  }

  async redeemOAuthResumeCode(code: string): Promise<AuthResult> {
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret) throw new UnauthorizedException('JWT is not configured');
    let payload: jwt.JwtPayload;
    try { payload = jwt.verify(code, secret) as jwt.JwtPayload; } catch { throw new UnauthorizedException('Resume code is invalid'); }
    if (payload.purpose !== 'oauth_resume' || typeof payload.sub !== 'string' || typeof payload.org_id !== 'string' || typeof payload.jti !== 'string') {
      throw new UnauthorizedException('Resume code is invalid');
    }
    try {
      await this.prisma.session.create({ data: { id: payload.jti, orgId: payload.org_id, userId: payload.sub, tokenHash: this.hashToken(code), expiresAt: new Date(Date.now() + 90_000), revokedAt: new Date() } });
    } catch {
      throw new UnauthorizedException('Resume code was already used');
    }
    return this.issueForUserId(payload.sub);
  }

  async issueForUserId(userId: string): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, currentOrganizationId: true } });
    if (!user) throw new UnauthorizedException('User not found');
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { userId: user.id, status: MembershipStatus.ACTIVE, ...(user.currentOrganizationId ? { organizationId: user.currentOrganizationId } : {}) },
      orderBy: { joinedAt: 'desc' },
    });
    if (!membership) throw new UnauthorizedException('No active organization membership');
    return this.issue(user, membership, { userAgent: 'oauth-return' });
  }

  private async requireActiveMembership(userId: string, organizationId?: string) {
    if (organizationId) {
      const membership = await this.prisma.organizationMembership.findFirst({
        where: { userId, organizationId, status: MembershipStatus.ACTIVE },
      });
      if (!membership) throw new UnauthorizedException('No active membership in the specified organization');
      return membership;
    }
    const primary = await this.prisma.organizationMembership.findFirst({
      where: { userId, isPrimary: true, status: MembershipStatus.ACTIVE },
      orderBy: { joinedAt: 'desc' },
    });
    if (primary) return primary;
    const fallback = await this.prisma.organizationMembership.findFirst({
      where: { userId, status: MembershipStatus.ACTIVE },
      orderBy: { joinedAt: 'desc' },
    });
    if (!fallback) throw new UnauthorizedException('No active organization membership found');
    return fallback;
  }

  private otpPepper(): string {
    return this.config.get<string>('JWT_SECRET') ?? 'imkan-otp';
  }

  private async issueEmailOtp(input: {
    email: string;
    purpose: OtpPurpose;
    userId?: string;
    payload?: Prisma.InputJsonValue;
    action: string;
  }): Promise<OtpChallengeResult> {
    const since = new Date(Date.now() - OTP_WINDOW_MS);
    const recent = await this.prisma.emailOtpChallenge.count({
      where: { email: input.email, purpose: input.purpose, createdAt: { gt: since } },
    });
    if (recent >= OTP_WINDOW_LIMIT) throw new HttpException('Too many verification codes. Try again in a few minutes.', 429);
    const code = generateOtpCode();
    const id = randomUUID();
    await this.prisma.$transaction([
      this.prisma.emailOtpChallenge.updateMany({
        where: { email: input.email, purpose: input.purpose, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.emailOtpChallenge.create({
        data: {
          id,
          email: input.email,
          userId: input.userId ?? null,
          purpose: input.purpose,
          codeHash: hashOtpCode(code, this.otpPepper()),
          payload: input.payload,
          expiresAt: new Date(Date.now() + OTP_TTL_MS),
        },
      }),
    ]);
    const rendered = verificationCodeEmail({ code, minutes: Math.round(OTP_TTL_MS / 60_000), action: input.action });
    const sent = await this.mail.send({ to: input.email, ...rendered });
    return {
      otp_required: true,
      challenge_id: id,
      masked_email: maskEmail(input.email),
      expires_in: Math.floor(OTP_TTL_MS / 1000),
      purpose: input.purpose,
      ...(!sent.delivered && this.config.get('NODE_ENV') !== 'production' ? { dev_code: code } : {}),
    };
  }

  private async consumeOtp(challengeId: string, code: string, purposes: EmailOtpPurpose[]) {
    const row = await this.prisma.emailOtpChallenge.findFirst({ where: { id: challengeId } });
    if (!row || row.usedAt || row.expiresAt.getTime() <= Date.now() || !purposes.includes(row.purpose)) {
      throw new UnauthorizedException('The verification code is invalid or expired');
    }
    if (row.attempts >= OTP_MAX_ATTEMPTS) throw new UnauthorizedException('Too many incorrect codes. Request a new one.');
    if (!otpCodesMatch(code, row.codeHash, this.otpPepper())) {
      const attempts = row.attempts + 1;
      await this.prisma.emailOtpChallenge.update({
        where: { id: row.id },
        data: { attempts, ...(attempts >= OTP_MAX_ATTEMPTS ? { usedAt: new Date() } : {}) },
      });
      throw new UnauthorizedException('The verification code is incorrect');
    }
    await this.prisma.emailOtpChallenge.update({ where: { id: row.id }, data: { usedAt: new Date() } });
    return row;
  }

  private readSignupPayload(value: Prisma.JsonValue): { name: string; passwordHash: string; inviteToken?: string } {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Signup challenge is invalid');
    const row = value as Record<string, Prisma.JsonValue>;
    if (typeof row.name !== 'string' || typeof row.passwordHash !== 'string') throw new BadRequestException('Signup challenge is invalid');
    return { name: row.name, passwordHash: row.passwordHash, inviteToken: typeof row.inviteToken === 'string' ? row.inviteToken : undefined };
  }

  private readOrganizationId(value: Prisma.JsonValue): string | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const id = (value as Record<string, Prisma.JsonValue>).organizationId;
    return typeof id === 'string' ? id : undefined;
  }

  private async issue(user: { id: string; name: string | null; email: string }, membership: MembershipInfo, context?: { ipAddress?: string; userAgent?: string }): Promise<AuthResult> {
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret) throw new UnauthorizedException('JWT is not configured');

    const sessionId = randomUUID();
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const userAgent = context?.userAgent?.replace(/\s+/g, ' ').trim().slice(0, 180) || null;

    const payload: AccessTokenPayload = {
      sub: user.id,
      org_id: membership.organizationId,
      email: user.email,
      role: membership.role,
      membershipId: membership.id,
      membershipStatus: membership.status,
      jti: sessionId
    };

    const accessToken = jwt.sign(payload, secret, { expiresIn: '8h' });

    const deviceId = randomUUID();
    await this.prisma.$transaction([
      this.prisma.userDevice.create({ data: { id: deviceId, orgId: membership.organizationId, userId: user.id, name: userAgent?.slice(0, 120) || 'Web browser', platform: userAgent?.slice(0, 80), lastSeenAt: new Date() } }),
      this.prisma.session.create({ data: { id: sessionId, orgId: membership.organizationId, userId: user.id, tokenHash: this.hashToken(accessToken), expiresAt, ipAddress: context?.ipAddress?.slice(0, 64) ?? null, userAgent, deviceId } }),
    ]);

    return {
      access_token: accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        org_id: membership.organizationId,
        role: membership.role,
        membershipId: membership.id,
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