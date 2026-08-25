import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
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

export type RestoreVersionResponse = {
  fileId: string;
  newVersionNumber: number;
  restoredFromVersion: number;
};

const TRASH_RETENTION_DAYS = 30;

@Injectable()
export class FilesService {
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
      include: { folder: { select: { teamFolderId: true, name: true } } },
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
      return this.permissions.canRead(user, this.toAccessibleResource(file));
    }
    const resource = await this.toTeamFolderResource(
      user,
      file.orgId,
      teamFolderId,
    );
    return this.permissions.canRead(user, resource);
  }

  private async toTeamFolderResource(
    user: AccessTokenPayload,
    orgId: string,
    teamFolderId: string,
  ): Promise<AccessibleResource> {
    const teamFolderRole = await this.resolveCallerRole(user, teamFolderId);
    return {
      orgId,
      ownerId: teamFolderId,
      teamFolderId,
      teamFolderRole,
    };
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
