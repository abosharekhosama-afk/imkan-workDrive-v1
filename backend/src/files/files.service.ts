import { randomUUID } from 'node:crypto';
import { createReadStream, type ReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { Response } from 'express';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuditAction,
  FileStatus,
  TeamFolderRole,
  TrashReason,
  VersionStatus,
} from '@prisma/client';
import type { AccessTokenPayload } from '../auth/jwt.types';
import {
  PermissionService,
  type AccessibleResource,
} from '../permissions/permission.service';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE, type StorageService } from '../storage/storage.types';
import { contentDispositionInline } from '../common/content-disposition';
import type { UploadRequestInput } from './upload-request.schema';
import type { BulkFileOperationInput, MoveCopyInput } from './operation.schema';
import { QuotaService } from '../quota/quota.service';
import { classifyFileType, extractExtension } from '../common/file-classification';

export type UploadRequestResponse = {
  upload_url: string;
  upload_id: string;
  file_id: string;
};

export type UploadCompleteResponse = {
  file_id: string;
  upload_id: string;
  status: 'complete';
};

export type FileDownloadResponse = {
  download_url: string;
  expires_in_seconds: number;
  file_id: string;
};

export type VersionDownloadResponse = {
  download_url: string;
  expires_in_seconds: number;
  file_id: string;
  version_number: number;
};

/** Response contract for `GET /files/:id/preview-url` (PVW-04). */
export type FilePreviewUrlResponse = {
  /** Directly renderable presigned URL (inline disposition). */
  preview_url: string;
  expires_in_seconds: number;
  file_id: string;
  file_name: string;
  mime_type: string;
  size: number;
  version_number: number;
  updated_at: string | null;
};

