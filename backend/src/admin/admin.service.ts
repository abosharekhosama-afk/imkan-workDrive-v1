import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { OrgRole } from '@prisma/client';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  private assert(u: AccessTokenPayload) {
    if (u.role !== OrgRole.ADMIN && u.role !== OrgRole.SUPER_ADMIN) {
      throw new ForbiddenException('Admin access required');
    }
  }

  async overview(u: AccessTokenPayload) {
    this.assert(u);
    const [users, files, folders, shares, teamFolders] = await Promise.all([
      this.prisma.organizationMembership.count({ where: { organizationId: u.org_id, status: 'ACTIVE' } }),
      this.prisma.file.count({ where: { orgId: u.org_id, deletedAt: null } }),
      this.prisma.folder.count({ where: { orgId: u.org_id } }),
      this.prisma.fileShare.count({ where: { orgId: u.org_id } }),
      this.prisma.teamFolder.count({ where: { orgId: u.org_id } }),
    ]);
    return { users, files, folders, shares, teamFolders };
  }

  async users(u: AccessTokenPayload) {
    this.assert(u);
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { organizationId: u.org_id, status: 'ACTIVE' },
      include: {
        user: {
          select: { id: true, name: true, email: true, status: true, createdAt: true },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    return memberships.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      status: m.user.status,
      createdAt: m.user.createdAt,
      membershipStatus: m.status,
      joinedAt: m.joinedAt,
      isPrimary: m.isPrimary,
    }));
  }
}