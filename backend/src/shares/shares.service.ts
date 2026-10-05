import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuditAction,
  MembershipStatus,
  Prisma,
  ResourceType,
  SharePermission,
  ShareStatus,
} from '@prisma/client';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { runWithTenant } from '../auth/tenant-context';
import {
  createShareToken,
  hashSecret,
  verifySecret,
} from '../crypto/secret-hash';
import type { AccessibleResource } from '../permissions/permission.service';
import { EffectivePermissionService } from '../permissions/effective-permission.service';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE, type StorageService } from '../storage/storage.types';
import type { CreateShareInput } from './create-share.schema';
import { shareNoticeEmail } from '../mail/email-templates';
import { MailService } from '../mail/mail.service';
import { DlpService } from '../dlp/dlp.service';
import { FollowsService } from '../follows/follows.service';

export type CreateShareResponse = {
  link_url: string;
  emailed?: number;
};

export type VerifyShareResponse = {
  resource_type: ResourceType;
  resource_id: string;
  can_download: boolean;
  expires_at: string | null;
  download_url: string | null;
};

const SHARE_PERMISSIONS: SharePermission[] = [
  SharePermission.VIEW,
  SharePermission.COMMENT,
  SharePermission.EDIT,
  SharePermission.ORGANIZE,
  SharePermission.FULL_ACCESS,
];

