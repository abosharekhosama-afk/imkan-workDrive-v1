import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ResourceType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../permissions/permission.service';
@Injectable()
export class WorkspaceLabelsService {
  constructor(private readonly prisma: PrismaService, private readonly permissions: PermissionService) {}
  private scope(user: AccessTokenPayload) { return { orgId: user.org_id, userId: user.sub }; }
  async list(user: AccessTokenPayload) {
    const rows = await this.prisma.workspaceLabel.findMany({ where: this.scope(user), orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], include: { _count: { select: { resources: true } } } });
    return rows.map(({ _count, ...row }) => ({ ...row, resourceCount: _count.resources }));
  }
  async create(user: AccessTokenPayload, input: { name: string; color?: string }) {
    const name = String(input.name ?? '').trim().slice(0, 80); if (!name) throw new BadRequestException('Label name is required');
    const color = /^#[0-9a-fA-F]{6}$/.test(input.color ?? '') ? input.color! : '#3B82F6';
    return this.prisma.workspaceLabel.create({ data: { id: randomUUID(), ...this.scope(user), name, color } });
  }
  async update(user: AccessTokenPayload, id: string, input: { name?: string; color?: string; position?: number }) {
    const row = await this.prisma.workspaceLabel.findFirst({ where: { id, ...this.scope(user) } }); if (!row) throw new NotFoundException('Label not found');
    const data: { name?: string; color?: string; position?: number } = {};
    if (input.name !== undefined) { const name = input.name.trim().slice(0, 80); if (!name) throw new BadRequestException('Label name is required'); data.name = name; }
    if (input.color !== undefined) { if (!/^#[0-9a-fA-F]{6}$/.test(input.color)) throw new BadRequestException('Invalid label color'); data.color = input.color; }
    if (input.position !== undefined) data.position = Math.max(0, Math.min(10000, Math.trunc(input.position)));
    return this.prisma.workspaceLabel.update({ where: { id }, data });
  }
  async remove(user: AccessTokenPayload, id: string) { const row = await this.prisma.workspaceLabel.findFirst({ where: { id, ...this.scope(user) } }); if (!row) throw new NotFoundException('Label not found'); await this.prisma.workspaceLabel.delete({ where: { id } }); return { removed: true }; }
  private async label(user: AccessTokenPayload, id: string) { const row = await this.prisma.workspaceLabel.findFirst({ where: { id, ...this.scope(user) } }); if (!row) throw new NotFoundException('Label not found'); return row; }
  private async assertReadable(user: AccessTokenPayload, type: ResourceType, resourceId: string) {
    const resource = type === ResourceType.FILE
      ? await this.prisma.file.findFirst({ where: { id: resourceId, orgId: user.org_id, deletedAt: null }, include: { folder: { select: { teamFolderId: true } } } })
      : await this.prisma.folder.findFirst({ where: { id: resourceId, orgId: user.org_id } });
    if (!resource) throw new NotFoundException('Resource not found');
    const teamFolderId = 'folder' in resource ? resource.folder?.teamFolderId : resource.teamFolderId;
    if (!this.permissions.canRead(user, { orgId: resource.orgId, ownerId: resource.ownerId, teamFolderId })) throw new NotFoundException('Resource not found');
  }
  async attach(user: AccessTokenPayload, labelId: string, type: ResourceType, resourceId: string) {
    await this.label(user, labelId); await this.assertReadable(user, type, resourceId);
    return this.prisma.workspaceLabelResource.upsert({ where: { labelId_resourceType_resourceId: { labelId, resourceType: type, resourceId } }, create: { id: randomUUID(), ...this.scope(user), labelId, resourceType: type, resourceId }, update: {} });
  }
  async detach(user: AccessTokenPayload, labelId: string, type: ResourceType, resourceId: string) { await this.label(user, labelId); await this.prisma.workspaceLabelResource.deleteMany({ where: { ...this.scope(user), labelId, resourceType: type, resourceId } }); return { removed: true }; }
  async resources(user: AccessTokenPayload, labelId: string) {
    await this.label(user, labelId);
    const rows = await this.prisma.workspaceLabelResource.findMany({ where: { ...this.scope(user), labelId }, orderBy: { createdAt: 'desc' } });
    const result: Array<Record<string, unknown>> = [];
    for (const row of rows) {
      const resource = row.resourceType === ResourceType.FILE
        ? await this.prisma.file.findFirst({ where: { id: row.resourceId, orgId: user.org_id, deletedAt: null }, select: { id: true, name: true, mimeType: true, size: true, folderId: true, updatedAt: true } })
        : await this.prisma.folder.findFirst({ where: { id: row.resourceId, orgId: user.org_id }, select: { id: true, name: true, parentId: true, updatedAt: true } });
      if (resource) result.push({ ...row, resource });
    }
    return result;
  }
}
