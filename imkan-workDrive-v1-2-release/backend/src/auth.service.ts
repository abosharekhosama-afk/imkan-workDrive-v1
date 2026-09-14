import { randomUUID } from 'node:crypto';
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { ConflictException, ForbiddenException, Injectable, UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { InvitationStatus, OrgRole, MembershipStatus } from '@prisma/client';
import { PrismaService } from './prisma/prisma.service';
import type { AccessTokenPayload } from './auth/jwt.types';
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
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) { }

  async signup(input: { name: string; email: string; password: string; inviteToken?: string }): Promise<AuthResult> {
    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();
    if (name.length < 2 || name.length > 120) throw new BadRequestException('Name must be between 2 and 120 characters');
    if (!email || !email.includes('@')) throw new BadRequestException('A valid email is required');
    if (input.password.length < 8) throw new BadRequestException('Password must be at least 8 characters');

    const existing = await this.prisma.user.findFirst({ where: { email } });
    const passwordHash = await this.hash(input.password);

    if (input.inviteToken) {
      const tokenHash = this.hashToken(input.inviteToken);
      const invitation = await this.prisma.organizationInvitation.findFirst({
        where: { tokenHash, email, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }
      });
      if (!invitation) throw new BadRequestException('Invitation is invalid, expired, or does not match this email');

      const user = await this.prisma.$transaction(async (tx) => {
        let createdUser = existing;
        if (!createdUser) {
          createdUser = await tx.user.create({ data: { email, name, passwordHash, status: 'ACTIVE' } });
        } else if (!createdUser.passwordHash) {
          await tx.user.update({ where: { id: createdUser.id }, data: { passwordHash, name: createdUser.name ?? name, status: 'ACTIVE' } });
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
      return this.issue(user.user, user.membership);
    }

    const organization = await this.prisma.organization.create({ data: { name: `${name}'s Workspace` } });
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({ data: { email, name, passwordHash, status: 'ACTIVE' } });

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
    return this.issue(user.user, user.membership);
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
          target = await tx.user.create({ data: { email, name, passwordHash, status: 'ACTIVE' } });
        } else if (!target.passwordHash) {
          target = await tx.user.update({
            where: { id: target.id },
            data: { passwordHash, name: target.name ?? name },
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

  async login(input: { email: string; password: string; organizationId?: string }): Promise<AuthResult> {
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({ where: { email } });
    if (!user?.passwordHash || user.status !== 'ACTIVE' || !(await this.verify(input.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    let membership;
    if (input.organizationId) {
      membership = await this.prisma.organizationMembership.findFirst({
        where: { userId: user.id, organizationId: input.organizationId, status: MembershipStatus.ACTIVE },
      });
      if (!membership) throw new UnauthorizedException('No active membership in the specified organization');
    } else {
      membership = await this.prisma.organizationMembership.findFirst({
        where: { userId: user.id, isPrimary: true, status: MembershipStatus.ACTIVE },
        orderBy: { joinedAt: 'desc' },
      });
      if (!membership) {
        membership = await this.prisma.organizationMembership.findFirst({
          where: { userId: user.id, status: MembershipStatus.ACTIVE },
          orderBy: { joinedAt: 'desc' },
        });
      }
    }

    if (!membership) throw new UnauthorizedException('No active organization membership found');

    await this.prisma.user.update({ where: { id: user.id }, data: { currentOrganizationId: membership.organizationId, lastLoginAt: new Date() } });

    return this.issue(user, membership);
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
    const updated = await this.prisma.user.update({ where: { id: user.sub }, data: { name }, select: { id: true, name: true, email: true, status: true, avatarUrl: true } });
    return { ...updated };
  }

  async changePassword(user: AccessTokenPayload, currentPassword: string, newPassword: string) {
    if (newPassword.length < 10) throw new BadRequestException('New password must be at least 10 characters');
    const found = await this.prisma.user.findFirst({ where: { id: user.sub } });
    if (!found?.passwordHash || !(await this.verify(currentPassword, found.passwordHash))) throw new UnauthorizedException('Current password is incorrect');
    const passwordHash = await this.hash(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: found.id }, data: { passwordHash } }),
      this.prisma.session.updateMany({ where: { userId: found.id, orgId: user.org_id, revokedAt: null, id: { not: user.jti ?? '' } }, data: { revokedAt: new Date() } }),
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
      if (user) user = await this.prisma.user.update({ where: { id: user.id }, data: { googleId: profile.sub, name: user.name ?? profile.name ?? null } });
    }
    if (!user) {
      const organization = await this.prisma.organization.create({ data: { name: `${profile.name?.trim() || email.split('@')[0]}'s Workspace` } });
      const result = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({ data: { email, name: profile.name?.trim() || email.split('@')[0], googleId: profile.sub, status: 'ACTIVE' } });
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
      await this.prisma.user.update({ where: { id: user.id }, data: { currentOrganizationId: membership.organizationId } });
      return this.issue(user, membership);
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { currentOrganizationId: primaryMembership.organizationId, lastLoginAt: new Date() } });
    return this.issue(user, primaryMembership);
  }

  private async issue(user: { id: string; name: string | null; email: string }, membership: MembershipInfo): Promise<AuthResult> {
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret) throw new UnauthorizedException('JWT is not configured');

    const sessionId = randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);

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

    await this.prisma.session.create({ data: { id: sessionId, orgId: membership.organizationId, userId: user.id, tokenHash: this.hashToken(accessToken), expiresAt } });

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