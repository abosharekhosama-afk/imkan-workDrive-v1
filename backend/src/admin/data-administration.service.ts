import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { OrgRole, Prisma, StorageObjectStatus } from '@prisma/client';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE, type StorageService } from '../storage/storage.types';
import {
  LARGE_FILE_MIN_BYTES,
  classifyDataShare,
  containsLikePattern,
  dataLocationMatches,
  dataShareMatches,
  isSharePermission,
  normalizeAccessReason,
  trashExpiresAt,
  uniqueResourceIds,
} from './data-admin-logic';

type BrowseScope = 'team' | 'personal' | 'all';

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] ?? ch));
}

@Injectable()
export class DataAdministrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  private assertAdmin(user: AccessTokenPayload) {
    if (user.role !== OrgRole.ADMIN && user.role !== OrgRole.SUPER_ADMIN) throw new ForbiddenException('Admin access required');
  }

  private async requireMember(orgId: string, userId: string) {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { organizationId: orgId, userId, status: 'ACTIVE' },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    if (!membership) throw new NotFoundException('Member not found');
    return membership.user;
  }

  private async trashDays(orgId: string) {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ trashDays: number }>>(
      `SELECT trash_days AS trashDays FROM retention_policies WHERE org_id=? LIMIT 1`,
      orgId,
    );
    return rows[0]?.trashDays;
  }

  private async folderTree(orgId: string, rootIds: string[]) {
    const seen = new Set<string>();
    let frontier = rootIds.filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    while (frontier.length && seen.size < 2000) {
      const children = await this.prisma.folder.findMany({
        where: { orgId, parentId: { in: frontier } },
        select: { id: true },
      });
      frontier = [];
      for (const child of children) {
        if (seen.has(child.id)) continue;
        seen.add(child.id);
        frontier.push(child.id);
      }
    }
    return [...seen];
  }

  private async notify(orgId: string, actorId: string, userId: string, title: string, body: string, resourceType?: 'FILE' | 'FOLDER', resourceId?: string) {
    if (!userId || userId === actorId) return;
    await this.notifications.createUserNotification({
      orgId,
      userId,
      type: 'SYSTEM',
      title,
      body,
      resourceType: resourceType ?? null,
      resourceId: resourceId ?? null,
    }).catch(() => undefined);
  }

  async locations(user: AccessTokenPayload) {
    this.assertAdmin(user);
    const [teamFolders, members, trashDays] = await Promise.all([
      this.prisma.teamFolder.findMany({
        where: { orgId: user.org_id, archivedAt: null },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.organizationMembership.findMany({
        where: { organizationId: user.org_id, status: 'ACTIVE' },
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { joinedAt: 'asc' },
      }),
      this.trashDays(user.org_id),
    ]);
    return {
      teamFolders,
      members: members.map((row) => ({ id: row.user.id, name: row.user.name, email: row.user.email })),
      trashDays: [7, 15, 30, 90, 120].includes(Number(trashDays)) ? Number(trashDays) : 30,
      largeFileMinBytes: LARGE_FILE_MIN_BYTES,
    };
  }

  async recordMyFolderAccess(user: AccessTokenPayload, input: { memberId?: string; reason?: string }) {
    this.assertAdmin(user);
    const reason = normalizeAccessReason(input.reason);
    if (!input.memberId || !reason) throw new BadRequestException('Enter a reason of at least 3 characters');
    const member = await this.requireMember(user.org_id, input.memberId);
    const actor = await this.prisma.user.findUnique({ where: { id: user.sub }, select: { name: true, email: true } });
    const actorName = actor?.name || actor?.email || 'An administrator';
    await this.prisma.auditLog.create({
      data: {
        orgId: user.org_id,
        actorId: user.sub,
        action: 'DATA_ADMIN_MY_FOLDERS_ACCESS',
        resourceType: 'USER',
        resourceId: member.id,
        metadata: { reason },
      },
    });
    let emailed = false;
    if (member.id !== user.sub) {
      await this.notify(
        user.org_id,
        user.sub,
        member.id,
        'An administrator opened your My Folders',
        `${actorName} opened your My Folders. Reason: ${reason}`,
      );
      try {
        const result = await this.mail.send({
          to: member.email,
          subject: 'An administrator opened your My Folders',
          text: `${actorName} opened your My Folders in Data Administration.\nReason: ${reason}`,
          html: `<p>${escapeHtml(actorName)} opened your My Folders in Data Administration.</p><p>Reason: ${escapeHtml(reason)}</p>`,
        });
        emailed = result.delivered;
      } catch {
        emailed = false;
      }
    }
    return { ok: true, memberId: member.id, emailed };
  }

  async browse(user: AccessTokenPayload, query: { scope?: string; id?: string; q?: string; deleted?: string }) {
    this.assertAdmin(user);
    const scope = (query.scope || 'team') as BrowseScope;
    const deleted = query.deleted === '1' || query.deleted === 'true';
    const q = (query.q ?? '').trim().slice(0, 120);
    if (!deleted && scope === 'all') throw new BadRequestException('Choose a Team Folder or a member');
    if (scope === 'team') {
      if (!query.id) throw new BadRequestException('Choose a Team Folder');
      const team = await this.prisma.teamFolder.findFirst({ where: { id: query.id, orgId: user.org_id, archivedAt: null } });
      if (!team) throw new NotFoundException('Team Folder not found');
    }
    if (scope === 'personal') {
      if (!query.id && !deleted) throw new BadRequestException('Choose a member');
      if (query.id) await this.requireMember(user.org_id, query.id);
      if (!deleted && query.id) {
        const grant = await this.prisma.auditLog.findFirst({
          where: {
            orgId: user.org_id,
            actorId: user.sub,
            action: 'DATA_ADMIN_MY_FOLDERS_ACCESS',
            resourceId: query.id,
            createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
          },
        });
        if (!grant) throw new ForbiddenException('Enter a reason before opening this member My Folders');
      }
    }

    const name = q ? { contains: q } : undefined;
    const fileAnd: Prisma.FileWhereInput[] = [{ orgId: user.org_id }, { deletedAt: deleted ? { not: null } : null }];
    if (!deleted) fileAnd.push({ status: 'ACTIVE' });
    if (name) fileAnd.push({ name });
    if (scope === 'team') fileAnd.push({ folder: { teamFolderId: query.id } });
    if (scope === 'personal' && query.id) {
      fileAnd.push({
        OR: [
          { folder: { ownerId: query.id, teamFolderId: null } },
          { folderId: null, ownerId: query.id },
        ],
      });
    }
    if (scope === 'personal' && !query.id) {
      fileAnd.push({ OR: [{ folder: { teamFolderId: null } }, { folderId: null }] });
    }

    const files = await this.prisma.file.findMany({
      where: { AND: fileAnd },
      take: 200,
      orderBy: { updatedAt: 'desc' },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        folder: { select: { name: true, teamFolderId: true, teamFolder: { select: { name: true } } } },
        _count: { select: { versions: true } },
      },
    });

    const folders = deleted
      ? []
      : await this.prisma.folder.findMany({
          where: {
            orgId: user.org_id,
            ...(name ? { name } : {}),
            ...(scope === 'team' ? { teamFolderId: query.id } : {}),
            ...(scope === 'personal' && query.id ? { ownerId: query.id, teamFolderId: null } : {}),
            ...(scope === 'personal' && !query.id ? { teamFolderId: null } : {}),
            ...(scope === 'all' ? { id: 'none' } : {}),
          },
          take: 200,
          orderBy: { updatedAt: 'desc' },
          include: {
            owner: { select: { id: true, name: true, email: true } },
            teamFolder: { select: { id: true, name: true } },
          },
        });

    const fileItems = files.map((file) => ({
      id: file.id,
      kind: 'FILE' as const,
      name: file.name,
      ownerId: file.ownerId,
      ownerName: file.owner?.name || '',
      ownerEmail: file.owner?.email || '',
      size: Number(file.size),
      extension: file.extension,
      updatedAt: file.updatedAt,
      deletedAt: file.deletedAt,
      versionCount: file._count.versions,
      location: file.folder?.teamFolder?.name || file.folder?.name || 'My Folders',
      teamFolderId: file.folder?.teamFolderId ?? null,
    }));
    const folderItems = folders.map((folder) => ({
      id: folder.id,
      kind: 'FOLDER' as const,
      name: folder.name,
      ownerId: folder.ownerId,
      ownerName: folder.owner?.name || '',
      ownerEmail: folder.owner?.email || '',
      size: null,
      extension: null,
      updatedAt: folder.updatedAt,
      deletedAt: null,
      versionCount: null,
      location: folder.teamFolder?.name || 'My Folders',
      teamFolderId: folder.teamFolderId,
    }));
    return [...folderItems, ...fileItems].slice(0, 200);
  }

  async shared(user: AccessTokenPayload, query: { filter?: string; location?: string; q?: string }) {
    this.assertAdmin(user);
    const q = (query.q ?? '').trim().slice(0, 120);
    const [fileShares, folderShares] = await Promise.all([
      this.prisma.fileShare.findMany({
        where: { orgId: user.org_id, status: 'ACTIVE', ...(q ? { file: { name: { contains: q } } } : {}) },
        take: 300,
        orderBy: { createdAt: 'desc' },
        include: {
          file: { select: { id: true, name: true, owner: { select: { name: true, email: true } }, folder: { select: { name: true, teamFolderId: true, teamFolder: { select: { name: true } } } } } },
          recipients: { include: { user: { select: { id: true, name: true, email: true } } } },
        },
      }),
      this.prisma.folderShare.findMany({
        where: { orgId: user.org_id, status: 'ACTIVE', ...(q ? { folder: { name: { contains: q } } } : {}) },
        take: 300,
        orderBy: { createdAt: 'desc' },
        include: {
          folder: { select: { id: true, name: true, teamFolderId: true, teamFolder: { select: { name: true } }, owner: { select: { name: true, email: true } } } },
          recipients: { include: { user: { select: { id: true, name: true, email: true } } } },
        },
      }),
    ]);

    const rows = [
      ...fileShares.map((share) => ({
        id: share.id,
        resourceKind: 'FILE' as const,
        resourceId: share.fileId,
        name: share.file?.name || '',
        permission: share.permission,
        canDownload: share.canDownload,
        kind: classifyDataShare({ recipientCount: share.recipients.length, canDownload: share.canDownload }),
        recipients: share.recipients.map((row) => row.user),
        ownerName: share.file?.owner?.name || share.file?.owner?.email || '',
        location: share.file?.folder?.teamFolder?.name || share.file?.folder?.name || 'My Folders',
        teamFolderId: share.file?.folder?.teamFolderId ?? null,
        createdAt: share.createdAt,
      })),
      ...folderShares.map((share) => ({
        id: share.id,
        resourceKind: 'FOLDER' as const,
        resourceId: share.folderId,
        name: share.folder?.name || '',
        permission: share.permission,
        canDownload: share.canDownload,
        kind: classifyDataShare({ recipientCount: share.recipients.length, canDownload: share.canDownload }),
        recipients: share.recipients.map((row) => row.user),
        ownerName: share.folder?.owner?.name || share.folder?.owner?.email || '',
        location: share.folder?.teamFolder?.name || 'My Folders',
        teamFolderId: share.folder?.teamFolderId ?? null,
        createdAt: share.createdAt,
      })),
    ];
    return rows.filter((row) => dataShareMatches(row.kind, query.filter) && dataLocationMatches(row.teamFolderId, query.location));
  }

  async updateShare(user: AccessTokenPayload, shareId: string, input: { kind?: string; permission?: string }) {
    this.assertAdmin(user);
    if (!isSharePermission(input.permission)) throw new BadRequestException('Choose a permission');
    const permission = input.permission;
    if (input.kind === 'FOLDER') {
      const share = await this.prisma.folderShare.findFirst({ where: { id: shareId, orgId: user.org_id, status: 'ACTIVE' } });
      if (!share) throw new NotFoundException('Share not found');
      await this.prisma.folderShare.update({ where: { id: share.id }, data: { permission } });
      await this.prisma.folderShareRecipient.updateMany({ where: { shareId: share.id }, data: { permission } });
      await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'SHARE_PERMISSION_CHANGED', resourceType: 'FOLDER', resourceId: share.folderId, metadata: { permission } } });
      return { id: share.id, permission };
    }
    const share = await this.prisma.fileShare.findFirst({ where: { id: shareId, orgId: user.org_id, status: 'ACTIVE' } });
    if (!share) throw new NotFoundException('Share not found');
    await this.prisma.fileShare.update({ where: { id: share.id }, data: { permission } });
    await this.prisma.fileShareRecipient.updateMany({ where: { shareId: share.id }, data: { permission } });
    await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'SHARE_PERMISSION_CHANGED', resourceType: 'FILE', resourceId: share.fileId, metadata: { permission } } });
    return { id: share.id, permission };
  }

  async revokeShare(user: AccessTokenPayload, shareId: string, kind?: string) {
    this.assertAdmin(user);
    if (kind === 'FOLDER') {
      const share = await this.prisma.folderShare.findFirst({ where: { id: shareId, orgId: user.org_id } });
      if (!share) throw new NotFoundException('Share not found');
      if (share.status !== 'REVOKED') {
        await this.prisma.folderShare.update({ where: { id: share.id }, data: { status: 'REVOKED', revokedAt: new Date() } });
        await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'SHARE_REVOKED', resourceType: 'FOLDER', resourceId: share.folderId } });
      }
      return { id: share.id, revoked: true };
    }
    const share = await this.prisma.fileShare.findFirst({ where: { id: shareId, orgId: user.org_id } });
    if (!share) throw new NotFoundException('Share not found');
    if (share.status !== 'REVOKED') {
      await this.prisma.fileShare.update({ where: { id: share.id }, data: { status: 'REVOKED', revokedAt: new Date() } });
      await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'SHARE_REVOKED', resourceType: 'FILE', resourceId: share.fileId } });
    }
    return { id: share.id, revoked: true };
  }

  async share(user: AccessTokenPayload, input: { kind?: string; ids?: string[]; permission?: string; recipientUserId?: string; canDownload?: boolean }) {
    this.assertAdmin(user);
    if (!isSharePermission(input.permission)) throw new BadRequestException('Choose a permission');
    const ids = uniqueResourceIds(input.ids);
    if (!ids.length) throw new BadRequestException('Select at least one item');
    const permission = input.permission;
    const canDownload = input.canDownload !== false;
    if (input.recipientUserId) await this.requireMember(user.org_id, input.recipientUserId);
    const shared: string[] = [];
    for (const id of ids) {
      const linkToken = `${randomUUID().replace(/-/g, '')}${randomUUID().slice(0, 8)}`;
      if (input.kind === 'FOLDER') {
        const folder = await this.prisma.folder.findFirst({ where: { id, orgId: user.org_id }, select: { id: true, ownerId: true, name: true } });
        if (!folder) continue;
        const existing = await this.prisma.folderShare.findFirst({ where: { orgId: user.org_id, folderId: id, status: 'ACTIVE' } });
        if (existing) {
          await this.prisma.folderShare.update({ where: { id: existing.id }, data: { permission, canDownload } });
          if (input.recipientUserId) {
            await this.prisma.folderShareRecipient.upsert({
              where: { shareId_userId: { shareId: existing.id, userId: input.recipientUserId } },
              create: { orgId: user.org_id, shareId: existing.id, userId: input.recipientUserId, permission },
              update: { permission },
            });
          }
        } else {
          await this.prisma.folderShare.create({
            data: {
              orgId: user.org_id,
              folderId: id,
              createdById: user.sub,
              permission,
              status: 'ACTIVE',
              linkToken,
              canDownload,
              recipients: input.recipientUserId ? { create: { orgId: user.org_id, userId: input.recipientUserId, permission } } : undefined,
            },
          });
        }
        await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'SHARE_CREATED', resourceType: 'FOLDER', resourceId: id, metadata: { via: 'data-administration', permission } } });
        await this.notify(user.org_id, user.sub, folder.ownerId, 'An administrator shared your folder', `${folder.name} was shared from Data Administration.`, 'FOLDER', id);
      } else {
        const file = await this.prisma.file.findFirst({ where: { id, orgId: user.org_id, deletedAt: null }, select: { id: true, ownerId: true, name: true } });
        if (!file) continue;
        const existing = await this.prisma.fileShare.findFirst({ where: { orgId: user.org_id, fileId: id, status: 'ACTIVE' } });
        if (existing) {
          await this.prisma.fileShare.update({ where: { id: existing.id }, data: { permission, canDownload } });
          if (input.recipientUserId) {
            await this.prisma.fileShareRecipient.upsert({
              where: { shareId_userId: { shareId: existing.id, userId: input.recipientUserId } },
              create: { orgId: user.org_id, shareId: existing.id, userId: input.recipientUserId, permission },
              update: { permission },
            });
          }
        } else {
          await this.prisma.fileShare.create({
            data: {
              orgId: user.org_id,
              fileId: id,
              createdById: user.sub,
              permission,
              status: 'ACTIVE',
              linkToken,
              canDownload,
              recipients: input.recipientUserId ? { create: { orgId: user.org_id, userId: input.recipientUserId, permission } } : undefined,
            },
          });
        }
        await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'SHARE_CREATED', resourceType: 'FILE', resourceId: id, metadata: { via: 'data-administration', permission } } });
        await this.notify(user.org_id, user.sub, file.ownerId, 'An administrator shared your file', `${file.name} was shared from Data Administration.`, 'FILE', id);
      }
      if (input.recipientUserId) {
        await this.notify(user.org_id, user.sub, input.recipientUserId, 'An item was shared with you', 'An administrator shared an item with you from Data Administration.');
      }
      shared.push(id);
    }
    if (!shared.length) throw new NotFoundException('No items to share');
    return { shared };
  }

  async trash(user: AccessTokenPayload, input: { ids?: string[] }) {
    this.assertAdmin(user);
    const ids = uniqueResourceIds(input.ids);
    if (!ids.length) throw new BadRequestException('Select at least one file');
    const files = await this.prisma.file.findMany({ where: { id: { in: ids }, orgId: user.org_id, deletedAt: null, status: 'ACTIVE' }, select: { id: true, name: true, ownerId: true } });
    if (!files.length) throw new NotFoundException('No active files to move to trash');
    const now = new Date();
    const expiresAt = trashExpiresAt(now, await this.trashDays(user.org_id));
    for (const file of files) {
      await this.prisma.$transaction([
        this.prisma.file.update({ where: { id: file.id }, data: { status: 'TRASHED', deletedAt: now } }),
        this.prisma.trashEntry.create({ data: { id: randomUUID(), orgId: user.org_id, fileId: file.id, deletedById: user.sub, reason: 'ADMIN_DELETED', deletedAt: now, expiresAt } }),
        this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'FILE_TRASHED', resourceType: 'FILE', resourceId: file.id, metadata: { via: 'data-administration' } } }),
      ]);
    }
    const owners = new Map<string, number>();
    for (const file of files) owners.set(file.ownerId, (owners.get(file.ownerId) ?? 0) + 1);
    for (const [ownerId, count] of owners) {
      await this.notify(user.org_id, user.sub, ownerId, 'An administrator moved files to trash', `${count} file(s) were moved to trash from Data Administration.`);
    }
    return { trashed: files.map((file) => file.id), expiresAt };
  }

  async restore(user: AccessTokenPayload, input: { ids?: string[] }) {
    this.assertAdmin(user);
    const ids = uniqueResourceIds(input.ids);
    if (!ids.length) throw new BadRequestException('Select at least one file');
    const files = await this.prisma.file.findMany({ where: { id: { in: ids }, orgId: user.org_id, deletedAt: { not: null } }, select: { id: true, ownerId: true } });
    if (!files.length) throw new NotFoundException('No deleted files to restore');
    const now = new Date();
    for (const file of files) {
      await this.prisma.file.update({ where: { id: file.id }, data: { status: 'ACTIVE', deletedAt: null } });
      await this.prisma.trashEntry.updateMany({ where: { orgId: user.org_id, fileId: file.id, restoredAt: null }, data: { restoredAt: now, restoredById: user.sub } });
      await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'FILE_RESTORED', resourceType: 'FILE', resourceId: file.id, metadata: { via: 'data-administration' } } });
    }
    const owners = new Map<string, number>();
    for (const file of files) owners.set(file.ownerId, (owners.get(file.ownerId) ?? 0) + 1);
    for (const [ownerId, count] of owners) {
      await this.notify(user.org_id, user.sub, ownerId, 'An administrator restored your files', `${count} file(s) were restored from Data Administration.`);
    }
    return { restored: files.map((file) => file.id) };
  }

  private async purgeOne(user: AccessTokenPayload, id: string) {
    const file = await this.prisma.file.findFirst({
      where: { id, orgId: user.org_id, deletedAt: { not: null } },
      include: { versions: { include: { storageObject: { select: { id: true, storageKey: true } } } } },
    });
    if (!file) return null;
    const objects = file.versions.map((version) => version.storageObject).filter((object): object is { id: string; storageKey: string } => Boolean(object?.storageKey));
    for (const object of objects) await this.storage.deleteStoredObject(object.storageKey).catch(() => undefined);
    if (objects.length) {
      await this.prisma.storageObject.updateMany({ where: { id: { in: objects.map((object) => object.id) }, orgId: user.org_id }, data: { status: StorageObjectStatus.DELETED } });
    }
    await this.prisma.file.delete({ where: { id: file.id } });
    await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'FILE_PERMANENTLY_DELETED', resourceType: 'FILE', resourceId: id, metadata: { via: 'data-administration' } } });
    return file;
  }

  async purge(user: AccessTokenPayload, input: { ids?: string[] }) {
    this.assertAdmin(user);
    const ids = uniqueResourceIds(input.ids);
    if (!ids.length) throw new BadRequestException('Select at least one file');
    const deleted: string[] = [];
    const owners = new Map<string, number>();
    for (const id of ids) {
      const file = await this.purgeOne(user, id);
      if (!file) continue;
      deleted.push(file.id);
      owners.set(file.ownerId, (owners.get(file.ownerId) ?? 0) + 1);
    }
    if (!deleted.length) throw new NotFoundException('No deleted files to remove permanently');
    for (const [ownerId, count] of owners) {
      await this.notify(user.org_id, user.sub, ownerId, 'An administrator permanently deleted files', `${count} file(s) were permanently deleted from Data Administration.`);
    }
    return { deleted };
  }

  async transfer(user: AccessTokenPayload, input: { kind?: string; ids?: string[]; targetUserId?: string }) {
    this.assertAdmin(user);
    const ids = uniqueResourceIds(input.ids);
    if (!ids.length || !input.targetUserId) throw new BadRequestException('Choose items and a new owner');
    const target = await this.requireMember(user.org_id, input.targetUserId);
    const previous = new Map<string, number>();
    if (input.kind === 'FOLDER') {
      const roots = await this.prisma.folder.findMany({ where: { id: { in: ids }, orgId: user.org_id }, select: { id: true, ownerId: true } });
      if (!roots.length) throw new NotFoundException('Folder not found');
      const tree = await this.folderTree(user.org_id, roots.map((folder) => folder.id));
      const folders = await this.prisma.folder.findMany({ where: { id: { in: tree }, orgId: user.org_id }, select: { id: true, ownerId: true } });
      const files = await this.prisma.file.findMany({ where: { orgId: user.org_id, folderId: { in: tree }, deletedAt: null }, select: { id: true, ownerId: true } });
      await this.prisma.folder.updateMany({ where: { id: { in: folders.map((folder) => folder.id) }, orgId: user.org_id }, data: { ownerId: target.id } });
      if (files.length) await this.prisma.file.updateMany({ where: { id: { in: files.map((file) => file.id) }, orgId: user.org_id }, data: { ownerId: target.id } });
      for (const row of [...folders, ...files]) {
        if (row.ownerId !== target.id) previous.set(row.ownerId, (previous.get(row.ownerId) ?? 0) + 1);
      }
      for (const folder of roots) {
        await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'OWNERSHIP_TRANSFERRED', resourceType: 'FOLDER', resourceId: folder.id, metadata: { targetUserId: target.id } } });
      }
    } else {
      const files = await this.prisma.file.findMany({ where: { id: { in: ids }, orgId: user.org_id, deletedAt: null }, select: { id: true, ownerId: true, name: true } });
      if (!files.length) throw new NotFoundException('File not found');
      await this.prisma.file.updateMany({ where: { id: { in: files.map((file) => file.id) }, orgId: user.org_id }, data: { ownerId: target.id } });
      for (const file of files) {
        if (file.ownerId !== target.id) previous.set(file.ownerId, (previous.get(file.ownerId) ?? 0) + 1);
        await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'OWNERSHIP_TRANSFERRED', resourceType: 'FILE', resourceId: file.id, metadata: { targetUserId: target.id } } });
      }
    }
    await this.notify(user.org_id, user.sub, target.id, 'Ownership transferred to you', 'An administrator transferred files or folders to you from Data Administration.', input.kind === 'FOLDER' ? 'FOLDER' : 'FILE', ids[0]);
    for (const [ownerId, count] of previous) {
      await this.notify(user.org_id, user.sub, ownerId, 'Ownership of your items was transferred', `${count} item(s) were transferred to ${target.name || target.email}.`);
    }
    return { targetUserId: target.id, transferred: ids };
  }

  async largeFiles(user: AccessTokenPayload, query: { q?: string }) {
    this.assertAdmin(user);
    const pattern = containsLikePattern(query.q ?? '');
    const rows = await this.prisma.$queryRaw<Array<{
      id: string;
      name: string;
      extension: string | null;
      ownerId: string;
      ownerName: string | null;
      ownerEmail: string | null;
      updatedAt: Date;
      folderName: string | null;
      teamName: string | null;
      teamFolderId: string | null;
      versionCount: bigint | number;
      storageBytes: bigint | number;
    }>>(Prisma.sql`
      SELECT f.id,
        ANY_VALUE(f.name) AS name,
        ANY_VALUE(f.extension) AS extension,
        ANY_VALUE(f.owner_id) AS ownerId,
        ANY_VALUE(u.name) AS ownerName,
        ANY_VALUE(u.email) AS ownerEmail,
        ANY_VALUE(f.updated_at) AS updatedAt,
        ANY_VALUE(fd.name) AS folderName,
        ANY_VALUE(tm.name) AS teamName,
        ANY_VALUE(fd.team_folder_id) AS teamFolderId,
        COUNT(v.id) AS versionCount,
        COALESCE(SUM(v.size), ANY_VALUE(f.size)) AS storageBytes
      FROM files f
      LEFT JOIN users u ON u.id = f.owner_id
      LEFT JOIN folders fd ON fd.id = f.folder_id
      LEFT JOIN team_folders tm ON tm.id = fd.team_folder_id
      LEFT JOIN file_versions v ON v.file_id = f.id AND v.upload_status = 'COMPLETE' AND v.status <> 'DELETED'
      WHERE f.org_id = ${user.org_id} AND f.status = 'ACTIVE' AND f.deleted_at IS NULL AND f.name LIKE ${pattern}
      GROUP BY f.id
      HAVING storageBytes >= ${LARGE_FILE_MIN_BYTES}
      ORDER BY storageBytes DESC
      LIMIT 200
    `);
    return rows.map((row) => ({
      id: row.id,
      kind: 'FILE' as const,
      name: row.name,
      ownerId: row.ownerId,
      ownerName: row.ownerName || '',
      ownerEmail: row.ownerEmail || '',
      size: Number(row.storageBytes),
      extension: row.extension,
      updatedAt: row.updatedAt,
      deletedAt: null,
      versionCount: Number(row.versionCount),
      location: row.teamName || row.folderName || 'My Folders',
      teamFolderId: row.teamFolderId,
    }));
  }

  async versions(user: AccessTokenPayload, fileId: string) {
    this.assertAdmin(user);
    const file = await this.prisma.file.findFirst({ where: { id: fileId, orgId: user.org_id }, select: { id: true, name: true, size: true } });
    if (!file) throw new NotFoundException('File not found');
    const versions = await this.prisma.fileVersion.findMany({
      where: { fileId, orgId: user.org_id, status: { not: 'DELETED' }, uploadStatus: 'COMPLETE' },
      orderBy: { versionNumber: 'desc' },
      select: { id: true, versionNumber: true, size: true, createdAt: true, status: true },
    });
    return {
      file: { id: file.id, name: file.name, size: Number(file.size) },
      versions: versions.map((version) => ({ ...version, size: Number(version.size), latest: version.versionNumber === versions[0]?.versionNumber })),
    };
  }

  async deleteVersion(user: AccessTokenPayload, fileId: string, versionId: string) {
    this.assertAdmin(user);
    const versions = await this.prisma.fileVersion.findMany({
      where: { fileId, orgId: user.org_id, status: { not: 'DELETED' }, uploadStatus: 'COMPLETE' },
      orderBy: { versionNumber: 'desc' },
      include: { storageObject: { select: { id: true, storageKey: true } } },
    });
    const file = await this.prisma.file.findFirst({ where: { id: fileId, orgId: user.org_id, status: 'ACTIVE', deletedAt: null } });
    if (!file) throw new NotFoundException('File not found');
    if (versions.length < 2) throw new BadRequestException('The latest version is kept while it is the only version');
    const target = versions.find((version) => version.id === versionId);
    if (!target) throw new NotFoundException('Version not found');
    if (target.id === versions[0].id) throw new BadRequestException('Delete an older version. The latest version stays.');
    if (target.storageObject?.storageKey) await this.storage.deleteStoredObject(target.storageObject.storageKey).catch(() => undefined);
    await this.prisma.fileVersion.update({ where: { id: target.id }, data: { status: 'DELETED' } });
    if (target.storageObject) {
      await this.prisma.storageObject.updateMany({ where: { id: target.storageObject.id, orgId: user.org_id }, data: { status: StorageObjectStatus.DELETED } });
    }
    await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'VERSION_DELETED', resourceType: 'FILE', resourceId: fileId, metadata: { versionId, via: 'data-administration' } } });
    return { id: versionId, deleted: true };
  }
}
