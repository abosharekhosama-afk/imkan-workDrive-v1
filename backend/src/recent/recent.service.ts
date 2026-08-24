import { Injectable } from '@nestjs/common';
import { ResourceType } from '@prisma/client';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RecentService {
  constructor(private readonly prisma: PrismaService) {}

  async record(user: AccessTokenPayload, resourceType: ResourceType, resourceId: string, action: string) {
    await this.prisma.accessEvent.create({ data: { orgId: user.org_id, userId: user.sub, resourceType, resourceId, action } });
  }

  async list(user: AccessTokenPayload) {
    const events = await this.prisma.accessEvent.findMany({ where: { orgId: user.org_id, userId: user.sub }, orderBy: { accessedAt: 'desc' }, take: 100 });
    const seen = new Set<string>();
    const result: Array<{ id: string; resourceType: ResourceType; resourceId: string; name: string; action: string; accessedAt: Date }> = [];
    for (const event of events) {
      const key = `${event.resourceType}:${event.resourceId}`;
      if (seen.has(key)) continue;
      const resource = event.resourceType === ResourceType.FILE
        ? await this.prisma.file.findFirst({ where: { id: event.resourceId, orgId: user.org_id, deletedAt: null }, select: { id: true, name: true } })
        : await this.prisma.folder.findFirst({ where: { id: event.resourceId, orgId: user.org_id }, select: { id: true, name: true } });
      if (resource) { seen.add(key); result.push({ id: event.id, resourceType: event.resourceType, resourceId: event.resourceId, name: resource.name, action: event.action, accessedAt: event.accessedAt }); }
    }
    return result;
  }
}