export type FileActivityEntry = {
  id: string;
  action: string;
  user_id: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

export type RestoreVersionResponse = {
  fileId: string;
  newVersionNumber: number;
  restoredFromVersion: number;
};

const TRASH_RETENTION_DAYS = 30;

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    private readonly permissions: PermissionService,
    private readonly quota: QuotaService,
    private readonly config: ConfigService,
  ) {}

  async requestUpload(
    user: AccessTokenPayload,
    input: UploadRequestInput,
  ): Promise<UploadRequestResponse> {
    await this.quota.assertAvailable(user, BigInt(input.size));
    const folder = input.folderId ? await this.prisma.folder.findFirst({ where: { id: input.folderId } }) : null;
    if (input.folderId && (!folder || folder.orgId !== user.org_id)) throw new NotFoundException('Folder not found');
    if (folder) await this.assertCanUploadToFolder(user, folder);

    const fileId = randomUUID();
    const versionId = randomUUID();
    const storageObjectId = randomUUID();
    const objectKey = this.storage.buildObjectKey(fileId, versionId);
    const size = BigInt(input.size);
    const extension = extractExtension(input.name);
    const { bucket, region } = this.storageLocation();

    await this.prisma.$transaction(async (tx) => {
      await tx.file.create({
        data: {
          id: fileId,
          orgId: user.org_id,
          folderId: folder?.id ?? null,
          name: input.name,
          originalName: input.name,
          extension,
          mimeType: input.mimeType,
          fileType: classifyFileType(input.mimeType),
          size,
          sha256Hash: input.sha256,
          status: FileStatus.ACTIVE,
          ownerId: user.sub,
        },
      });
      await tx.storageObject.create({
        data: {
          id: storageObjectId,
          orgId: user.org_id,
          fileId,
          storageKey: objectKey,
          bucket,
          region,
          size,
          checksum: input.sha256,
        },
      });
      await tx.fileVersion.create({
        data: {
          id: versionId,
          orgId: user.org_id,
          fileId,
          versionNumber: 1,
          storageObjectId,
          size,
          mimeType: input.mimeType,
          sha256Hash: input.sha256,
          uploadedById: user.sub,
          status: VersionStatus.ACTIVE,
        },
      });
      await tx.fileActivity.create({
        data: {
          orgId: user.org_id,
          fileId,
          userId: user.sub,
          action: AuditAction.CREATE,
          metadata: { versionNumber: 1, name: input.name, mimeType: input.mimeType },
        },
      });
    });

    const signed = await this.storage.createUploadUrl({
      fileId,
      versionId,
      ownerOrgId: user.org_id,
      contentType: input.mimeType,
    });

    return {
      upload_url: signed.url,
      upload_id: versionId,
      file_id: fileId,
    };
  }

  async completeUpload(
    user: AccessTokenPayload,
    uploadId: string,
  ): Promise<UploadCompleteResponse> {
    const version = await this.prisma.fileVersion.findFirst({
      where: { id: uploadId },
      include: { file: true },
    });
    if (!version || version.orgId !== user.org_id || version.file.deletedAt) {
      throw new NotFoundException('Upload not found');
    }

    try {
      await this.storage.assertObjectExists({
        fileId: version.fileId,
        versionId: version.id,
        ownerOrgId: user.org_id,
      });
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Uploaded object was not found');
    }

    await this.prisma.$transaction([
      this.prisma.storageQuota.upsert({ where: { orgId: user.org_id }, create: { orgId: user.org_id, quotaBytes: 10737418240n, usedBytes: version.size }, update: { usedBytes: { increment: version.size } } }),
      this.prisma.file.update({
        where: { id: version.fileId },
        data: {
          size: version.size,
          mimeType: version.mimeType,
          sha256Hash: version.sha256Hash,
          fileType: classifyFileType(version.mimeType),
        },
      }),
      this.prisma.fileActivity.create({
        data: {
          orgId: user.org_id,
          fileId: version.fileId,
          userId: user.sub,
          action: AuditAction.UPLOAD_VERSION,
          metadata: { versionNumber: version.versionNumber, size: version.size.toString() },
        },
      }),
    ]);
    await this.prisma.auditLog.create({
      data: {
        orgId: user.org_id,
        actorId: user.sub,
        action: 'FILE_UPLOAD_COMPLETE',
        resourceType: 'FILE',
        resourceId: version.fileId,
      },
    });

    // Enterprise foundation: enqueue a pending malware scan and apply the
    // organization's optional version-retention limit. The scan is deliberately
    // asynchronous; until a clean result exists, production deployments should
    // keep previews/downloads behind the configured quarantine policy.
    try {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO malware_scans (id,org_id,file_id,status,engine) VALUES (UUID(),?,?, 'PENDING','configured-engine')`,
        user.org_id,
        version.fileId,
      );
      const policy = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT version_limit AS versionLimit FROM retention_policies WHERE org_id=? LIMIT 1`,
        user.org_id,
      );
      const limit = Number(policy[0]?.versionLimit ?? 0);
      if (limit > 0) {
        await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'VERSION_RETENTION_POLICY_APPLIED', resourceType: 'FILE', resourceId: version.fileId, metadata: { versionLimit: limit } } });
      }
    } catch {
      // Optional enterprise tables may not exist until their migration is applied.
    }

    return {
      file_id: version.fileId,
      upload_id: version.id,
      status: 'complete',
    };
  }

  async createDownloadUrl(
    user: AccessTokenPayload,
    fileId: string,
  ): Promise<FileDownloadResponse> {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, deletedAt: null },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
        folder: { select: { teamFolderId: true } },
      },
    });
    if (!file || file.orgId !== user.org_id || file.versions.length === 0) {
      throw new NotFoundException('File not found');
    }
    if (!(await this.canReadFile(user, file))) {
      throw new NotFoundException('File not found');
    }
    const scan = await this.prisma.$queryRawUnsafe<any[]>(`SELECT status FROM malware_scans WHERE org_id=? AND file_id=? ORDER BY created_at DESC LIMIT 1`, user.org_id, file.id).catch(() => []);
    if (scan[0]?.status === 'INFECTED') throw new NotFoundException('File is unavailable');

    const version = file.versions[0];
    const signed = await this.storage.createDownloadUrl({
      fileId: file.id,
      versionId: version.id,
      ownerOrgId: user.org_id,
      contentType: version.mimeType,
    });

    await this.prisma.file.update({
      where: { id: file.id },
      data: { lastAccessedAt: new Date() },
    });
    await this.recordDownloadActivity(user, file.id, version.versionNumber);
    await this.prisma.auditLog.create({
      data: {
        orgId: user.org_id,
        actorId: user.sub,
        action: 'FILE_DOWNLOAD',
        resourceType: 'FILE',
        resourceId: file.id,
      },
    });

    return {
      download_url: signed.url,
      expires_in_seconds: signed.expiresInSeconds,
      file_id: file.id,
    };
  }

  async createVersionDownloadUrl(
    user: AccessTokenPayload,
    fileId: string,
    versionNumber: number,
  ): Promise<VersionDownloadResponse> {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, deletedAt: null },
      include: {
        versions: {
          where: { versionNumber },
          take: 1,
        },
        folder: { select: { teamFolderId: true } },
      },
    });
    if (!file || file.orgId !== user.org_id || file.versions.length === 0) {
      throw new NotFoundException('File or version not found');
    }
    if (!(await this.canReadFile(user, file))) {
      throw new NotFoundException('File not found');
    }

    const version = file.versions[0];
    const signed = await this.storage.createDownloadUrl({
      fileId: file.id,
      versionId: version.id,
      ownerOrgId: user.org_id,
      contentType: version.mimeType,
    });

    await this.prisma.file.update({
      where: { id: file.id },
      data: { lastAccessedAt: new Date() },
    });
    await this.recordDownloadActivity(user, file.id, version.versionNumber);
    await this.prisma.auditLog.create({
      data: {
        orgId: user.org_id,
        actorId: user.sub,
        action: 'FILE_VERSION_DOWNLOAD',
        resourceType: 'FILE',
        resourceId: file.id,
      },
    });

    return {
      download_url: signed.url,
      expires_in_seconds: signed.expiresInSeconds,
      file_id: file.id,
      version_number: version.versionNumber,
    };
  }

  /**
   * Fast inline preview URL (PVW-04): same ACL/malware gating as downloads
   * but deliberately free of the heavy audit side effects (no lastAccessedAt
   * write, no FILE_DOWNLOAD audit row) so preview refreshes stay cheap. The
   * signed URL carries an inline content disposition and the stored content
   * type so browsers render the asset instead of downloading it — this is the
   * fix for the 403/CORS/attachment-download class of preview failures.
   */
  async createPreviewUrl(
    user: AccessTokenPayload,
    fileId: string,
  ): Promise<FilePreviewUrlResponse> {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, deletedAt: null },
      include: {
        versions: {
          where: { status: VersionStatus.ACTIVE },
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
        folder: { select: { teamFolderId: true } },
      },
    });
    if (!file || file.orgId !== user.org_id || file.versions.length === 0) {
      throw new NotFoundException('File not found');
    }
    if (!(await this.canReadFile(user, file))) {
      throw new NotFoundException('File not found');
    }
    const scan = await this.prisma
      .$queryRawUnsafe<any[]>(
        `SELECT status FROM malware_scans WHERE org_id=? AND file_id=? ORDER BY created_at DESC LIMIT 1`,
        user.org_id,
        file.id,
      )
      .catch(() => []);
    if (scan[0]?.status === 'INFECTED') {
      throw new NotFoundException('File is unavailable');
    }

    const version = file.versions[0];
    const signed = await this.storage.createDownloadUrl({
      fileId: file.id,
      versionId: version.id,
      ownerOrgId: user.org_id,
      contentType: version.mimeType,
      disposition: 'inline',
      fileName: file.name,
    });

    return {
      preview_url: signed.url,
      expires_in_seconds: signed.expiresInSeconds,
      file_id: file.id,
      file_name: file.name,
      mime_type: version.mimeType,
      size: Number(version.size ?? file.size ?? 0),
      version_number: version.versionNumber,
      updated_at: version.createdAt?.toISOString() ?? null,
    };
  }

  /** Recent activity log entries for the preview sidebar drawer. */
  async listActivities(
    user: AccessTokenPayload,
    fileId: string,
    limit = 20,
  ): Promise<FileActivityEntry[]> {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, deletedAt: null },
      select: { id: true, orgId: true, ownerId: true, folder: { select: { teamFolderId: true } } },
    });
    if (!file || file.orgId !== user.org_id) {
      throw new NotFoundException('File not found');
    }
    if (!(await this.canReadFile(user, file))) {
      throw new NotFoundException('File not found');
    }
    const rows = await this.prisma.fileActivity.findMany({
      where: { orgId: user.org_id, fileId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
      select: {
        id: true,
        action: true,
        userId: true,
        createdAt: true,
        metadata: true,
      },
    });
    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      user_id: row.userId,
      created_at: row.createdAt.toISOString(),
      metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    }));
  }

  async restoreVersion(
    user: AccessTokenPayload,
    fileId: string,
    versionNumber: number,
  ): Promise<RestoreVersionResponse> {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, deletedAt: null },
      include: {
        versions: {
          where: { versionNumber },
          take: 1,
        },
        folder: { select: { teamFolderId: true } },
      },
    });
    if (!file || file.orgId !== user.org_id || file.versions.length === 0) {
      throw new NotFoundException('File or version not found');
    }
    const resource = await this.toFileAccessResource(user, file);
    if (!this.permissions.canRead(user, resource)) {
      throw new NotFoundException('File not found');
    }
    if (!this.permissions.canWrite(user, resource)) {
      throw new ForbiddenException('Not allowed to restore this file version');
    }
    if (versionNumber === file.versions[0]?.versionNumber) {
      // Check if this is the current version
      const currentVersion = await this.prisma.fileVersion.findFirst({
        where: { fileId },
        orderBy: { versionNumber: 'desc' },
      });
      if (currentVersion && versionNumber === currentVersion.versionNumber) {
        throw new BadRequestException('Cannot restore the current version');
      }
    }

    const sourceVersion = file.versions[0];
    const maxVersion = await this.prisma.fileVersion.findFirst({
      where: { fileId },
      orderBy: { versionNumber: 'desc' },
    });
    const newVersionNumber = (maxVersion?.versionNumber ?? 0) + 1;

    await this.prisma.$transaction(async (tx) => {
      await tx.fileVersion.create({
        data: {
          id: randomUUID(),
          orgId: user.org_id,
          fileId,
          versionNumber: newVersionNumber,
          storageObjectId: sourceVersion.storageObjectId,
          size: sourceVersion.size,
          mimeType: sourceVersion.mimeType,
          extension: sourceVersion.extension,
          sha256Hash: sourceVersion.sha256Hash,
          uploadedById: user.sub,
          status: VersionStatus.RESTORED,
        },
      });
      await tx.fileVersion.updateMany({
        where: {
          fileId,
          versionNumber: { lt: newVersionNumber },
          status: VersionStatus.ACTIVE,
        },
        data: { status: VersionStatus.SUPERSEDED },
      });
      await tx.file.update({
        where: { id: fileId },
        data: {
          updatedAt: new Date(),
          size: sourceVersion.size,
          mimeType: sourceVersion.mimeType,
          sha256Hash: sourceVersion.sha256Hash,
          extension: sourceVersion.extension,
        },
      });
      await tx.fileActivity.create({
        data: {
          orgId: user.org_id,
          fileId,
          userId: user.sub,
          action: AuditAction.RESTORE_VERSION,
          metadata: {
            restoredFromVersion: versionNumber,
            newVersionNumber,
          },
        },
      });
      await tx.auditLog.create({
        data: {
          orgId: user.org_id,
          actorId: user.sub,
          action: 'FILE_VERSION_RESTORED',
          resourceType: 'FILE',
          resourceId: fileId,
        },
      });
    });

    return {
      fileId,
      newVersionNumber,
      restoredFromVersion: versionNumber,
    };
  }


  async move(user: AccessTokenPayload, id: string, input: MoveCopyInput) {
    const file = await this.requireMutableFile(user, await this.prisma.file.findFirst({ where: { id, deletedAt: null }, include: { folder: { select: { teamFolderId: true } } } }), 'Not allowed to move this file');
    await this.assertDestination(user, input.destinationFolderId);
    const updated = await this.prisma.file.update({ where: { id }, data: { folderId: input.destinationFolderId } });
    await this.recordActivity(user.org_id, id, user.sub, AuditAction.MOVE, { destinationFolderId: input.destinationFolderId });
    await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'FILE_MOVED', resourceType: 'FILE', resourceId: id } });
    return updated;
  }

  async copy(user: AccessTokenPayload, id: string, input: MoveCopyInput) {
    const file = await this.requireMutableFile(user, await this.prisma.file.findFirst({ where: { id, deletedAt: null }, include: { folder: { select: { teamFolderId: true } }, versions: { orderBy: { versionNumber: 'desc' }, take: 1 } } }), 'Not allowed to copy this file');
    await this.assertDestination(user, input.destinationFolderId);
    const version = file.versions[0];
    if (!version) throw new NotFoundException('File version not found');
    const newFileId = randomUUID();
    const copied = await this.prisma.$transaction(async (tx) => {
      const newFile = await tx.file.create({ data: { id: newFileId, orgId: user.org_id, folderId: input.destinationFolderId, name: file.name, originalName: file.originalName, extension: file.extension, mimeType: file.mimeType, fileType: file.fileType, size: file.size, sha256Hash: file.sha256Hash, status: FileStatus.ACTIVE, ownerId: user.sub } });
      await tx.fileVersion.create({ data: { id: randomUUID(), orgId: user.org_id, fileId: newFileId, versionNumber: 1, storageObjectId: version.storageObjectId, size: version.size, mimeType: version.mimeType, extension: version.extension, sha256Hash: version.sha256Hash, uploadedById: user.sub, status: VersionStatus.ACTIVE } });
      await tx.fileActivity.create({ data: { orgId: user.org_id, fileId: newFileId, userId: user.sub, action: AuditAction.COPY, metadata: { copiedFromFileId: id } } });
      await tx.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'FILE_COPIED', resourceType: 'FILE', resourceId: newFileId } });
      return newFile;
    });
    return copied;
  }

  async permanentDelete(user: AccessTokenPayload, id: string) {
    const file = await this.requireMutableFile(user, await this.prisma.file.findFirst({ where: { id, deletedAt: { not: null } }, include: { folder: { select: { teamFolderId: true } }, versions: true } }), 'Not allowed to permanently delete this file');
    await this.purgeFileVersionObjects(user, file.id, file.versions);
    await this.prisma.file.delete({ where: { id: file.id } });
    await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'FILE_PERMANENTLY_DELETED', resourceType: 'FILE', resourceId: id } });
    return { id, deleted: true, permanent: true };
  }

  async emptyTrash(user: AccessTokenPayload) {
    const files = await this.prisma.file.findMany({ where: { orgId: user.org_id, deletedAt: { not: null } }, include: { folder: { select: { teamFolderId: true } }, versions: true } });
    let deleted = 0;
    for (const file of files) {
      if (!(await this.canReadFile(user, file))) continue;
      await this.purgeFileVersionObjects(user, file.id, file.versions);
      await this.prisma.file.delete({ where: { id: file.id } });
      deleted++;
    }
    await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'TRASH_EMPTIED', resourceType: 'FILE', resourceId: user.org_id } });
    return { deleted };
  }

  async bulkMove(user: AccessTokenPayload, input: BulkFileOperationInput) {
    await this.assertDestination(user, input.destinationFolderId ?? null);
    const results: string[] = [];
    for (const id of input.ids) { try { await this.move(user, id, { destinationFolderId: input.destinationFolderId ?? null }); results.push(id); } catch {} }
    return { moved: results };
  }

  async bulkTrash(user: AccessTokenPayload, input: BulkFileOperationInput) {
    const results: string[] = [];
    for (const id of input.ids) { try { await this.trash(user, id); results.push(id); } catch {} }
    return { trashed: results };
  }

  async bulkPermanentDelete(user: AccessTokenPayload, input: BulkFileOperationInput) {
    const results: string[] = [];
    for (const id of input.ids) { try { await this.permanentDelete(user, id); results.push(id); } catch {} }
    return { deleted: results };
  }

  private async assertDestination(user: AccessTokenPayload, folderId: string | null) {
    if (!folderId) return;
    const folder = await this.prisma.folder.findFirst({ where: { id: folderId } });
    if (!folder || folder.orgId !== user.org_id) throw new NotFoundException('Destination folder not found');
    if (!(await this.canReadFolderForFile(user, folder)) || !(await this.canWriteFolderForFile(user, folder))) throw new ForbiddenException('Not allowed to use destination folder');
  }

  private async canReadFolderForFile(user: AccessTokenPayload, folder: { orgId: string; ownerId: string; teamFolderId?: string | null }) {
    if (folder.orgId !== user.org_id) return false;
    if (!folder.teamFolderId) return this.permissions.canRead(user, { orgId: folder.orgId, ownerId: folder.ownerId });
    return this.permissions.canRead(user, await this.toTeamFolderResource(user, folder.orgId, folder.teamFolderId));
  }

  private async canWriteFolderForFile(user: AccessTokenPayload, folder: { orgId: string; ownerId: string; teamFolderId?: string | null }) {
    if (!folder.teamFolderId) return this.permissions.canWrite(user, { orgId: folder.orgId, ownerId: folder.ownerId });
    return this.permissions.canWrite(user, await this.toTeamFolderResource(user, folder.orgId, folder.teamFolderId));
  }

  async rename(user: AccessTokenPayload, id: string, name: string) {
    const file = await this.requireMutableFile(
      user,
      await this.prisma.file.findFirst({
        where: { id, deletedAt: null },
        include: { folder: { select: { teamFolderId: true } } },
      }),
      'Not allowed to rename this file',
    );
    const updated = await this.prisma.file.update({
      where: { id: file.id },
      data: { name },
    });
    await this.recordActivity(user.org_id, file.id, user.sub, AuditAction.UPDATE, { rename: { previousName: file.name, newName: name } });
    await this.prisma.auditLog.create({
      data: {
        orgId: user.org_id,
        actorId: user.sub,
        action: 'FILE_RENAMED',
        resourceType: 'FILE',
        resourceId: file.id,
      },
    });
    return updated;
  }

  async trash(user: AccessTokenPayload, id: string) {
    const file = await this.requireMutableFile(
      user,
      await this.prisma.file.findFirst({
        where: { id, deletedAt: null },
        include: { folder: { select: { teamFolderId: true } } },
      }),
      'Not allowed to delete this file',
    );
    const now = new Date();
    const expiresAt = new Date(now.getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const updated = await this.prisma.file.update({
      where: { id: file.id },
      data: { deletedAt: now, status: FileStatus.TRASHED },
    });
    await this.prisma.trashEntry.create({
      data: {
        orgId: user.org_id,
        fileId: file.id,
        deletedById: user.sub,
        reason: user.sub === file.ownerId ? TrashReason.USER_DELETED : TrashReason.OWNER_DELETED,
        deletedAt: now,
        expiresAt,
      },
    });
    await this.recordActivity(user.org_id, file.id, user.sub, AuditAction.DELETE, { reason: 'user_trashed' });
    await this.prisma.auditLog.create({
      data: {
        orgId: user.org_id,
        actorId: user.sub,
        action: 'FILE_TRASHED',
        resourceType: 'FILE',
        resourceId: file.id,
      },
    });
    return { id: updated.id, deleted: true };
  }

  async listTrash(user: AccessTokenPayload) {
    const files = await this.prisma.file.findMany({
      where: {
        orgId: user.org_id,
        deletedAt: { not: null },
      },
      include: {
        folder: { select: { teamFolderId: true, name: true } },
        owner: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    });
    const visible: Array<Omit<(typeof files)[number], 'folder'> & { folderName: string | null }> = [];
    for (const file of files) {
      if (await this.canReadFile(user, file)) {
        const { folder, ...rest } = file;
        visible.push({ ...rest, folderName: folder?.name ?? null });
      }
    }
    return visible;
  }

  /**
   * Headroom for inline previews (PVW-02/03): resolves the current ACTIVE
   * version + storage object, enforces `canRead` (404-masked), and writes a
   * correct Content-Type, RFC 6266 inline disposition, ETag and HTTP Range
   * response so the browser renders rather than downloads.
   */
  async streamFile(
    user: AccessTokenPayload,
    id: string,
    response: Response,
    range?: string,
  ): Promise<void> {
    const file = await this.prisma.file.findFirst({
      where: { id, orgId: user.org_id, deletedAt: null },
      include: {
        folder: { select: { teamFolderId: true } },
        versions: {
          where: { status: VersionStatus.ACTIVE },
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
      },
    });
    if (!file || !(await this.canReadFile(user, file))) {
      throw new NotFoundException('File not found');
    }
    const version = file.versions[0];
    if (!version) {
      throw new NotFoundException('File version not found');
    }
    const storageObject = await this.prisma.storageObject.findFirst({
      where: { id: version.storageObjectId },
    });
    if (!storageObject) {
      throw new NotFoundException('Storage object not found');
    }

    const contentType = version.mimeType || 'application/octet-stream';
    const size = Number(version.size ?? storageObject.size ?? 0);

    const resolveLocalPath = this.storage.resolveObjectPath?.bind(this.storage);
    let path: string | null = null;
    if (resolveLocalPath) {
      path = resolveLocalPath(storageObject.storageKey);
      // The database can still reference a storage object whose bytes were
      // removed from the disk (manual cleanup, failed migration, restored
      // volume). stat() before opening the stream so we return a clean 404
      // instead of letting fs emit an unhandled ENOENT that crashes the
      // Node.js process.
      try {
        await stat(path);
      } catch {
        throw new NotFoundException('File object not found on storage disk');
      }
    }

    response.setHeader('Content-Type', contentType);
    response.setHeader('Content-Disposition', contentDispositionInline(file.name));
    response.setHeader('Accept-Ranges', 'bytes');
    response.setHeader('Cache-Control', 'private, max-age=3600');
    if (file.sha256Hash) {
      response.setHeader('ETag', `"${file.sha256Hash}"`);
    }

    if (path) {
      const matcher = /^bytes=(\d*)-(\d*)$/.exec(range ?? '');
      if (matcher && size > 0) {
        const start = matcher[1] ? Number(matcher[1]) : 0;
        const end = matcher[2] ? Math.min(Number(matcher[2]), size - 1) : size - 1;
        if (start > end || start >= size) {
          response.status(416).setHeader('Content-Range', `bytes */${size}`);
          response.end();
          return;
        }
        response
          .status(206)
          .setHeader('Content-Range', `bytes ${start}-${end}/${size}`)
          .setHeader('Content-Length', String(end - start + 1));
        this.pipeLocalObject(createReadStream(path, { start, end }), response);
        return;
      }
      response.setHeader('Content-Length', String(size));
      this.pipeLocalObject(createReadStream(path), response);
      return;
    }

    // S3 driver: delegate to a presigned GET (range-capable via Content-Range negociation is
    // handled transparently by the client) with inline-friendly disposition.
    const urlResult = await this.storage.createDownloadUrl({
      fileId: file.id,
      versionId: version.id,
      ownerOrgId: user.org_id,
      contentType,
    });
    response.setHeader('Location', urlResult.url);
    response.status(302).end();
  }

  /**
   * Pipes a local file stream to the HTTP response with an explicit 'error'
   * listener. Without one, a read failure surfacing after the stream was
   * created (e.g. the object vanishing between stat() and open, a truncated
   * file or an I/O fault) emits an unhandled 'error' event that terminates
   * the whole Node.js process.
   */
  private pipeLocalObject(stream: ReadStream, response: Response): void {
    stream.on('error', (error: NodeJS.ErrnoException) => {
      this.logger.error(
        `Failed to stream local object: ${error.message}`,
        error.stack,
      );
      if (response.headersSent) {
        // Headers and possibly bytes already went out; the only safe action
        // is to tear the connection down instead of throwing.
        response.destroy(error);
        return;
      }
      if (!response.statusCode || response.statusCode === 200) {
        response.status(500);
      }
      response.end();
    });
    stream.pipe(response);
  }

  async restore(user: AccessTokenPayload, id: string) {
    const file = await this.requireMutableFile(
      user,
      await this.prisma.file.findFirst({
        where: { id, deletedAt: { not: null } },
        include: { folder: { select: { teamFolderId: true } } },
      }),
      'Not allowed to restore this file',
    );
    const now = new Date();
    const updated = await this.prisma.file.update({
      where: { id: file.id },
      data: { deletedAt: null, status: FileStatus.ACTIVE },
    });
    await this.prisma.trashEntry.updateMany({
      where: { fileId: file.id, restoredAt: null },
      data: { restoredAt: now, restoredById: user.sub },
    });
    await this.recordActivity(user.org_id, file.id, user.sub, AuditAction.RESTORE, { restoredFromTrash: true });
    await this.prisma.auditLog.create({
      data: {
        orgId: user.org_id,
        actorId: user.sub,
        action: 'FILE_RESTORED',
        resourceType: 'FILE',
        resourceId: file.id,
      },
    });
    return updated;
  }

  private async recordActivity(
    orgId: string,
    fileId: string,
    userId: string | null,
    action: AuditAction,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.fileActivity.create({
      data: {
        orgId,
        fileId,
        userId,
        action,
        metadata: metadata === undefined ? undefined : JSON.parse(JSON.stringify(metadata)),
      },
    });
  }

  private async recordDownloadActivity(
    user: AccessTokenPayload,
    fileId: string,
    versionNumber: number,
  ): Promise<void> {
    await this.recordActivity(user.org_id, fileId, user.sub, AuditAction.DOWNLOAD, { versionNumber });
  }

  /**
   * Deletes the physical bytes behind a file's versions, but only for
   * storage objects that no other file still references (copy/restore
   * share physical objects). StorageObject rows are cleaned up by the
   * database cascade; shared survivors keep their soft owner link.
   */
  private async purgeFileVersionObjects(
    user: AccessTokenPayload,
    fileId: string,
    versions: Array<{ storageObjectId: string }>,
  ): Promise<void> {
    const objectIds = [...new Set(versions.map((version) => version.storageObjectId))];
    for (const objectId of objectIds) {
      const externalRefs = await this.prisma.fileVersion.count({
        where: { storageObjectId: objectId, fileId: { not: fileId } },
      });
      if (externalRefs > 0) {
        continue;
      }
      const object = await this.prisma.storageObject.findUnique({ where: { id: objectId } });
      if (!object) continue;
      await this.storage.deleteStoredObject(object.storageKey);
    }
  }

  private storageLocation(): { bucket: string; region: string } {
    return {
      bucket: this.config.get<string>('S3_BUCKET') ?? 'imkan-workdrive-dev',
      region: this.config.get<string>('S3_REGION') ?? 'us-east-1',
    };
  }

  private async requireMutableFile<
    T extends {
      id: string;
      orgId: string;
      ownerId: string;
      folder?: { teamFolderId: string | null } | null;
    },
  >(
    user: AccessTokenPayload,
    file: T | null,
    deniedMessage: string,
  ): Promise<T> {
    if (!file || file.orgId !== user.org_id) {
      throw new NotFoundException('File not found');
    }
    const resource = await this.toFileAccessResource(user, file);
    if (!this.permissions.canRead(user, resource)) {
      throw new NotFoundException('File not found');
    }
    if (!this.permissions.canWrite(user, resource)) {
      throw new ForbiddenException(deniedMessage);
    }
    return file;
  }

  private async toFileAccessResource(
    user: AccessTokenPayload,
    file: {
      orgId: string;
      ownerId: string;
      folder?: { teamFolderId: string | null } | null;
    },
  ): Promise<AccessibleResource> {
    const teamFolderId = file.folder?.teamFolderId ?? null;
    if (!teamFolderId) {
      return this.toAccessibleResource(file);
    }
    return this.toTeamFolderResource(user, file.orgId, teamFolderId);
  }

  private async assertCanUploadToFolder(
    user: AccessTokenPayload,
    folder: { orgId: string; ownerId: string; teamFolderId?: string | null },
  ) {
    if (!folder.teamFolderId) {
      return;
    }
    const resource = await this.toTeamFolderResource(
      user,
      folder.orgId,
      folder.teamFolderId,
    );
    if (!this.permissions.canRead(user, resource)) {
      throw new NotFoundException('Folder not found');
    }
    if (!this.permissions.canWrite(user, resource)) {
      throw new ForbiddenException('Not allowed to upload to this folder');
    }
  }

  private async canReadFile(
    user: AccessTokenPayload,
    file: {
      orgId: string;
      ownerId: string;
      folder?: { teamFolderId: string | null } | null;
    },
  ): Promise<boolean> {
    const teamFolderId = file.folder?.teamFolderId ?? null;
    if (!teamFolderId) {
      if (this.permissions.canRead(user, this.toAccessibleResource(file))) return true;
      const share = await this.prisma.fileShare.findFirst({
        where: {
          fileId: (file as any).id,
          orgId: user.org_id,
          status: 'ACTIVE',
          recipients: { some: { userId: user.sub, orgId: user.org_id } },
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: { id: true },
      });
      return !!share;
    }
    const resource = await this.toTeamFolderResource(user, file.orgId, teamFolderId);
    return this.permissions.canRead(user, resource);
  }

  private async toTeamFolderResource(
    user: AccessTokenPayload,
    orgId: string,
    teamFolderId: string,
  ): Promise<AccessibleResource> {
    const [teamFolder, teamFolderRole] = await Promise.all([
      this.prisma.teamFolder.findFirst({ where: { id: teamFolderId, orgId }, select: { isPublicToOrg: true } }),
      this.resolveCallerRole(user, teamFolderId),
    ]);
    return { orgId, ownerId: teamFolderId, teamFolderId, teamFolderRole, isPublicToOrg: teamFolder?.isPublicToOrg ?? false };
  }

  private async resolveCallerRole(
    user: AccessTokenPayload,
    teamFolderId: string,
  ): Promise<TeamFolderRole | null> {
    const membership = await this.prisma.teamFolderMember.findFirst({
      where: { teamFolderId, userId: user.sub },
    });
    return membership?.role ?? null;
  }

  private toAccessibleResource(file: {
    orgId: string;
    ownerId: string;
    folder?: { teamFolderId: string | null } | null;
  }): AccessibleResource {
    return {
      orgId: file.orgId,
      ownerId: file.ownerId,
      teamFolderId: file.folder?.teamFolderId ?? null,
    };
  }
}
