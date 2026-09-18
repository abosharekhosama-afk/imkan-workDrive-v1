import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { GroupRole, OrgRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AccessTokenPayload } from '../auth/jwt.types';

@Injectable()
export class GroupsService {
  constructor(private readonly prisma: PrismaService) {}

  private assertAdmin(user: AccessTokenPayload) {
    if (user.role !== OrgRole.ADMIN && user.role !== OrgRole.SUPER_ADMIN) {
      throw new ForbiddenException('Organization admin access required');
    }
  }

  async list(user: AccessTokenPayload) {
    this.assertAdmin(user);
    const groups = await this.prisma.group.findMany({
      where: { orgId: user.org_id },
      include: { _count: { select: { members: true } } },
      orderBy: { name: 'asc' },
    });
    return groups.map((group) => ({
      id: group.id,
      name: group.name,
      description: group.description,
      memberCount: group._count.members,
    }));
  }

  async addMember(user: AccessTokenPayload, groupId: string, userId: string, role: 'ADMIN' | 'MEMBER' = 'MEMBER') {
    this.assertAdmin(user);
    const [group, member] = await Promise.all([
      this.prisma.group.findFirst({ where: { id: groupId, orgId: user.org_id } }),
      this.prisma.organizationMembership.findFirst({ where: { organizationId: user.org_id, userId, status: 'ACTIVE' } }),
    ]);
    if (!group) throw new NotFoundException('Group not found');
    if (!member) throw new NotFoundException('Member not found');
    const existing = await this.prisma.groupMember.findUnique({ where: { groupId_userId: { groupId, userId } } });
    if (existing) throw new ConflictException('Member is already in this group');
    return this.prisma.groupMember.create({ data: { orgId: user.org_id, groupId, userId, role: role === 'ADMIN' ? GroupRole.ADMIN : GroupRole.MEMBER } });
  }

  async removeMember(user: AccessTokenPayload, groupId: string, userId: string) {
    this.assertAdmin(user);
    const existing = await this.prisma.groupMember.findUnique({ where: { groupId_userId: { groupId, userId } } });
    if (!existing || existing.orgId !== user.org_id) throw new NotFoundException('Group membership not found');
    await this.prisma.groupMember.delete({ where: { id: existing.id } });
    return { groupId, userId, deleted: true };
  }
}
