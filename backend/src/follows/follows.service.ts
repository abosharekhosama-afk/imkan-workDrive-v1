import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { AuditAction, NotificationType, ResourceType } from '@prisma/client';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { NotificationsService } from '../notifications/notifications.service';
import { PermissionService } from '../permissions/permission.service';
import { PrismaService } from '../prisma/prisma.service';
import { OfficeEmailService } from '../office-email/office-email.service';

type FollowEventInput = {
  orgId: string;
  resourceType: ResourceType;
  resourceId: string;
  folderId?: string | null;
  actorUserId: string;
  action: AuditAction | string;
  resourceName: string;
};

type FollowPreferences = { notifyBell?: boolean; notifyEmail?: boolean };

@Injectable()
export class FollowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
    private readonly notifications: NotificationsService,
    private readonly email: OfficeEmailService,
  ) {}

  async list(user: AccessTokenPayload) {
    return this.prisma.resourceFollow.findMany({
      where: { orgId: user.org_id, userId: user.sub },
      orderBy: { createdAt: 'desc' },
    });
  }

  async add(user: AccessTokenPayload, resourceType: ResourceType, resourceId: string, preferences: FollowPreferences = {}) {
    await this.assertReadable(user, resourceType, resourceId);
    if (resourceType === ResourceType.FOLDER) {
      const folder = await this.prisma.folder.findFirst({ where: { id: resourceId, orgId: user.org_id }, select: { parentId: true } });
      if (folder && !folder.parentId) throw new BadRequestException('Root folders cannot be followed');
    }
    const notifyBell = preferences.notifyBell !== false;
    const notifyEmail = preferences.notifyEmail === true;
    return this.prisma.resourceFollow.upsert({
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
        notifyBell,
        notifyEmail,
      },
      update: { notifyBell, notifyEmail },
    });
  }

  async update(user: AccessTokenPayload, resourceType: ResourceType, resourceId: string, preferences: FollowPreferences) {
    await this.assertReadable(user, resourceType, resourceId);
    const row = await this.prisma.resourceFollow.findFirst({ where: { orgId: user.org_id, userId: user.sub, resourceType, resourceId } });
    if (!row) throw new NotFoundException('Follow subscription not found');
    const data: FollowPreferences = {};
    if (typeof preferences.notifyBell === 'boolean') data.notifyBell = preferences.notifyBell;
    if (typeof preferences.notifyEmail === 'boolean') data.notifyEmail = preferences.notifyEmail;
    if (data.notifyBell === undefined && data.notifyEmail === undefined) throw new BadRequestException('At least one notification preference is required');
    return this.prisma.resourceFollow.update({ where: { id: row.id }, data });
  }

  async remove(user: AccessTokenPayload, resourceType: ResourceType, resourceId: string) {
    await this.prisma.resourceFollow.deleteMany({
      where: { orgId: user.org_id, userId: user.sub, resourceType, resourceId },
    });
    return { removed: true };
  }

  async notifyResourceEvent(input: FollowEventInput) {
    const payload = this.buildNotificationPayload(input);
    if (!payload) return;

    const direct = await this.prisma.resourceFollow.findMany({
      where: {
        orgId: input.orgId,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        userId: { not: input.actorUserId },
      },
      include: { user: { select: { id: true, email: true, name: true } } },
    });

    const folderFollowers = input.resourceType === ResourceType.FILE && input.folderId
      ? await this.prisma.resourceFollow.findMany({
          where: {
            orgId: input.orgId,
            resourceType: ResourceType.FOLDER,
            resourceId: input.folderId,
            userId: { not: input.actorUserId },
          },
          include: { user: { select: { id: true, email: true, name: true } } },
        })
      : [];

    const followers = new Map<string, { notifyBell: boolean; notifyEmail: boolean; email: string | null; name: string | null }>();
    for (const row of [...direct, ...folderFollowers]) {
      const current = followers.get(row.userId);
      followers.set(row.userId, {
        notifyBell: Boolean(current?.notifyBell || row.notifyBell),
        notifyEmail: Boolean(current?.notifyEmail || row.notifyEmail),
        email: current?.email ?? row.user?.email ?? null,
        name: current?.name ?? row.user?.name ?? null,
      });
    }

    await Promise.all([...followers.entries()].map(async ([userId, preference]) => {
      if (preference.notifyBell) {
        await this.notifications.createUserNotification({
          orgId: input.orgId,
          userId,
          type: payload.type,
          title: payload.title,
          body: payload.body,
          resourceType: input.resourceType,
          resourceId: input.resourceId,
        }).catch(() => undefined);
      }
      if (preference.notifyEmail && preference.email) {
        await this.email.send({ org_id: input.orgId, sub: userId, email: preference.email } as AccessTokenPayload, {
          to: [preference.email],
          subject: payload.title,
          text: `${payload.body ?? payload.title}\n\n${input.resourceName}`,
          html: `<p>${this.escapeHtml(payload.body ?? payload.title)}</p><p><strong>${this.escapeHtml(input.resourceName)}</strong></p>`,
        }).catch(() => undefined);
      }
    }));
  }

  private buildNotificationPayload(input: FollowEventInput): { title: string; body: string; type: NotificationType } | null {
    const name = input.resourceName.trim() || (input.resourceType === ResourceType.FOLDER ? 'Folder' : 'File');
    switch (input.action) {
      case AuditAction.CREATE:
        return { type: NotificationType.FILE_UPLOADED, title: input.resourceType === ResourceType.FOLDER ? 'Folder created' : 'File uploaded', body: `${name} was added.` };
      case AuditAction.UPDATE:
        return { type: NotificationType.FILE_UPDATED, title: input.resourceType === ResourceType.FOLDER ? 'Folder updated' : 'File updated', body: `${name} was renamed or updated.` };
      case AuditAction.MOVE:
        return { type: NotificationType.FILE_UPDATED, title: input.resourceType === ResourceType.FOLDER ? 'Folder moved' : 'File moved', body: `${name} was moved.` };
      case AuditAction.COPY:
        return { type: NotificationType.FILE_UPDATED, title: input.resourceType === ResourceType.FOLDER ? 'Folder copied' : 'File copied', body: `${name} was copied.` };
      case AuditAction.DELETE:
        return { type: NotificationType.FILE_DELETED, title: input.resourceType === ResourceType.FOLDER ? 'Folder deleted' : 'File deleted', body: `${name} was moved to trash.` };
      case AuditAction.RESTORE:
        return { type: NotificationType.FILE_RESTORED, title: input.resourceType === ResourceType.FOLDER ? 'Folder restored' : 'File restored', body: `${name} was restored.` };
      case AuditAction.UPLOAD_VERSION:
        return { type: NotificationType.VERSION_CREATED, title: 'New version uploaded', body: `A new version of ${name} was uploaded.` };
      case AuditAction.SHARE:
        return { type: NotificationType.SHARE, title: input.resourceType === ResourceType.FOLDER ? 'Folder shared' : 'File shared', body: `${name} was shared.` };
      case AuditAction.COMMENT:
        return { type: NotificationType.COMMENT, title: 'New comment', body: `A comment was added on ${name}.` };
      default:
        return null;
    }
  }

  private escapeHtml(value: string) {
    return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));
  }

  private async assertReadable(user: AccessTokenPayload, resourceType: ResourceType, resourceId: string) {
    const resource =
      resourceType === ResourceType.FILE
        ? await this.prisma.file.findFirst({ where: { id: resourceId, orgId: user.org_id, deletedAt: null }, include: { folder: { select: { teamFolderId: true } } } })
        : await this.prisma.folder.findFirst({ where: { id: resourceId, orgId: user.org_id } });
    if (!resource) throw new NotFoundException('Resource not found');
    const teamFolderId = 'folder' in resource ? resource.folder?.teamFolderId : resource.teamFolderId;
    if (!this.permissions.canRead(user, { orgId: resource.orgId, ownerId: resource.ownerId, teamFolderId })) throw new NotFoundException('Resource not found');
  }
}
