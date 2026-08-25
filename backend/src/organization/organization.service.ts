import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { InvitationStatus, OrgRole } from '@prisma/client';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OrganizationService {
  constructor(private readonly prisma: PrismaService) {}

  private assertAdmin(user: AccessTokenPayload) {
    if (user.role !== OrgRole.ADMIN) throw new ForbiddenException('Organization admin access required');
  }

  async get(user: AccessTokenPayload) {
    const org = await this.prisma.organization.findUnique({ where: { id: user.org_id }, select: { id: true, name: true, createdAt: true } });
    if (!org) throw new NotFoundException('Organization not found');
    const [members, pendingInvitations] = await Promise.all([
      this.prisma.user.count({ where: { orgId: user.org_id } }),
      this.prisma.organizationInvitation.count({ where: { orgId: user.org_id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } }),
    ]);
    return { ...org, members, pendingInvitations, role: user.role };
  }

  async update(user: AccessTokenPayload, input: { name: string }) {
    this.assertAdmin(user);
    return this.prisma.organization.update({ where: { id: user.org_id }, data: { name: input.name }, select: { id: true, name: true, createdAt: true } });
  }

  async members(user: AccessTokenPayload) {
    const rows = await this.prisma.user.findMany({ where: { orgId: user.org_id }, select: { id: true, name: true, email: true, role: true, createdAt: true }, orderBy: { createdAt: 'asc' } });
    return rows;
  }

  async updateMemberRole(user: AccessTokenPayload, targetId: string, role: OrgRole) {
    this.assertAdmin(user);
    const target = await this.prisma.user.findFirst({ where: { id: targetId, orgId: user.org_id } });
    if (!target) throw new NotFoundException('Member not found');
    if (target.id === user.sub && role !== OrgRole.ADMIN) throw new ForbiddenException('You cannot remove your own organization admin role');
    if (target.role === OrgRole.ADMIN && role !== OrgRole.ADMIN) {
      const admins = await this.prisma.user.count({ where: { orgId: user.org_id, role: OrgRole.ADMIN } });
      if (admins <= 1) throw new ForbiddenException('Cannot remove the last organization admin');
    }
    await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'ORG_MEMBER_ROLE_CHANGED', resourceType: 'USER', resourceId: target.id } });
    return this.prisma.user.update({ where: { id: target.id }, data: { role }, select: { id: true, name: true, email: true, role: true, createdAt: true } });
  }

  async removeMember(user: AccessTokenPayload, targetId: string) {
    this.assertAdmin(user);
    if (targetId === user.sub) throw new ForbiddenException('You cannot remove yourself from the organization');
    const target = await this.prisma.user.findFirst({ where: { id: targetId, orgId: user.org_id } });
    if (!target) throw new NotFoundException('Member not found');
    if (target.role === OrgRole.ADMIN) {
      const admins = await this.prisma.user.count({ where: { orgId: user.org_id, role: OrgRole.ADMIN } });
      if (admins <= 1) throw new ForbiddenException('Cannot remove the last organization admin');
    }
    await this.prisma.$transaction([
      this.prisma.session.updateMany({ where: { userId: target.id, orgId: user.org_id, revokedAt: null }, data: { revokedAt: new Date() } }),
      this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'ORG_MEMBER_REMOVED', resourceType: 'USER', resourceId: target.id } }),
      this.prisma.user.delete({ where: { id: target.id } }),
    ]);
    return { id: targetId, deleted: true };
  }

  async invite(user: AccessTokenPayload, email: string, role: OrgRole) {
    this.assertAdmin(user);
    const existing = await this.prisma.user.findFirst({ where: { orgId: user.org_id, email } });
    if (existing) throw new ConflictException('User is already a member of this organization');
    const active = await this.prisma.organizationInvitation.findFirst({ where: { orgId: user.org_id, email, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } });
    if (active) throw new ConflictException('An active invitation already exists for this email');
    const raw = randomBytes(32).toString('hex');
    const invitation = await this.prisma.organizationInvitation.create({ data: { orgId: user.org_id, email, role, tokenHash: this.hash(raw), invitedById: user.sub, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }, include: { organization: { select: { name: true } } } });
    await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'ORG_INVITATION_CREATED', resourceType: 'ORGANIZATION_INVITATION', resourceId: invitation.id } });
    const base = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    return { id: invitation.id, email, role, expiresAt: invitation.expiresAt, inviteUrl: `${base}/organization/invitations/accept?token=${raw}` };
  }

  async invitations(user: AccessTokenPayload) {
    this.assertAdmin(user);
    return this.prisma.organizationInvitation.findMany({ where: { orgId: user.org_id }, select: { id: true, email: true, role: true, expiresAt: true, acceptedAt: true, revokedAt: true, createdAt: true, invitedBy: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'desc' } });
  }

  async revokeInvitation(user: AccessTokenPayload, id: string) {
    this.assertAdmin(user);
    const invitation = await this.prisma.organizationInvitation.findFirst({ where: { id, orgId: user.org_id, acceptedAt: null, revokedAt: null } });
    if (!invitation) throw new NotFoundException('Invitation not found');
    await this.prisma.organizationInvitation.update({ where: { id }, data: { revokedAt: new Date(), status: InvitationStatus.REVOKED } });
    await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'ORG_INVITATION_REVOKED', resourceType: 'ORGANIZATION_INVITATION', resourceId: id } });
    return { id, revoked: true };
  }

  async accept(user: AccessTokenPayload, rawToken: string) {
    const invitation = await this.prisma.organizationInvitation.findFirst({ where: { tokenHash: this.hash(rawToken), acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } });
    if (!invitation) throw new NotFoundException('Invitation is invalid or expired');
    if (invitation.email !== user.email.toLowerCase()) throw new ForbiddenException('This invitation belongs to a different email address');
    if (user.org_id !== invitation.orgId) throw new ForbiddenException('The current account already belongs to another organization');
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.sub }, data: { role: invitation.role } }),
      this.prisma.organizationInvitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date(), status: InvitationStatus.ACCEPTED } }),
      this.prisma.auditLog.create({ data: { orgId: invitation.orgId, actorId: user.sub, action: 'ORG_INVITATION_ACCEPTED', resourceType: 'ORGANIZATION_INVITATION', resourceId: invitation.id } }),
    ]);
    return { accepted: true, organizationId: invitation.orgId, role: invitation.role };
  }

  async validateInvitation(rawToken: string) {
    const invitation = await this.prisma.organizationInvitation.findFirst({ where: { tokenHash: this.hash(rawToken), acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, select: { email: true, role: true, expiresAt: true, organization: { select: { id: true, name: true } } } });
    if (!invitation) throw new NotFoundException('Invitation is invalid or expired');
    return invitation;
  }

  private hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
}
