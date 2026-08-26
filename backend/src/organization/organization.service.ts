import { ConflictException, ForbiddenException, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { InvitationStatus, OrgRole, MembershipStatus } from '@prisma/client';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OrganizationService {
  constructor(private readonly prisma: PrismaService) {}

  private assertSuperAdmin(user: AccessTokenPayload) {
    if (user.role !== OrgRole.SUPER_ADMIN && user.role !== OrgRole.ADMIN) throw new ForbiddenException('Organization admin access required');
  }

  private assertSuperAdminOnly(user: AccessTokenPayload) {
    if (user.role !== OrgRole.SUPER_ADMIN) throw new ForbiddenException('Super Admin access required');
  }

  async get(user: AccessTokenPayload) {
    const org = await this.prisma.organization.findUnique({ where: { id: user.org_id }, select: { id: true, name: true, createdAt: true, ownerId: true } });
    if (!org) throw new NotFoundException('Organization not found');
    const [members, pendingInvitations] = await Promise.all([
      this.prisma.organizationMembership.count({ where: { organizationId: user.org_id, status: MembershipStatus.ACTIVE } }),
      this.prisma.organizationInvitation.count({ where: { orgId: user.org_id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } }),
    ]);
    return { ...org, members, pendingInvitations, role: user.role };
  }

  async update(user: AccessTokenPayload, input: { name: string }) {
    this.assertSuperAdmin(user);
    return this.prisma.organization.update({ where: { id: user.org_id }, data: { name: input.name }, select: { id: true, name: true, createdAt: true } });
  }

  async members(user: AccessTokenPayload) {
    const rows = await this.prisma.organizationMembership.findMany({ 
      where: { organizationId: user.org_id, status: { in: [MembershipStatus.ACTIVE, MembershipStatus.SUSPENDED] } }, 
      include: { 
        user: { select: { id: true, name: true, email: true, avatarUrl: true, createdAt: true, status: true } },
        invitedBy: { select: { id: true, name: true, email: true } },
      }, 
      orderBy: { joinedAt: 'asc' } 
    });
    return rows.map(m => ({
      id: m.id,
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      avatarUrl: m.user.avatarUrl,
      role: m.role,
      status: m.status,
      joinedAt: m.joinedAt,
      invitedBy: m.invitedBy,
      isPrimary: m.isPrimary,
      personalFolderId: m.personalFolderId,
      suspendedAt: m.suspendedAt,
      suspendedById: m.suspendedById,
    }));
  }

  async allMembersWithPending(user: AccessTokenPayload) {
    this.assertSuperAdmin(user);
    const [activeMembers, pendingInvitations] = await Promise.all([
      this.members(user),
      this.prisma.organizationInvitation.findMany({
        where: { orgId: user.org_id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true, email: true, role: true, expiresAt: true, createdAt: true, invitedBy: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return { members: activeMembers, pendingInvitations };
  }

  async updateMemberRole(user: AccessTokenPayload, membershipId: string, role: OrgRole) {
    this.assertSuperAdmin(user);
    const membership = await this.prisma.organizationMembership.findFirst({ where: { id: membershipId, organizationId: user.org_id } });
    if (!membership) throw new NotFoundException('Member not found');
    
    const org = await this.prisma.organization.findUnique({ where: { id: user.org_id }, select: { ownerId: true } });
    const ownerMembership = org?.ownerId ? await this.prisma.organizationMembership.findFirst({ where: { userId: org.ownerId, organizationId: user.org_id } }) : null;
    
    if (ownerMembership?.id === membership.id && role !== OrgRole.SUPER_ADMIN && role !== OrgRole.ADMIN) {
      throw new ForbiddenException('The organization owner cannot be demoted below Admin');
    }
    if (membership.userId === user.sub && role !== OrgRole.ADMIN && role !== OrgRole.SUPER_ADMIN) throw new ForbiddenException('You cannot remove your own organization admin role');
    if (membership.role === OrgRole.SUPER_ADMIN && role !== OrgRole.SUPER_ADMIN) {
      const superAdmins = await this.prisma.organizationMembership.count({ where: { organizationId: user.org_id, role: OrgRole.SUPER_ADMIN } });
      if (superAdmins <= 1) throw new ForbiddenException('Cannot remove the last Super Admin');
    }
    if (membership.role === OrgRole.ADMIN && role === OrgRole.MEMBER) {
      const admins = await this.prisma.organizationMembership.count({ where: { organizationId: user.org_id, role: { in: [OrgRole.SUPER_ADMIN, OrgRole.ADMIN] } } });
      if (admins <= 1) throw new ForbiddenException('Cannot remove the last organization admin');
    }
    
    await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'ORG_MEMBER_ROLE_CHANGED', resourceType: 'ORGANIZATION_MEMBERSHIP', resourceId: membership.id, metadata: { previousRole: membership.role, newRole: role } } });
    return this.prisma.organizationMembership.update({ where: { id: membership.id }, data: { role }, include: { user: { select: { id: true, name: true, email: true } } } });
  }

  async suspendMember(user: AccessTokenPayload, membershipId: string) {
    this.assertSuperAdmin(user);
    const membership = await this.prisma.organizationMembership.findFirst({ where: { id: membershipId, organizationId: user.org_id } });
    if (!membership) throw new NotFoundException('Member not found');
    if (membership.userId === user.sub) throw new ForbiddenException('You cannot suspend yourself');
    if (membership.status === MembershipStatus.SUSPENDED) throw new BadRequestException('Member is already suspended');
    
    const org = await this.prisma.organization.findUnique({ where: { id: user.org_id }, select: { ownerId: true } });
    const ownerMembership = org?.ownerId ? await this.prisma.organizationMembership.findFirst({ where: { userId: org.ownerId, organizationId: user.org_id } }) : null;
    if (ownerMembership?.id === membership.id) throw new ForbiddenException('The organization owner cannot be suspended');

    await this.prisma.$transaction([
      this.prisma.session.updateMany({ where: { userId: membership.userId, orgId: user.org_id, revokedAt: null }, data: { revokedAt: new Date() } }),
      this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'ORG_MEMBER_SUSPENDED', resourceType: 'ORGANIZATION_MEMBERSHIP', resourceId: membership.id } }),
      this.prisma.organizationMembership.update({ where: { id: membership.id }, data: { status: MembershipStatus.SUSPENDED, suspendedAt: new Date(), suspendedById: user.sub } }),
    ]);
    return { id: membershipId, suspended: true };
  }

  async activateMember(user: AccessTokenPayload, membershipId: string) {
    this.assertSuperAdmin(user);
    const membership = await this.prisma.organizationMembership.findFirst({ where: { id: membershipId, organizationId: user.org_id } });
    if (!membership) throw new NotFoundException('Member not found');
    if (membership.status === MembershipStatus.ACTIVE) throw new BadRequestException('Member is already active');

    await this.prisma.$transaction([
      this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'ORG_MEMBER_ACTIVATED', resourceType: 'ORGANIZATION_MEMBERSHIP', resourceId: membership.id } }),
      this.prisma.organizationMembership.update({ where: { id: membership.id }, data: { status: MembershipStatus.ACTIVE, suspendedAt: null, suspendedById: null } }),
    ]);
    return { id: membershipId, activated: true };
  }

  async removeMember(user: AccessTokenPayload, membershipId: string, successorId?: string) {
    this.assertSuperAdmin(user);
    const membership = await this.prisma.organizationMembership.findFirst({ where: { id: membershipId, organizationId: user.org_id } });
    if (!membership) throw new NotFoundException('Member not found');
    if (membership.userId === user.sub) throw new ForbiddenException('You cannot remove yourself from the organization');
    
    const org = await this.prisma.organization.findUnique({ where: { id: user.org_id }, select: { ownerId: true } });
    const ownerMembership = org?.ownerId ? await this.prisma.organizationMembership.findFirst({ where: { userId: org.ownerId, organizationId: user.org_id } }) : null;
    if (ownerMembership?.id === membership.id) throw new ForbiddenException('The organization owner cannot be removed');

    if (membership.role === OrgRole.SUPER_ADMIN) {
      const superAdmins = await this.prisma.organizationMembership.count({ where: { organizationId: user.org_id, role: OrgRole.SUPER_ADMIN, status: MembershipStatus.ACTIVE } });
      if (superAdmins <= 1) throw new ForbiddenException('Cannot remove the last Super Admin');
    }
    if (membership.role === OrgRole.ADMIN) {
      const admins = await this.prisma.organizationMembership.count({ where: { organizationId: user.org_id, role: { in: [OrgRole.SUPER_ADMIN, OrgRole.ADMIN] }, status: MembershipStatus.ACTIVE } });
      if (admins <= 1) throw new ForbiddenException('Cannot remove the last organization admin');
    }

    if (!successorId && (membership.personalFolderId || await this.hasPersonalFiles(user.org_id, membership.userId))) {
      throw new BadRequestException('Successor member is required to transfer ownership of personal files');
    }

    const successor = successorId ? await this.prisma.organizationMembership.findFirst({ where: { id: successorId, organizationId: user.org_id, status: MembershipStatus.ACTIVE } }) : null;
    if (successorId && !successor) throw new NotFoundException('Successor member not found');

    await this.prisma.$transaction([
      this.prisma.session.updateMany({ where: { userId: membership.userId, orgId: user.org_id, revokedAt: null }, data: { revokedAt: new Date() } }),
      this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'ORG_MEMBER_REMOVED', resourceType: 'ORGANIZATION_MEMBERSHIP', resourceId: membership.id, metadata: { successorId: successor?.id ?? null } } }),
      this.prisma.organizationMembership.update({ where: { id: membership.id }, data: { status: MembershipStatus.REMOVED, removedAt: new Date(), removedById: user.sub } }),
    ]);

    if (successor) {
      await this.initiateDataTransfer(user.org_id, membership.id, successor.id, user.sub);
    }

    return { id: membershipId, removed: true, dataTransferInitiated: !!successor };
  }

  private async hasPersonalFiles(orgId: string, userId: string): Promise<boolean> {
    const count = await this.prisma.file.count({ where: { orgId, ownerId: userId, deletedAt: null, folder: { folderType: 'PERSONAL' } } });
    return count > 0;
  }

  async invite(user: AccessTokenPayload, email: string, role: OrgRole) {
    this.assertSuperAdmin(user);
    const existingMembership = await this.prisma.organizationMembership.findFirst({ where: { user: { email }, organizationId: user.org_id, status: { in: [MembershipStatus.ACTIVE, MembershipStatus.SUSPENDED, MembershipStatus.PENDING] } } });
    if (existingMembership) throw new ConflictException('User is already a member of this organization');
    const active = await this.prisma.organizationInvitation.findFirst({ where: { orgId: user.org_id, email, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } });
    if (active) throw new ConflictException('An active invitation already exists for this email');
    const raw = randomBytes(32).toString('hex');
    const invitation = await this.prisma.organizationInvitation.create({ data: { orgId: user.org_id, email, role, tokenHash: this.hash(raw), invitedById: user.sub, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }, include: { organization: { select: { name: true } } } });
    await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'ORG_INVITATION_CREATED', resourceType: 'ORGANIZATION_INVITATION', resourceId: invitation.id } });
    const base = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    return { id: invitation.id, email, role, expiresAt: invitation.expiresAt, inviteUrl: `${base}/organization/invitations/accept?token=${raw}` };
  }

  async invitations(user: AccessTokenPayload) {
    this.assertSuperAdmin(user);
    return this.prisma.organizationInvitation.findMany({ where: { orgId: user.org_id }, select: { id: true, email: true, role: true, expiresAt: true, acceptedAt: true, revokedAt: true, createdAt: true, invitedBy: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'desc' } });
  }

  async revokeInvitation(user: AccessTokenPayload, id: string) {
    this.assertSuperAdmin(user);
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
    
    const existingMembership = await this.prisma.organizationMembership.findFirst({ where: { userId: user.sub, organizationId: invitation.orgId } });
    if (existingMembership) throw new ConflictException('You are already a member of this organization');

    await this.prisma.$transaction([
      this.prisma.organizationMembership.create({ data: { userId: user.sub, organizationId: invitation.orgId, role: invitation.role, status: MembershipStatus.ACTIVE, invitedById: invitation.invitedById, isPrimary: !(await this.prisma.organizationMembership.count({ where: { userId: user.sub } })) } }),
      this.prisma.organizationInvitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date(), status: InvitationStatus.ACCEPTED } }),
      this.prisma.auditLog.create({ data: { orgId: invitation.orgId, actorId: user.sub, action: 'ORG_INVITATION_ACCEPTED', resourceType: 'ORGANIZATION_INVITATION', resourceId: invitation.id } }),
    ]);
    
    const newMembership = await this.prisma.organizationMembership.findFirst({ where: { userId: user.sub, organizationId: invitation.orgId } });
    if (newMembership) {
      await this.createPersonalFolder(newMembership.id, invitation.orgId, user.sub);
    }
    
    return { accepted: true, organizationId: invitation.orgId, role: invitation.role };
  }

  private async createPersonalFolder(membershipId: string, orgId: string, userId: string) {
    const personalFolder = await this.prisma.folder.create({
      data: { name: 'My Folder', orgId, ownerId: userId, folderType: 'PERSONAL' },
    });
    await this.prisma.organizationMembership.update({ where: { id: membershipId }, data: { personalFolderId: personalFolder.id } });
  }

  async validateInvitation(rawToken: string) {
    const invitation = await this.prisma.organizationInvitation.findFirst({ where: { tokenHash: this.hash(rawToken), acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, select: { email: true, role: true, expiresAt: true, organization: { select: { id: true, name: true } } } });
    if (!invitation) throw new NotFoundException('Invitation is invalid or expired');
    return invitation;
  }

  async transferOwnership(user: AccessTokenPayload, targetMembershipId: string) {
    this.assertSuperAdminOnly(user);
    
    const currentOwnerMembership = await this.prisma.organizationMembership.findFirst({ where: { userId: user.sub, organizationId: user.org_id, role: OrgRole.SUPER_ADMIN } });
    const targetMembership = await this.prisma.organizationMembership.findFirst({ where: { id: targetMembershipId, organizationId: user.org_id, status: MembershipStatus.ACTIVE } });
    
    if (!currentOwnerMembership || !targetMembership) throw new NotFoundException('Membership not found');
    if (currentOwnerMembership.id === targetMembershipId) throw new BadRequestException('You are already the owner');

    await this.prisma.$transaction([
      this.prisma.organizationMembership.update({ where: { id: currentOwnerMembership.id }, data: { role: OrgRole.ADMIN } }),
      this.prisma.organizationMembership.update({ where: { id: targetMembershipId }, data: { role: OrgRole.SUPER_ADMIN } }),
      this.prisma.organization.update({ where: { id: user.org_id }, data: { ownerId: targetMembership.userId } }),
      this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'ORG_OWNERSHIP_TRANSFERRED', resourceType: 'ORGANIZATION', resourceId: user.org_id, metadata: { fromUserId: currentOwnerMembership.userId, toUserId: targetMembership.userId } } }),
    ]);
    
    return { transferred: true, newOwnerId: targetMembership.userId };
  }

  private async initiateDataTransfer(orgId: string, sourceMembershipId: string, targetMembershipId: string, initiatedById: string) {
    const dataTransfer = await this.prisma.dataTransfer.create({
      data: {
        orgId,
        sourceMemberId: sourceMembershipId,
        targetMemberId: targetMembershipId,
        initiatedById,
        status: 'PENDING',
        transferType: 'FULL_OWNERSHIP',
      },
    });
    
    await this.processDataTransfer(dataTransfer.id);
    return dataTransfer;
  }

  private async processDataTransfer(dataTransferId: string) {
    const transfer = await this.prisma.dataTransfer.findUnique({ where: { id: dataTransferId }, include: { sourceMember: { include: { user: true } }, targetMember: { include: { user: true } } } });
    if (!transfer) return;
    
    await this.prisma.dataTransfer.update({ where: { id: dataTransferId }, data: { status: 'IN_PROGRESS', startedAt: new Date() } });
    
    try {
      const [personalFiles, personalFolders] = await Promise.all([
        this.prisma.file.findMany({ where: { orgId: transfer.orgId, ownerId: transfer.sourceMember.userId, deletedAt: null, folder: { folderType: 'PERSONAL' } } }),
        this.prisma.folder.findMany({ where: { orgId: transfer.orgId, ownerId: transfer.sourceMember.userId, folderType: 'PERSONAL' } }),
      ]);
      
      const totalItems = personalFiles.length + personalFolders.length;
      await this.prisma.dataTransfer.update({ where: { id: dataTransferId }, data: { itemsTotal: totalItems } });
      
      let transferred = 0;
      let failed = 0;
      const errors: string[] = [];
      
      for (const file of personalFiles) {
        try {
          const targetFolder = await this.getOrCreateArchivedMemberFolder(transfer.orgId, transfer.targetMember.userId, transfer.sourceMember.user.name ?? 'Unknown Member');
          await this.prisma.file.update({ where: { id: file.id }, data: { ownerId: transfer.targetMember.userId, folderId: targetFolder.id } });
          await this.prisma.fileActivity.create({ data: { orgId: transfer.orgId, fileId: file.id, userId: transfer.initiatedById, action: 'OWNERSHIP_TRANSFERRED', metadata: { fromUserId: transfer.sourceMember.userId, toUserId: transfer.targetMember.userId, transferId: dataTransferId } } });
          transferred++;
        } catch (e) {
          failed++;
          errors.push(`File ${file.id}: ${(e as Error).message}`);
        }
      }
      
      for (const folder of personalFolders) {
        if (folder.id === transfer.sourceMember.personalFolderId) continue;
        try {
          const targetFolder = await this.getOrCreateArchivedMemberFolder(transfer.orgId, transfer.targetMember.userId, transfer.sourceMember.user.name ?? 'Unknown Member');
          await this.prisma.folder.update({ where: { id: folder.id }, data: { ownerId: transfer.targetMember.userId, parentId: targetFolder.id, folderType: 'ARCHIVED_MEMBER' } });
          transferred++;
        } catch (e) {
          failed++;
          errors.push(`Folder ${folder.id}: ${(e as Error).message}`);
        }
      }
      
      if (transfer.sourceMember.personalFolderId) {
        try {
          const targetFolder = await this.getOrCreateArchivedMemberFolder(transfer.orgId, transfer.targetMember.userId, transfer.sourceMember.user.name ?? 'Unknown Member');
          await this.prisma.folder.update({ where: { id: transfer.sourceMember.personalFolderId }, data: { ownerId: transfer.targetMember.userId, parentId: targetFolder.id, folderType: 'ARCHIVED_MEMBER', name: `[مجلد العضو المغادر - ${transfer.sourceMember.user.name ?? 'Unknown Member'}]` } });
          transferred++;
        } catch (e) {
          failed++;
          errors.push(`Personal folder ${transfer.sourceMember.personalFolderId}: ${(e as Error).message}`);
        }
      }
      
      const status = failed === 0 ? 'COMPLETED' : failed === totalItems ? 'FAILED' : 'PARTIAL';
      await this.prisma.dataTransfer.update({ 
        where: { id: dataTransferId }, 
        data: { 
          status, 
          itemsTransferred: transferred, 
          itemsFailed: failed, 
          errorLog: errors.length > 0 ? errors : undefined,
          completedAt: new Date(),
        } 
      });
    } catch (e) {
      await this.prisma.dataTransfer.update({ 
        where: { id: dataTransferId }, 
        data: { 
          status: 'FAILED', 
          errorLog: [(e as Error).message],
          completedAt: new Date(),
        } 
      });
    }
  }

  private async getOrCreateArchivedMemberFolder(orgId: string, targetUserId: string, sourceMemberName: string) {
    let archivedRoot = await this.prisma.folder.findFirst({ where: { orgId, ownerId: targetUserId, folderType: 'ARCHIVED_MEMBER', parentId: null } });
    if (!archivedRoot) {
      archivedRoot = await this.prisma.folder.create({ data: { name: 'Archived Members', orgId, ownerId: targetUserId, folderType: 'ARCHIVED_MEMBER' } });
    }
    
    let memberFolder = await this.prisma.folder.findFirst({ where: { orgId, ownerId: targetUserId, folderType: 'ARCHIVED_MEMBER', parentId: archivedRoot.id, name: { contains: sourceMemberName } } });
    if (!memberFolder) {
      memberFolder = await this.prisma.folder.create({ data: { name: `[مجلد العضو المغادر - ${sourceMemberName}]`, orgId, ownerId: targetUserId, folderType: 'ARCHIVED_MEMBER', parentId: archivedRoot.id } });
    }
    return memberFolder;
  }

  async getDataTransfers(user: AccessTokenPayload) {
    this.assertSuperAdmin(user);
    return this.prisma.dataTransfer.findMany({ where: { orgId: user.org_id }, include: { sourceMember: { include: { user: { select: { id: true, name: true, email: true } } } }, targetMember: { include: { user: { select: { id: true, name: true, email: true } } } }, initiatedBy: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'desc' } });
  }

  private hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
}