@Injectable()
export class SharesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly effective: EffectivePermissionService,
    private readonly config: ConfigService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    private readonly mail: MailService,
    private readonly dlp: DlpService,
    private readonly follows: FollowsService,
  ) {}

  async createShare(user: AccessTokenPayload, input: CreateShareInput): Promise<CreateShareResponse> {
    const resource = await this.loadOwnedResource(input.resourceType, input.resourceId);
    if (!resource || resource.orgId !== user.org_id) throw new NotFoundException('Resource not found');
    const access = await this.effective.resolve(user, input.resourceType, input.resourceId);
    if (!access.allowed) throw new NotFoundException('Resource not found');
    if (!await this.effective.canShare(user, input.resourceType, input.resourceId)) throw new ForbiddenException('Not allowed to share this resource');
    if (input.resourceType === ResourceType.FILE) await this.dlp.assertAllowed(user, input.resourceId, 'EXTERNAL_SHARE');
    else await this.dlp.assertFolderExternalShare(user, input.resourceId);

    if (resource.teamFolderId) {
      const teamFolder = await this.prisma.teamFolder.findFirst({ where: { id: resource.teamFolderId, orgId: user.org_id }, select: { allowExternalSharing: true } });
      if (teamFolder && !teamFolder.allowExternalSharing) throw new ForbiddenException('External sharing is disabled for this Team Folder');
    }
    const orgPolicy = await this.prisma.securityPolicy.findFirst({ where: { orgId: user.org_id }, select: { allowExternalSharing: true, allowPublicLinks: true, maxShareDays: true } });
    if (orgPolicy && !orgPolicy.allowExternalSharing) throw new ForbiddenException('External sharing is disabled by organization policy');
    if (orgPolicy && !orgPolicy.allowPublicLinks && input.recipientUserIds.length === 0) throw new ForbiddenException('Public links are disabled by organization policy');
    // Admin Console sharing switches are additive to the core security policy.
    // Older test fixtures/databases may not have the table yet, so absence of the
    // optional settings falls back to the existing security-policy behavior.
    let consolePolicy: any = null;
    try {
      const rows = await this.prisma.$queryRawUnsafe<any[]>(`SELECT allow_direct_email_sharing AS allowDirectEmailSharing, direct_sharing_scope AS directSharingScope, allow_external_share_links AS allowExternalShareLinks, allow_download_links AS allowDownloadLinks, enforce_share_passwords AS enforceSharePasswords, default_share_expiry_days AS defaultShareExpiryDays FROM admin_console_settings WHERE org_id=? LIMIT 1`, user.org_id);
      consolePolicy = rows[0] ?? null;
    } catch {
      consolePolicy = null;
    }
    if (consolePolicy?.allowDirectEmailSharing === false && (input.emailRecipients?.length ?? 0) > 0) throw new ForbiddenException('Direct sharing via email is disabled by organization policy');
    if (consolePolicy?.allowExternalShareLinks === false && input.recipientUserIds.length === 0) throw new ForbiddenException('External share links are disabled by organization policy');
    if (consolePolicy?.allowDownloadLinks === false && input.canDownload) throw new ForbiddenException('Download links are disabled by organization policy');
    if (consolePolicy?.enforceSharePasswords && !input.password) throw new ForbiddenException('A password is required by organization policy');
    if (consolePolicy?.defaultShareExpiryDays && !input.expiresAt) {
      input.expiresAt = new Date(Date.now() + Number(consolePolicy.defaultShareExpiryDays) * 86400000);
    }
    if (orgPolicy?.maxShareDays && input.expiresAt) {
      const max = Date.now() + Number(orgPolicy.maxShareDays) * 86400000;
      if (input.expiresAt.getTime() > max) throw new ForbiddenException('Share expiration exceeds organization policy');
    }
    const uniqueRecipientIds = [...new Set(input.recipientUserIds)];
    const recipients = uniqueRecipientIds.length ? await this.prisma.organizationMembership.findMany({
      where: { userId: { in: uniqueRecipientIds }, organizationId: user.org_id, status: MembershipStatus.ACTIVE }, select: { userId: true },
    }) : [];
    if (recipients.length !== uniqueRecipientIds.length) throw new NotFoundException('One or more share recipients were not found in this organization');

    const existing = await this.findActiveOwnerShare(user, input.resourceType, input.resourceId);
    if (existing) {
      return this.mergeIntoExistingShare(user, existing, input, recipients);
    }

    const linkToken = createShareToken();
    const passwordHash = input.password ? await hashSecret(input.password) : null;

    await this.prisma.$transaction(async (tx) => {
      if (input.resourceType === ResourceType.FILE) {
        await tx.fileShare.create({ data: { orgId: user.org_id, fileId: input.resourceId, createdById: user.sub, permission: input.permission as SharePermission, status: ShareStatus.ACTIVE, linkToken, passwordHash, expiresAt: input.expiresAt ?? null, canDownload: input.canDownload, downloadLimit: input.downloadLimit ?? null, requestUserData: input.requestUserData?.length ? input.requestUserData : undefined, recipients: recipients.length ? { create: recipients.map(r => ({ orgId: user.org_id, userId: r.userId, permission: input.permission as SharePermission })) } : undefined } });
        await tx.fileActivity.create({ data: { orgId: user.org_id, fileId: input.resourceId, userId: user.sub, action: AuditAction.SHARE, metadata: { recipientCount: recipients.length, permission: input.permission, publicLink: recipients.length === 0 } } });
      } else {
        await tx.folderShare.create({ data: { orgId: user.org_id, folderId: input.resourceId, createdById: user.sub, permission: input.permission as SharePermission, status: ShareStatus.ACTIVE, linkToken, passwordHash, expiresAt: input.expiresAt ?? null, canDownload: input.canDownload, downloadLimit: input.downloadLimit ?? null, requestUserData: input.requestUserData?.length ? input.requestUserData : undefined, recipients: recipients.length ? { create: recipients.map(r => ({ orgId: user.org_id, userId: r.userId, permission: input.permission as SharePermission })) } : undefined } });
      }
      await tx.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'SHARE_CREATED', resourceType: input.resourceType, resourceId: input.resourceId } });
      await tx.accessEvent.create({ data: { orgId: user.org_id, userId: user.sub, resourceType: input.resourceType, resourceId: input.resourceId, action: 'SHARE' } });
    });
    const linkUrl = this.shareLink(linkToken);
    const resourceName = input.resourceType === ResourceType.FILE
      ? (await this.prisma.file.findUnique({ where: { id: input.resourceId }, select: { name: true } }))?.name
      : (await this.prisma.folder.findUnique({ where: { id: input.resourceId }, select: { name: true } }))?.name;
    const memberEmails = uniqueRecipientIds.length
      ? (await this.prisma.user.findMany({ where: { id: { in: uniqueRecipientIds } }, select: { email: true } })).map((u) => u.email).filter(Boolean) as string[]
      : [];
    const emailed = await this.emailShareLink([...(input.emailRecipients ?? []), ...memberEmails], resourceName ?? '', linkUrl);
    void this.follows.notifyResourceEvent({
      orgId: user.org_id,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      folderId: input.resourceType === ResourceType.FILE ? (resource as { folderId?: string | null }).folderId ?? null : null,
      actorUserId: user.sub,
      action: AuditAction.SHARE,
      resourceName: resourceName ?? '',
    }).catch(() => undefined);
    return { link_url: linkUrl, emailed };
  }

  async listSharedWithMe(user: AccessTokenPayload) {
    const folderRows = await this.prisma.folderShareRecipient.findMany({ where: { orgId: user.org_id, userId: user.sub }, include: { share: { include: { folder: { include: { owner: { select: { id: true, name: true, email: true } } } } } } } });
    const folderResults = folderRows.flatMap((row: any) => {
      const share = row.share; const folder = share.folder; if (!folder || share.status !== ShareStatus.ACTIVE || this.isInactive(share.expiresAt)) return [];
      return [{ id: share.id, resourceType: ResourceType.FOLDER, resourceId: folder.id, name: folder.name, owner: folder.owner, permission: row.permission ?? share.permission, canDownload: share.canDownload, createdAt: folder.updatedAt, updatedAt: folder.updatedAt, expiresAt: share.expiresAt }];
    });
    const rows = await this.prisma.fileShareRecipient.findMany({
      where: { orgId: user.org_id, userId: user.sub },
      include: { share: true },
    });

    const result = [] as any[];

    const now = new Date();

    for (const row of rows) {
      const share = row.share;

      if (share.status !== ShareStatus.ACTIVE) continue;

      if (share.expiresAt && share.expiresAt.getTime() <= now.getTime()) {
        await this.prisma.fileShare.updateMany({
          where: { id: share.id, status: ShareStatus.ACTIVE },
          data: { status: ShareStatus.EXPIRED },
        });
        continue;
      }

      const resource = await this.prisma.file.findFirst({
        where: { id: share.fileId, orgId: user.org_id, deletedAt: null },
        select: {
          id: true,
          name: true,
          mimeType: true,
          size: true,
          createdAt: true,
          updatedAt: true,
          owner: { select: { id: true, name: true, email: true } },
        },
      });

      if (!resource) continue;

      result.push({
        id: share.id,
        resourceType: ResourceType.FILE,
        resourceId: share.fileId,
        name: resource.name,
        owner: resource.owner,
        permission: row.permission ?? share.permission,
        canDownload: share.canDownload,
        createdAt: resource.createdAt,
        updatedAt: resource.updatedAt,
        mimeType: resource.mimeType,
        size: resource.size,
        expiresAt: share.expiresAt,
      });
    }

    return [...folderResults, ...result];
  }

  async listSharedByMe(user: AccessTokenPayload) {
    const rows = await this.prisma.fileShare.findMany({
      where: { orgId: user.org_id, createdById: user.sub },
      include: {
        file: { select: { id: true, name: true, mimeType: true, size: true, owner: { select: { id: true, name: true, email: true } } } },
        recipients: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    const result = [] as any[];

    for (const row of rows) {
      if (!row.recipients.length && !row.linkToken) continue;

      result.push({
        id: row.id,
        resourceType: ResourceType.FILE,
        resourceId: row.fileId,
        linkUrl: `${this.config.get<string>('PUBLIC_APP_URL') ?? ''}/share/public?token=${encodeURIComponent(row.linkToken)}`,
        name: row.file?.name ?? null,
        owner: row.file?.owner ?? null,
        mimeType: (row.file as any)?.mimeType ?? null,
        size: (row.file as any)?.size ?? null,
        status: row.status,
        permission: row.permission,
        recipients: row.recipients.map((recipient) => ({
          userId: recipient.userId,
          permission: recipient.permission,
          user: recipient.user,
        })),
        expiresAt: row.expiresAt,
        revokedAt: row.revokedAt,
        canDownload: row.canDownload,
      });
    }

    const folderRows = await this.prisma.folderShare.findMany({ where: { orgId: user.org_id, createdById: user.sub }, include: { folder: { select: { id: true, name: true, owner: { select: { id: true, name: true, email: true } } } }, recipients: { include: { user: { select: { id: true, name: true, email: true } } } } } });
    for (const row of folderRows) {
      if (!row.recipients.length && !row.linkToken) continue;
      result.push({ id: row.id, resourceType: ResourceType.FOLDER, resourceId: row.folderId, linkUrl: `${this.config.get<string>('PUBLIC_APP_URL') ?? ''}/share/public?token=${encodeURIComponent(row.linkToken)}`, name: row.folder?.name ?? null, owner: row.folder?.owner ?? null, status: row.status, permission: row.permission, recipients: row.recipients.map((r: any) => ({ userId: r.userId, permission: r.permission, user: r.user })), expiresAt: row.expiresAt, revokedAt: row.revokedAt, canDownload: row.canDownload });
    }
    return result;
  }

  async updateRecipient(user: AccessTokenPayload, shareId: string, userId: string, permission: string) {
    if (!SHARE_PERMISSIONS.includes(permission as SharePermission)) throw new ForbiddenException('Invalid share permission');
    const folderShare = await this.prisma.folderShare.findFirst({ where: { id: shareId, orgId: user.org_id } });
    if (folderShare) {
      const folder = await this.prisma.folder.findFirst({ where: { id: folderShare.folderId, orgId: user.org_id } });
      if (!folder || !(await this.effective.canShare(user, ResourceType.FOLDER, folder.id))) throw new ForbiddenException('Not allowed to manage this share');
      const recipient = await this.prisma.folderShareRecipient.findFirst({ where: { shareId, userId, orgId: user.org_id } });
      if (!recipient) throw new NotFoundException('Recipient access not found');
      await this.prisma.folderShareRecipient.update({ where: { id: recipient.id }, data: { permission: permission as SharePermission } });
      await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'SHARE_PERMISSION_CHANGED', resourceType: ResourceType.FOLDER, resourceId: folderShare.folderId } });
      await this.prisma.accessEvent.create({ data: { orgId: user.org_id, userId: user.sub, resourceType: ResourceType.FOLDER, resourceId: folderShare.folderId, action: 'SHARE' } });
      return { shareId, userId, permission };
    }

    if (!SHARE_PERMISSIONS.includes(permission as SharePermission)) {
      throw new ForbiddenException('Invalid share permission');
    }

    const share = await this.prisma.fileShare.findFirst({
      where: { id: shareId, orgId: user.org_id },
    });

    if (!share) throw new NotFoundException('Share not found');

    const resource = await this.loadOwnedResource(
      ResourceType.FILE,
      share.fileId,
    );

    if (!resource) throw new NotFoundException('Resource not found');

    if (!(await this.effective.canShare(user, ResourceType.FILE, share.fileId))) {
      throw new ForbiddenException('Not allowed to manage this share');
    }

    const recipient = await this.prisma.fileShareRecipient.findFirst({
      where: { shareId, userId, orgId: user.org_id },
    });

    if (!recipient) throw new NotFoundException('Recipient access not found');

    await this.prisma.$transaction([
      this.prisma.fileShareRecipient.update({
        where: { id: recipient.id },
        data: { permission: permission as SharePermission },
      }),
      this.prisma.fileActivity.create({
        data: {
          orgId: user.org_id,
          fileId: share.fileId,
          userId: user.sub,
          action: AuditAction.CHANGE_PERMISSION,
          metadata: { shareId, userId, permission },
        },
      }),
      this.prisma.auditLog.create({
        data: {
          orgId: user.org_id,
          actorId: user.sub,
          action: 'SHARE_PERMISSION_CHANGED',
          resourceType: ResourceType.FILE,
          resourceId: share.fileId,
        },
      }),
      this.prisma.accessEvent.create({
        data: { orgId: user.org_id, userId: user.sub, resourceType: ResourceType.FILE, resourceId: share.fileId, action: 'SHARE' },
      }),
    ]);

    return { shareId, userId, permission };
  }

  async removeRecipient(user: AccessTokenPayload, shareId: string, userId: string) {
    const folderShare = await this.prisma.folderShare.findFirst({ where: { id: shareId, orgId: user.org_id } });
    if (folderShare) {
      const folder = await this.prisma.folder.findFirst({ where: { id: folderShare.folderId, orgId: user.org_id } });
      if (!folder || !(await this.effective.canShare(user, ResourceType.FOLDER, folder.id))) throw new ForbiddenException('Not allowed to manage this share');
      const result = await this.prisma.folderShareRecipient.deleteMany({ where: { shareId, userId, orgId: user.org_id } });
      if (!result.count) throw new NotFoundException('Recipient access not found');
      await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'SHARE_ACCESS_REMOVED', resourceType: ResourceType.FOLDER, resourceId: folderShare.folderId } });
      await this.prisma.accessEvent.create({ data: { orgId: user.org_id, userId: user.sub, resourceType: ResourceType.FOLDER, resourceId: folderShare.folderId, action: 'SHARE' } });
      return { shareId, userId, removed: true };
    }

    const share = await this.prisma.fileShare.findFirst({
      where: { id: shareId, orgId: user.org_id },
    });

    if (!share) throw new NotFoundException('Share not found');

    const resource = await this.loadOwnedResource(
      ResourceType.FILE,
      share.fileId,
    );

    if (!resource) throw new NotFoundException('Resource not found');

    if (!(await this.effective.canShare(user, ResourceType.FILE, share.fileId))) {
      throw new ForbiddenException('Not allowed to manage this share');
    }

    await this.prisma.$transaction(async (tx) => {
      const result = await tx.fileShareRecipient.deleteMany({
        where: { shareId, userId, orgId: user.org_id },
      });

      if (!result.count) {
        throw new NotFoundException('Recipient access not found');
      }

      await tx.fileActivity.create({
        data: {
          orgId: user.org_id,
          fileId: share.fileId,
          userId: user.sub,
          action: AuditAction.UNSHARE,
          metadata: { shareId, userId },
        },
      });

      await tx.auditLog.create({
        data: {
          orgId: user.org_id,
          actorId: user.sub,
          action: 'SHARE_ACCESS_REMOVED',
          resourceType: ResourceType.FILE,
          resourceId: share.fileId,
        },
      });
      await tx.accessEvent.create({ data: { orgId: user.org_id, userId: user.sub, resourceType: ResourceType.FILE, resourceId: share.fileId, action: 'SHARE' } });
    });

    return { shareId, userId, removed: true };
  }

  async revokeShare(user: AccessTokenPayload, shareId: string) {
    const folderShare = await this.prisma.folderShare.findFirst({ where: { id: shareId, orgId: user.org_id } });
    if (folderShare) {
      if (folderShare.status === ShareStatus.REVOKED) return { id: shareId, revoked: true };
      const folder = await this.prisma.folder.findFirst({ where: { id: folderShare.folderId, orgId: user.org_id } });
      if (!folder || !(await this.effective.canShare(user, ResourceType.FOLDER, folder.id))) throw new ForbiddenException('Not allowed to revoke this share');
      await this.prisma.folderShare.update({ where: { id: shareId }, data: { status: ShareStatus.REVOKED, revokedAt: new Date() } });
      await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'SHARE_REVOKED', resourceType: ResourceType.FOLDER, resourceId: folderShare.folderId } });
      await this.prisma.accessEvent.create({ data: { orgId: user.org_id, userId: user.sub, resourceType: ResourceType.FOLDER, resourceId: folderShare.folderId, action: 'SHARE' } });
      return { id: shareId, revoked: true };
    }

    const share = await this.prisma.fileShare.findFirst({
      where: { id: shareId, orgId: user.org_id },
    });

    if (!share) throw new NotFoundException('Share not found');

    if (share.status === ShareStatus.REVOKED) {
      return { id: shareId, revoked: true };
    }

    const resource = await this.loadOwnedResource(
      ResourceType.FILE,
      share.fileId,
    );

    if (!resource) throw new NotFoundException('Resource not found');

    if (!(await this.effective.canShare(user, ResourceType.FILE, share.fileId))) {
      throw new ForbiddenException('Not allowed to revoke this share');
    }

    await this.prisma.$transaction([
      this.prisma.fileShare.update({
        where: { id: shareId },
        data: { status: ShareStatus.REVOKED, revokedAt: new Date() },
      }),
      this.prisma.fileActivity.create({
        data: {
          orgId: user.org_id,
          fileId: share.fileId,
          userId: user.sub,
          action: AuditAction.UNSHARE,
          metadata: { shareId, revoked: true },
        },
      }),
      this.prisma.auditLog.create({
        data: {
          orgId: user.org_id,
          actorId: user.sub,
          action: 'SHARE_REVOKED',
          resourceType: ResourceType.FILE,
          resourceId: share.fileId,
        },
      }),
      this.prisma.accessEvent.create({
        data: { orgId: user.org_id, userId: user.sub, resourceType: ResourceType.FILE, resourceId: share.fileId, action: 'SHARE' },
      }),
    ]);

    return { id: shareId, revoked: true };
  }

  async verifyPublicShare(token: string, password?: string, userData?: Record<string, string>): Promise<VerifyShareResponse & { items?: Array<Record<string, unknown>>; request_user_data?: string[]; download_limit?: number | null }> {
    const fileShare = await this.prisma.fileShare.findFirst({ where: { linkToken: token } });
    const folderShare = fileShare ? null : await this.prisma.folderShare.findFirst({ where: { linkToken: token } });
    const share: any = fileShare ?? folderShare;
    if (!share || share.status !== ShareStatus.ACTIVE) throw new NotFoundException('Share not found');
    if (this.isInactive(share.expiresAt)) { if (fileShare) await this.prisma.fileShare.updateMany({ where: { id: share.id, status: ShareStatus.ACTIVE }, data: { status: ShareStatus.EXPIRED } }); else await this.prisma.folderShare.updateMany({ where: { id: share.id, status: ShareStatus.ACTIVE }, data: { status: ShareStatus.EXPIRED } }); throw new NotFoundException('Share not found'); }
    if (share.passwordHash && (!password || !(await verifySecret(password, share.passwordHash)))) throw new UnauthorizedException('Invalid share password');
    const requested: string[] = Array.isArray(share.requestUserData) ? share.requestUserData.filter((v: unknown): v is string => typeof v === 'string') : [];
    const missingRequestedData = requested.filter((key) => !userData?.[key]?.trim());
    if (missingRequestedData.length) {
      return { resource_type: fileShare ? ResourceType.FILE : ResourceType.FOLDER, resource_id: fileShare ? share.fileId : share.folderId, can_download: false, expires_at: share.expiresAt?.toISOString() ?? null, download_url: null, request_user_data: requested, download_limit: share.downloadLimit ?? null };
    }
    const metadata = { shareId: share.id, ...(userData ? { userData } : {}) };
    if (fileShare) {
      if (share.downloadLimit && Number(share.downloadCount ?? 0) >= Number(share.downloadLimit)) {
        return { resource_type: ResourceType.FILE, resource_id: share.fileId, can_download: false, expires_at: share.expiresAt?.toISOString() ?? null, download_url: null, request_user_data: requested, download_limit: share.downloadLimit };
      }
      if (share.downloadLimit) await this.prisma.fileShare.update({ where: { id: share.id }, data: { downloadCount: { increment: 1 } } });
      await this.prisma.auditLog.create({ data: { orgId: share.orgId, actorId: null, action: 'PUBLIC_SHARE_ACCESSED', resourceType: ResourceType.FILE, resourceId: share.fileId, metadata } });
      const blocked = await this.dlp.isOrgActionBlocked(share.orgId, share.fileId, 'DOWNLOAD');
      return { resource_type: ResourceType.FILE, resource_id: share.fileId, can_download: share.canDownload && !blocked, expires_at: share.expiresAt?.toISOString() ?? null, download_url: blocked ? null : await this.publicDownloadUrl(share), request_user_data: requested, download_limit: share.downloadLimit ?? null };
    }
    if (share.downloadLimit && Number(share.downloadCount ?? 0) >= Number(share.downloadLimit)) {
      return { resource_type: ResourceType.FOLDER, resource_id: share.folderId, can_download: false, expires_at: share.expiresAt?.toISOString() ?? null, download_url: null, items: [], request_user_data: requested, download_limit: share.downloadLimit };
    }
    if (share.downloadLimit) await this.prisma.folderShare.update({ where: { id: share.id }, data: { downloadCount: { increment: 1 } } });
    await this.prisma.auditLog.create({ data: { orgId: share.orgId, actorId: null, action: 'PUBLIC_SHARE_ACCESSED', resourceType: ResourceType.FOLDER, resourceId: share.folderId, metadata } });
    const items = await this.publicFolderItems(share);
    return { resource_type: ResourceType.FOLDER, resource_id: share.folderId, can_download: share.canDownload, expires_at: share.expiresAt?.toISOString() ?? null, download_url: null, items, request_user_data: requested, download_limit: share.downloadLimit ?? null };
  }

  private async publicFolderItems(share: { orgId: string; folderId: string; canDownload: boolean }) {
    const result: any[] = [];
    const walk = async (folderId: string, path: string) => {
      const [folders, files] = await Promise.all([
        this.prisma.folder.findMany({ where: { orgId: share.orgId, parentId: folderId }, select: { id: true, name: true } }),
        this.prisma.file.findMany({ where: { orgId: share.orgId, folderId, deletedAt: null }, include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } } }),
      ]);
      for (const folder of folders) {
        const nextPath = path ? `${path}/${folder.name}` : folder.name;
        result.push({ resource_type: ResourceType.FOLDER, resource_id: folder.id, name: folder.name, path: nextPath, download_url: null });
        await walk(folder.id, nextPath);
      }
      for (const file of files) {
        const version = file.versions[0]; let download_url: string | null = null;
        if (share.canDownload && version && !(await this.dlp.isOrgActionBlocked(share.orgId, file.id, 'DOWNLOAD'))) {
          const signed = await runWithTenant({ orgId: share.orgId, userId: file.ownerId }, () => this.storage.createDownloadUrl({ fileId: file.id, versionId: version.id, ownerOrgId: share.orgId, contentType: version.mimeType, fileName: file.name }));
          download_url = signed.url;
        }
        result.push({ resource_type: ResourceType.FILE, resource_id: file.id, name: file.name, path: path ? `${path}/${file.name}` : file.name, mime_type: file.mimeType, size: Number(file.size ?? 0), download_url });
      }
    };
    await walk(share.folderId, '');
    return result.slice(0, 500);
  }

  private async publicDownloadUrl(share: {
    orgId: string;
    fileId: string;
    canDownload: boolean;
  }): Promise<string | null> {
    if (!share.canDownload || await this.dlp.isOrgActionBlocked(share.orgId, share.fileId, 'DOWNLOAD')) {
      return null;
    }

    const file = await this.prisma.file.findFirst({
      where: { id: share.fileId, orgId: share.orgId, deletedAt: null },
      include: {
        versions: { orderBy: { versionNumber: 'desc' }, take: 1 },
      },
    });

    const version = file?.versions[0];
    if (!file || !version) {
      return null;
    }

    const signed = await runWithTenant(
      { orgId: share.orgId, userId: file.ownerId },
      () =>
        this.storage.createDownloadUrl({
          fileId: file.id,
          versionId: version.id,
          ownerOrgId: share.orgId,
          contentType: version.mimeType,
        }),
    );

    return signed.url;
  }

  private isInactive(expiresAt: Date | null): boolean {
    return Boolean(expiresAt && expiresAt.getTime() <= Date.now());
  }

  private async findActiveOwnerShare(user: AccessTokenPayload, resourceType: ResourceType, resourceId: string) {
    const now = new Date();
    if (resourceType === ResourceType.FILE) {
      return this.prisma.fileShare.findFirst({
        where: {
          orgId: user.org_id,
          createdById: user.sub,
          fileId: resourceId,
          status: ShareStatus.ACTIVE,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        include: { recipients: true },
        orderBy: { createdAt: 'desc' },
      });
    }
    return this.prisma.folderShare.findFirst({
      where: {
        orgId: user.org_id,
        createdById: user.sub,
        folderId: resourceId,
        status: ShareStatus.ACTIVE,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      include: { recipients: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async mergeIntoExistingShare(
    user: AccessTokenPayload,
    existing: { id: string; linkToken: string; fileId?: string; folderId?: string; recipients: Array<{ userId: string }> },
    input: CreateShareInput,
    recipients: Array<{ userId: string }>,
  ): Promise<CreateShareResponse> {
    const passwordHash = input.password ? await hashSecret(input.password) : undefined;
    const shareData = {
      permission: input.permission as SharePermission,
      expiresAt: input.expiresAt ?? null,
      canDownload: input.canDownload,
      downloadLimit: input.downloadLimit ?? null,
      requestUserData: input.requestUserData?.length ? input.requestUserData : Prisma.JsonNull,
      ...(passwordHash ? { passwordHash } : {}),
    };
    const existingRecipientIds = new Set(existing.recipients.map((row) => row.userId));
    const newRecipients = recipients.filter((row) => !existingRecipientIds.has(row.userId));

    await this.prisma.$transaction(async (tx) => {
      if (input.resourceType === ResourceType.FILE) {
        await tx.fileShare.update({ where: { id: existing.id }, data: shareData });
        if (newRecipients.length) {
          await tx.fileShareRecipient.createMany({
            data: newRecipients.map((row) => ({
              orgId: user.org_id,
              shareId: existing.id,
              userId: row.userId,
              permission: input.permission as SharePermission,
            })),
            skipDuplicates: true,
          });
        }
      } else {
        await tx.folderShare.update({ where: { id: existing.id }, data: shareData });
        if (newRecipients.length) {
          await tx.folderShareRecipient.createMany({
            data: newRecipients.map((row) => ({
              orgId: user.org_id,
              shareId: existing.id,
              userId: row.userId,
              permission: input.permission as SharePermission,
            })),
            skipDuplicates: true,
          });
        }
      }
    });

    const linkUrl = this.shareLink(existing.linkToken);
    const emailed = await this.emailShareLink(input.emailRecipients, '', linkUrl);
    return { link_url: linkUrl, emailed };
  }

  private shareLink(token: string) {
    const base = (this.config.get<string>('FRONTEND_URL') ?? this.config.get<string>('PUBLIC_APP_URL') ?? 'http://localhost:3000').replace(/\/$/, '');
    return `${base}/share/public?token=${encodeURIComponent(token)}`;
  }

  private async emailShareLink(recipients: string[] | undefined, resourceName: string, link: string) {
    const addresses = [...new Set((recipients ?? []).map((value) => value.trim().toLowerCase()).filter((value) => /^\S+@\S+\.\S+$/.test(value)))];
    const rendered = shareNoticeEmail({ resourceName, link });
    let emailed = 0;
    for (const to of addresses) {
      const sent = await this.mail.send({ to, ...rendered }).catch(() => ({ delivered: false }));
      if (sent.delivered) emailed += 1;
    }
    return emailed;
  }

  private async loadOwnedResource(
    type: ResourceType,
    id: string,
  ): Promise<AccessibleResource | null> {
    if (type === ResourceType.FILE) {
      const file = await this.prisma.file.findFirst({
        where: { id, deletedAt: null },
        include: { folder: { select: { teamFolderId: true } } },
      });

      return file
        ? {
            orgId: file.orgId,
            ownerId: file.ownerId,
            teamFolderId: file.folder?.teamFolderId ?? null,
          }
        : null;
    }

    const folder = await this.prisma.folder.findFirst({ where: { id } });

    return folder
      ? {
          orgId: folder.orgId,
          ownerId: folder.ownerId,
          teamFolderId: folder.teamFolderId ?? null,
        }
      : null;
  }
}