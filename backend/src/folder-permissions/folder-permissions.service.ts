import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FolderAccessLevel, MembershipStatus, OrgRole } from '@prisma/client';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { EffectivePermissionService } from '../permissions/effective-permission.service';
import { PrismaService } from '../prisma/prisma.service';

const ACCESS_LEVELS = new Set(Object.values(FolderAccessLevel));

@Injectable()
export class FolderPermissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly effective: EffectivePermissionService,
  ) {}

  private async requireManage(user: AccessTokenPayload, folderId: string) {
    const folder = await this.prisma.folder.findFirst({
      where: { id: folderId, orgId: user.org_id },
      select: { id: true, ownerId: true, orgId: true },
    });
    if (!folder) throw new NotFoundException('Folder not found');

    const access = await this.effective.resolveFolder(user, folder.id);
    if (access.level !== 'FULL_ACCESS' && access.level !== 'ORGANIZE') {
      throw new ForbiddenException('Not allowed to manage folder permissions');
    }
    return folder;
  }

  async list(user: AccessTokenPayload, folderId: string) {
    await this.requireManage(user, folderId);
    const rows = await this.prisma.folderPermission.findMany({
      where: { orgId: user.org_id, folderId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true } },
        group: { select: { id: true, name: true } },
      },
    });
    const effective = await this.effective.resolveFolder(user, folderId);
    return {
      folderId,
      effectiveAccess: effective.level,
      permissions: rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        groupId: row.groupId,
        access: row.access,
        hidden: row.hidden,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        user: row.user,
        group: row.group,
      })),
    };
  }

  async upsert(
    user: AccessTokenPayload,
    folderId: string,
    body: { userId?: string; groupId?: string; access: string; hidden?: boolean },
  ) {
    await this.requireManage(user, folderId);
    if ((body.userId && body.groupId) || (!body.userId && !body.groupId)) {
      throw new BadRequestException('Provide exactly one subject');
    }
    if (!ACCESS_LEVELS.has(body.access as FolderAccessLevel)) {
      throw new BadRequestException('Invalid access');
    }

    if (body.userId) {
      const membership = await this.prisma.organizationMembership.findFirst({
        where: { userId: body.userId, organizationId: user.org_id, status: MembershipStatus.ACTIVE },
        select: { userId: true },
      });
      if (!membership) throw new NotFoundException('User is not an active organization member');
    }

    if (body.groupId) {
      const group = await this.prisma.group.findFirst({
        where: { id: body.groupId, orgId: user.org_id },
        select: { id: true },
      });
      if (!group) throw new NotFoundException('Group not found');
    }

    const where = body.userId
      ? { folderId, userId: body.userId }
      : { folderId, groupId: body.groupId };
    const existing = await this.prisma.folderPermission.findFirst({ where: where as any, select: { id: true } });
    const data = {
      orgId: user.org_id,
      folderId,
      userId: body.userId ?? null,
      groupId: body.groupId ?? null,
      access: body.access as FolderAccessLevel,
      hidden: body.hidden ?? false,
    };

    const result = existing
      ? await this.prisma.folderPermission.update({ where: { id: existing.id }, data: { access: data.access, hidden: data.hidden } })
      : await this.prisma.folderPermission.create({ data });

    await this.prisma.auditLog.create({
      data: {
        orgId: user.org_id,
        actorId: user.sub,
        action: 'FOLDER_PERMISSION_CHANGED',
        resourceType: 'FOLDER',
        resourceId: folderId,
        metadata: { userId: body.userId, groupId: body.groupId, access: body.access, hidden: body.hidden ?? false },
      },
    });
    return result;
  }

  async remove(user: AccessTokenPayload, permissionId: string) {
    const permission = await this.prisma.folderPermission.findFirst({
      where: { id: permissionId, orgId: user.org_id },
      select: { id: true, folderId: true },
    });
    if (!permission) throw new NotFoundException('Permission not found');
    await this.requireManage(user, permission.folderId);
    await this.prisma.folderPermission.delete({ where: { id: permission.id } });
    await this.prisma.auditLog.create({
      data: {
        orgId: user.org_id,
        actorId: user.sub,
        action: 'FOLDER_PERMISSION_REMOVED',
        resourceType: 'FOLDER',
        resourceId: permission.folderId,
        metadata: { permissionId },
      },
    });
    return { id: permissionId, deleted: true };
  }
}
