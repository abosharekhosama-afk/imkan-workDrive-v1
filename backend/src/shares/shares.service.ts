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
import {
  PermissionService,
  type AccessibleResource,
} from '../permissions/permission.service';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE, type StorageService } from '../storage/storage.types';
import type { CreateShareInput } from './create-share.schema';

export type CreateShareResponse = {
  link_url: string;
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
    private readonly permissions: PermissionService,
    private readonly config: ConfigService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  async createShare(
    user: AccessTokenPayload,
    input: CreateShareInput,
  ): Promise<CreateShareResponse> {
    if (input.resourceType !== ResourceType.FILE) {
      throw new BadRequestException('Only files can be shared');
    }
    const resource = await this.loadOwnedResource(
      input.resourceType,
      input.resourceId,
    );
    if (!resource || resource.orgId !== user.org_id) {
      throw new NotFoundException('Resource not found');
    }
    const access = await this.withTeamFolderRole(user, resource);
    if (!this.permissions.canRead(user, access)) {
      throw new NotFoundException('Resource not found');
    }
    if (!this.permissions.canShare(user, access)) {
      throw new ForbiddenException('Not allowed to share this resource');
    }
    if (resource.teamFolderId) {
      const team = await this.prisma.$queryRawUnsafe<any[]>(`SELECT allow_external_sharing AS allowExternalSharing FROM team_folders WHERE id=? AND org_id=? LIMIT 1`, resource.teamFolderId, user.org_id).catch(() => []);
      if (team[0] && !team[0].allowExternalSharing) throw new ForbiddenException('External sharing is disabled for this Team Folder');
    }
    const policy = await this.prisma.$queryRawUnsafe<any[]>(`SELECT allow_external_sharing AS allowExternalSharing,allow_public_links AS allowPublicLinks,max_share_days AS maxShareDays FROM security_policies WHERE org_id=? LIMIT 1`, user.org_id).catch(() => []);
    const orgPolicy = policy[0];
    if (orgPolicy && !orgPolicy.allowExternalSharing) throw new ForbiddenException('External sharing is disabled by organization policy');
    if (orgPolicy && !orgPolicy.allowPublicLinks && input.recipientUserIds.length === 0) throw new ForbiddenException('Public links are disabled by organization policy');
    if (orgPolicy?.maxShareDays && input.expiresAt) {
      const max = Date.now() + Number(orgPolicy.maxShareDays) * 86400000;
      if (input.expiresAt.getTime() > max) throw new ForbiddenException('Share expiration exceeds organization policy');
    }

    const linkToken = createShareToken();
    const passwordHash = input.password
      ? await hashSecret(input.password)
      : null;

    const recipients = input.recipientUserIds.length
      ? await this.prisma.organizationMembership.findMany({ 
          where: { 
            userId: { in: input.recipientUserIds }, 
            organizationId: user.org_id,
            status: MembershipStatus.ACTIVE,
          }, 
          select: { userId: true } 
        })
      : [];
    if (recipients.length !== input.recipientUserIds.length) throw new NotFoundException('One or more share recipients were not found in this organization');
    await this.prisma.fileShare.create({
      data: {
        orgId: user.org_id,
        fileId: input.resourceId,
        createdById: user.sub,
        permission: input.permission,
        status: ShareStatus.ACTIVE,
        linkToken,
        passwordHash,
        expiresAt: input.expiresAt ?? null,
        canDownload: input.canDownload,
        recipients: recipients.length ? { create: recipients.map((recipient) => ({ orgId: user.org_id, userId: recipient.userId })) } : undefined,
      },
    });

    await this.prisma.$transaction([
      this.prisma.fileActivity.create({
        data: {
          orgId: user.org_id,
          fileId: input.resourceId,
          userId: user.sub,
          action: AuditAction.SHARE,
          metadata: {
            recipientCount: recipients.length,
            permission: input.permission,
            publicLink: recipients.length === 0,
          },
        },
      }),
      this.prisma.auditLog.create({
        data: {
          orgId: user.org_id,
          actorId: user.sub,
          action: 'SHARE_CREATED',
          resourceType: input.resourceType,
          resourceId: input.resourceId,
        },
      }),
    ]);

    const base = this.config.get<string>('PUBLIC_APP_URL') ?? '';
    return { link_url: `${base}/share/public/${linkToken}` };
  }


  async listSharedWithMe(user: AccessTokenPayload) {
    const rows = await this.prisma.fileShareRecipient.findMany({ where: { orgId: user.org_id, userId: user.sub }, include: { share: true } });
    const result = [] as any[];
    for (const row of rows) {
      const share = row.share;
      if (share.status !== ShareStatus.ACTIVE || this.isInactive(share.expiresAt)) continue;
      const resource = await this.prisma.file.findFirst({ where: { id: share.fileId, orgId: user.org_id }, select: { id: true, name: true, owner: { select: { id: true, name: true, email: true } } } });
      if (!resource) continue;
      result.push({ id: share.id, resourceType: ResourceType.FILE, resourceId: share.fileId, name: resource.name, owner: resource.owner, permission: share.permission, expiresAt: share.expiresAt });
    }
    return result;
  }

  async listSharedByMe(user: AccessTokenPayload) {
    const rows = await this.prisma.fileShare.findMany({ where: { orgId: user.org_id }, include: { file: { select: { id: true, name: true } }, recipients: { include: { user: { select: { id: true, name: true, email: true } } } } } });
    const result = [] as any[];
    for (const row of rows) {
      if (!row.recipients.length && !row.linkToken) continue;
      result.push({ id: row.id, resourceType: ResourceType.FILE, resourceId: row.fileId, name: row.file?.name ?? null, status: row.status, permission: row.permission, recipients: row.recipients.map((recipient) => ({ userId: recipient.userId, user: recipient.user })), expiresAt: row.expiresAt, revokedAt: row.revokedAt });
    }
    return result;
  }

  async updateRecipient(user: AccessTokenPayload, shareId: string, userId: string, permission: string) {
    if (!SHARE_PERMISSIONS.includes(permission as SharePermission)) throw new ForbiddenException('Invalid share permission');
    const share = await this.prisma.fileShare.findFirst({ where: { id: shareId, orgId: user.org_id } });
    if (!share) throw new NotFoundException('Share not found');
    const resource = await this.loadOwnedResource(ResourceType.FILE, share.fileId);
    if (!resource) throw new NotFoundException('Resource not found');
    const access = await this.withTeamFolderRole(user, resource);
    if (!this.permissions.canShare(user, access)) throw new ForbiddenException('Not allowed to manage this share');
    const recipient = await this.prisma.fileShareRecipient.findFirst({ where: { shareId, userId } });
    if (!recipient || recipient.orgId !== user.org_id) throw new NotFoundException('Recipient access not found');
    await this.prisma.fileShare.update({
      where: { id: share.id },
      data: { permission: permission as SharePermission },
    });
    await this.prisma.$transaction([
      this.prisma.fileActivity.create({
        data: {
          orgId: user.org_id,
          fileId: share.fileId,
          userId: user.sub,
          action: AuditAction.CHANGE_PERMISSION,
          metadata: { shareId, userId, permission },
        },
      }),
      this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'SHARE_PERMISSION_CHANGED', resourceType: ResourceType.FILE, resourceId: share.fileId } }),
    ]);
    return { shareId, userId, permission };
  }

  async removeRecipient(user: AccessTokenPayload, shareId: string, userId: string) {
    const share = await this.prisma.fileShare.findFirst({ where: { id: shareId, orgId: user.org_id } });
    if (!share) throw new NotFoundException('Share not found');
    const resource = await this.loadOwnedResource(ResourceType.FILE, share.fileId);
    if (!resource) throw new NotFoundException('Resource not found');
    const access = await this.withTeamFolderRole(user, resource);
    if (!this.permissions.canShare(user, access)) throw new ForbiddenException('Not allowed to manage this share');
    const result = await this.prisma.fileShareRecipient.deleteMany({ where: { shareId, userId, orgId: user.org_id } });
    if (!result.count) throw new NotFoundException('Recipient access not found');
    await this.prisma.$transaction([
      this.prisma.fileActivity.create({
        data: {
          orgId: user.org_id,
          fileId: share.fileId,
          userId: user.sub,
          action: AuditAction.UNSHARE,
          metadata: { shareId, userId },
        },
      }),
      this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'SHARE_ACCESS_REMOVED', resourceType: ResourceType.FILE, resourceId: share.fileId } }),
    ]);
    return { shareId, userId, removed: true };
  }

  async revokeShare(user: AccessTokenPayload, shareId: string) {
    const share = await this.prisma.fileShare.findFirst({ where: { id: shareId, orgId: user.org_id } });
    if (!share) throw new NotFoundException('Share not found');
    if (share.status === ShareStatus.REVOKED) return { id: shareId, revoked: true };
    const resource = await this.loadOwnedResource(ResourceType.FILE, share.fileId);
    if (!resource) throw new NotFoundException('Resource not found');
    const access = await this.withTeamFolderRole(user, resource);
    if (!this.permissions.canShare(user, access)) throw new ForbiddenException('Not allowed to revoke this share');
    await this.prisma.fileShare.update({
      where: { id: shareId },
      data: { status: ShareStatus.REVOKED, revokedAt: new Date() },
    });
    await this.prisma.$transaction([
      this.prisma.fileActivity.create({
        data: {
          orgId: user.org_id,
          fileId: share.fileId,
          userId: user.sub,
          action: AuditAction.UNSHARE,
          metadata: { shareId, revoked: true },
        },
      }),
      this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'SHARE_REVOKED', resourceType: ResourceType.FILE, resourceId: share.fileId } }),
    ]);
    return { id: shareId, revoked: true };
  }

  async verifyPublicShare(
    token: string,
    password?: string,
  ): Promise<VerifyShareResponse> {
    const share = await this.prisma.fileShare.findFirst({
      where: { linkToken: token },
    });
    if (!share || share.status !== ShareStatus.ACTIVE) {
      throw new NotFoundException('Share not found');
    }
    if (this.isInactive(share.expiresAt)) {
      await this.prisma.fileShare.updateMany({
        where: { id: share.id, status: ShareStatus.ACTIVE },
        data: { status: ShareStatus.EXPIRED },
      });
      throw new NotFoundException('Share not found');
    }
    if (share.passwordHash) {
      if (!password || !(await verifySecret(password, share.passwordHash))) {
        throw new UnauthorizedException('Invalid share password');
      }
    }
    return {
      resource_type: ResourceType.FILE,
      resource_id: share.fileId,
      can_download: share.canDownload,
      expires_at: share.expiresAt ? share.expiresAt.toISOString() : null,
      download_url: await this.publicDownloadUrl(share),
    };
  }

  private async publicDownloadUrl(share: {
    orgId: string;
    fileId: string;
    canDownload: boolean;
  }): Promise<string | null> {
    if (!share.canDownload) {
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

  private async withTeamFolderRole(
    user: AccessTokenPayload,
    resource: AccessibleResource,
  ): Promise<AccessibleResource> {
    if (!resource.teamFolderId) {
      return resource;
    }
    const membership = await this.prisma.teamFolderMember.findFirst({
      where: { teamFolderId: resource.teamFolderId, userId: user.sub },
    });
    return {
      ...resource,
      teamFolderRole: membership?.role ?? null,
    };
  }

  private isInactive(expiresAt: Date | null): boolean {
    return Boolean(expiresAt && expiresAt.getTime() <= Date.now());
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
