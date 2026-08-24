import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ResourceType } from '@prisma/client';
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

    const linkToken = createShareToken();
    const passwordHash = input.password
      ? await hashSecret(input.password)
      : null;

    const recipients = input.recipientUserIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: input.recipientUserIds }, orgId: user.org_id }, select: { id: true } })
      : [];
    if (recipients.length !== input.recipientUserIds.length) throw new NotFoundException('One or more share recipients were not found');
    await this.prisma.share.create({
      data: {
        orgId: user.org_id,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        linkToken,
        passwordHash,
        expiresAt: input.expiresAt ?? null,
        canDownload: input.canDownload,
        recipients: recipients.length ? { create: recipients.map((recipient) => ({ orgId: user.org_id, userId: recipient.id, permission: input.permission })) } : undefined,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        orgId: user.org_id,
        actorId: user.sub,
        action: 'SHARE_CREATED',
        resourceType: input.resourceType,
        resourceId: input.resourceId,
      },
    });

    const base = this.config.get<string>('PUBLIC_APP_URL') ?? '';
    return { link_url: `${base}/share/public/${linkToken}` };
  }


  async listSharedWithMe(user: AccessTokenPayload) {
    const rows = await this.prisma.shareRecipient.findMany({ where: { orgId: user.org_id, userId: user.sub }, include: { share: true } });
    return rows.map((row) => ({ id: row.share.id, resourceType: row.share.resourceType, resourceId: row.share.resourceId, permission: row.permission, expiresAt: row.share.expiresAt }));
  }

  async listSharedByMe(user: AccessTokenPayload) {
    const rows = await this.prisma.share.findMany({ where: { orgId: user.org_id }, include: { recipients: true } });
    return rows.filter((row) => row.recipients.length > 0).map((row) => ({ id: row.id, resourceType: row.resourceType, resourceId: row.resourceId, recipients: row.recipients.map((recipient) => ({ userId: recipient.userId, permission: recipient.permission })), expiresAt: row.expiresAt }));
  }

  async verifyPublicShare(
    token: string,
    password?: string,
  ): Promise<VerifyShareResponse> {
    const share = await this.prisma.share.findFirst({
      where: { linkToken: token },
    });
    if (!share || this.isInactive(share.expiresAt)) {
      throw new NotFoundException('Share not found');
    }
    if (share.passwordHash) {
      if (!password || !(await verifySecret(password, share.passwordHash))) {
        throw new UnauthorizedException('Invalid share password');
      }
    }
    return {
      resource_type: share.resourceType,
      resource_id: share.resourceId,
      can_download: share.canDownload,
      expires_at: share.expiresAt ? share.expiresAt.toISOString() : null,
      download_url: await this.publicDownloadUrl(share),
    };
  }

  private async publicDownloadUrl(share: {
    orgId: string;
    resourceType: ResourceType;
    resourceId: string;
    canDownload: boolean;
  }): Promise<string | null> {
    if (!share.canDownload || share.resourceType !== ResourceType.FILE) {
      return null;
    }
    const file = await this.prisma.file.findFirst({
      where: { id: share.resourceId, orgId: share.orgId, deletedAt: null },
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
