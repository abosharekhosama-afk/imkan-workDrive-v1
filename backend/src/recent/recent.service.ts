import { Injectable } from '@nestjs/common';
import { AccessAction, ResourceType } from '@prisma/client';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { PrismaService } from '../prisma/prisma.service';

export type RecentItem = {
  id: string;
  resourceType: ResourceType;
  resourceId: string;
  name: string;
  action: AccessAction | string;
  accessedAt: Date;
  mimeType?: string | null;
  size?: bigint | null;
  updatedAt?: Date | null;
  location?: string | null;
  folderId?: string | null;
};

@Injectable()
export class RecentService {
  constructor(private readonly prisma: PrismaService) {}

  async record(user: AccessTokenPayload, resourceType: ResourceType, resourceId: string, action: AccessAction) {
    await this.prisma.accessEvent.create({ data: { orgId: user.org_id, userId: user.sub, resourceType, resourceId, action } });
  }

  async list(user: AccessTokenPayload): Promise<RecentItem[]> {
    const events = await this.prisma.accessEvent.findMany({ where: { orgId: user.org_id, userId: user.sub }, orderBy: { accessedAt: 'desc' }, take: 100 });
    const seen = new Set<string>();
    const result: RecentItem[] = [];
    for (const event of events) {
      const key = `${event.resourceType}:${event.resourceId}`;
      if (seen.has(key)) continue;
      if (event.resourceType === ResourceType.FILE) {
        const file = await this.prisma.file.findFirst({
          where: { id: event.resourceId, orgId: user.org_id, deletedAt: null },
          select: { id: true, name: true, mimeType: true, size: true, updatedAt: true, folderId: true, folder: { select: { name: true } } },
        });
        if (!file) continue;
        seen.add(key);
        result.push({
          id: event.id,
          resourceType: event.resourceType,
          resourceId: event.resourceId,
          name: file.name,
          action: event.action,
          accessedAt: event.accessedAt,
          mimeType: file.mimeType,
          size: file.size,
          updatedAt: file.updatedAt,
          location: file.folder?.name ?? null,
          folderId: file.folderId,
        });
      } else {
        const folder = await this.prisma.folder.findFirst({
          where: { id: event.resourceId, orgId: user.org_id },
          select: { id: true, name: true, updatedAt: true, parent: { select: { name: true } }, teamFolder: { select: { name: true } } },
        });
        if (!folder) continue;
        seen.add(key);
        result.push({
          id: event.id,
          resourceType: event.resourceType,
          resourceId: event.resourceId,
          name: folder.name,
          action: event.action,
          accessedAt: event.accessedAt,
          mimeType: null,
          size: null,
          updatedAt: folder.updatedAt,
          location: folder.parent?.name ?? folder.teamFolder?.name ?? null,
        });
      }
    }
    return result;
  }
}
