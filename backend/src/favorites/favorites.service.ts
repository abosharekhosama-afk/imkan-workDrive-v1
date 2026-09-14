import { Injectable, NotFoundException } from '@nestjs/common';
import { ResourceType } from '@prisma/client';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../permissions/permission.service';

@Injectable()
export class FavoritesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
  ) {}

  async list(user: AccessTokenPayload) {
    const favorites = await this.prisma.favorite.findMany({
      where: { orgId: user.org_id, userId: user.sub },
      orderBy: { createdAt: 'desc' },
    });
    const result: Array<{
      id: string;
      resourceType: ResourceType;
      resourceId: string;
      createdAt: Date;
      name: string;
    }> = [];
    for (const favorite of favorites) {
      const name =
        favorite.resourceType === ResourceType.FILE
          ? (
              await this.prisma.file.findFirst({
                where: {
                  id: favorite.resourceId,
                  orgId: user.org_id,
                  deletedAt: null,
                },
                select: { name: true },
              })
            )?.name
          : (
              await this.prisma.folder.findFirst({
                where: { id: favorite.resourceId, orgId: user.org_id },
                select: { name: true },
              })
            )?.name;
      if (name) result.push({ ...favorite, name });
    }
    return result;
  }

  async add(
    user: AccessTokenPayload,
    resourceType: ResourceType,
    resourceId: string,
  ) {
    const resource =
      resourceType === ResourceType.FILE
        ? await this.prisma.file.findFirst({
            where: { id: resourceId, orgId: user.org_id, deletedAt: null },
            include: {
              folder: { select: { teamFolderId: true } },
            },
          })
        : await this.prisma.folder.findFirst({
            where: { id: resourceId, orgId: user.org_id },
          });
    if (!resource) throw new NotFoundException('Resource not found');
    const teamFolderId =
      'folder' in resource
        ? resource.folder?.teamFolderId
        : resource.teamFolderId;
    if (
      !this.permissions.canRead(user, {
        orgId: resource.orgId,
        ownerId: resource.ownerId,
        teamFolderId,
      })
    )
      throw new NotFoundException('Resource not found');
    return this.prisma.favorite.upsert({
      where: {
        userId_resourceType_resourceId: {
          userId: user.sub,
          resourceType,
          resourceId,
        },
      },
      create: {
        orgId: user.org_id,
        userId: user.sub,
        resourceType,
        resourceId,
      },
      update: {},
    });
  }

  async remove(
    user: AccessTokenPayload,
    resourceType: ResourceType,
    resourceId: string,
  ) {
    await this.prisma.favorite.deleteMany({
      where: { orgId: user.org_id, userId: user.sub, resourceType, resourceId },
    });
    return { removed: true };
  }
}
