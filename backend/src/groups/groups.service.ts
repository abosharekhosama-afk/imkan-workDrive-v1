import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { GroupRole, MembershipStatus, OrgRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AccessTokenPayload } from '../auth/jwt.types';

@Injectable()
export class GroupsService {
  constructor(private readonly prisma: PrismaService) {}

  private isOrgAdmin(user: AccessTokenPayload) {
    return user.role === OrgRole.ADMIN || user.role === OrgRole.SUPER_ADMIN;
  }

  private async getGroupForOrg(user: AccessTokenPayload, groupId: string) {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, orgId: user.org_id },
      include: { _count: { select: { members: true } } },
    });
    if (!group) throw new NotFoundException('Group not found');
    return group;
  }

  private async assertGroupManager(user: AccessTokenPayload, groupId: string) {
    if (this.isOrgAdmin(user)) return this.getGroupForOrg(user, groupId);
    const membership = await this.prisma.groupMember.findFirst({
      where: { groupId, orgId: user.org_id, userId: user.sub, role: GroupRole.ADMIN },
    });
    if (!membership) throw new ForbiddenException('Group admin access required');
    return this.getGroupForOrg(user, groupId);
  }

  private async audit(user: AccessTokenPayload, action: string, resourceId: string, metadata?: Record<string, unknown>) {
    await this.prisma.auditLog.create({
      data: {
        orgId: user.org_id,
        actorId: user.sub,
        action,
        resourceType: 'GROUP',
        resourceId,
        metadata: metadata as any,
      },
    });
  }

  private async assertGroupReader(user: AccessTokenPayload, groupId: string) {
    const group = await this.getGroupForOrg(user, groupId);
    if (this.isOrgAdmin(user)) return group;
    const membership = await this.prisma.groupMember.findFirst({ where: { groupId, orgId: user.org_id, userId: user.sub } });
    if (!membership) throw new ForbiddenException('You are not a member of this group');
    return group;
  }

  async list(user: AccessTokenPayload) {
    const groups = await this.prisma.group.findMany({
      where: this.isOrgAdmin(user) ? { orgId: user.org_id } : { orgId: user.org_id, members: { some: { userId: user.sub } } },
      include: { _count: { select: { members: true } } },
      orderBy: { name: 'asc' },
    });
    return groups.map((group) => ({
      id: group.id,
      name: group.name,
      description: group.description,
      memberCount: group._count.members,
      createdAt: group.createdAt,
      createdById: group.createdById,
    }));
  }

  async create(user: AccessTokenPayload, name: string, description?: string) {
    if (!this.isOrgAdmin(user)) throw new ForbiddenException('Organization admin access required');
    const normalizedName = name?.trim();
    if (!normalizedName) throw new BadRequestException('Group name is required');
    if (normalizedName.length > 120) throw new BadRequestException('Group name is too long');
    const normalizedDescription = description?.trim() || null;
    if (normalizedDescription && normalizedDescription.length > 2000) throw new BadRequestException('Group description is too long');

    try {
      const group = await this.prisma.$transaction(async (tx) => {
        const created = await tx.group.create({
          data: { orgId: user.org_id, name: normalizedName, description: normalizedDescription, createdById: user.sub },
        });
        await tx.groupMember.create({
          data: { orgId: user.org_id, groupId: created.id, userId: user.sub, role: GroupRole.ADMIN },
        });
        await tx.auditLog.create({
          data: { orgId: user.org_id, actorId: user.sub, action: 'GROUP_CREATED', resourceType: 'GROUP', resourceId: created.id },
        });
        return created;
      });
      return { id: group.id, name: group.name, description: group.description, memberCount: 1, createdAt: group.createdAt, createdById: group.createdById };
    } catch (error: any) {
      if (error?.code === 'P2002') throw new ConflictException('A group with this name already exists');
      throw error;
    }
  }

  async get(user: AccessTokenPayload, groupId: string) {
    const group = await this.assertGroupReader(user, groupId);
    const members = await this.prisma.groupMember.findMany({
      where: { groupId, orgId: user.org_id },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      orderBy: [{ role: 'asc' }, { user: { name: 'asc' } }],
    });
    return {
      id: group.id,
      name: group.name,
      description: group.description,
      memberCount: group._count.members,
      createdAt: group.createdAt,
      createdById: group.createdById,
      members: members.map((m) => ({ id: m.id, userId: m.userId, role: m.role, createdAt: m.createdAt, user: m.user })),
    };
  }

  async update(user: AccessTokenPayload, groupId: string, input: { name?: string; description?: string | null }) {
    await this.assertGroupManager(user, groupId);
    const data: { name?: string; description?: string | null } = {};
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new BadRequestException('Group name is required');
      if (name.length > 120) throw new BadRequestException('Group name is too long');
      data.name = name;
    }
    if (input.description !== undefined) {
      const description = input.description?.trim() || null;
      if (description && description.length > 2000) throw new BadRequestException('Group description is too long');
      data.description = description;
    }
    if (!Object.keys(data).length) throw new BadRequestException('No group changes were supplied');
    try {
      const group = await this.prisma.group.update({ where: { id: groupId }, data });
      await this.audit(user, 'GROUP_UPDATED', groupId, { changes: Object.keys(data) });
      return this.get(user, groupId);
    } catch (error: any) {
      if (error?.code === 'P2002') throw new ConflictException('A group with this name already exists');
      if (error?.code === 'P2025') throw new NotFoundException('Group not found');
      throw error;
    }
  }

  async remove(user: AccessTokenPayload, groupId: string) {
    await this.assertGroupManager(user, groupId);
    const group = await this.getGroupForOrg(user, groupId);
    await this.prisma.$transaction(async (tx) => {
      await tx.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'GROUP_DELETED', resourceType: 'GROUP', resourceId: groupId, metadata: { name: group.name, memberCount: group._count.members } } });
      await tx.group.delete({ where: { id: groupId } });
    });
    return { id: groupId, deleted: true };
  }

  async listMembers(user: AccessTokenPayload, groupId: string) {
    await this.assertGroupReader(user, groupId);
    const members = await this.prisma.groupMember.findMany({
      where: { groupId, orgId: user.org_id },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      orderBy: [{ role: 'asc' }, { user: { name: 'asc' } }],
    });
    return members.map((m) => ({ id: m.id, userId: m.userId, role: m.role, createdAt: m.createdAt, user: m.user }));
  }

  async addMember(user: AccessTokenPayload, groupId: string, userId: string, role: 'ADMIN' | 'MEMBER' = 'MEMBER') {
    await this.assertGroupManager(user, groupId);
    const member = await this.prisma.organizationMembership.findFirst({ where: { organizationId: user.org_id, userId, status: MembershipStatus.ACTIVE } });
    if (!member) throw new NotFoundException('Member not found');
    const existing = await this.prisma.groupMember.findUnique({ where: { groupId_userId: { groupId, userId } } });
    if (existing) throw new ConflictException('Member is already in this group');
    const created = await this.prisma.groupMember.create({ data: { orgId: user.org_id, groupId, userId, role: role === 'ADMIN' ? GroupRole.ADMIN : GroupRole.MEMBER } });
    await this.audit(user, 'GROUP_MEMBER_ADDED', groupId, { userId, role: created.role });
    return created;
  }

  async updateMemberRole(user: AccessTokenPayload, groupId: string, userId: string, role: 'ADMIN' | 'MEMBER') {
    await this.assertGroupManager(user, groupId);
    const existing = await this.prisma.groupMember.findFirst({ where: { groupId, userId, orgId: user.org_id } });
    if (!existing) throw new NotFoundException('Group membership not found');
    const nextRole = role === 'ADMIN' ? GroupRole.ADMIN : GroupRole.MEMBER;
    if (existing.role === nextRole) return existing;
    if (existing.role === GroupRole.ADMIN && nextRole === GroupRole.MEMBER) {
      const adminCount = await this.prisma.groupMember.count({ where: { groupId, orgId: user.org_id, role: GroupRole.ADMIN } });
      if (adminCount <= 1) throw new BadRequestException('A group must have at least one admin');
    }
    const updated = await this.prisma.groupMember.update({ where: { id: existing.id }, data: { role: nextRole } });
    await this.audit(user, 'GROUP_MEMBER_ROLE_CHANGED', groupId, { userId, from: existing.role, to: nextRole });
    return updated;
  }

  async removeMember(user: AccessTokenPayload, groupId: string, userId: string) {
    await this.assertGroupManager(user, groupId);
    const existing = await this.prisma.groupMember.findFirst({ where: { groupId, userId, orgId: user.org_id } });
    if (!existing) throw new NotFoundException('Group membership not found');
    if (existing.role === GroupRole.ADMIN) {
      const adminCount = await this.prisma.groupMember.count({ where: { groupId, orgId: user.org_id, role: GroupRole.ADMIN } });
      if (adminCount <= 1) throw new BadRequestException('A group must have at least one admin');
    }
    await this.prisma.groupMember.delete({ where: { id: existing.id } });
    await this.audit(user, 'GROUP_MEMBER_REMOVED', groupId, { userId, role: existing.role });
    return { groupId, userId, deleted: true };
  }
}
