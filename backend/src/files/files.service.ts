import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TeamFolderRole } from '@prisma/client';
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

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    private readonly permissions: PermissionService,
    private readonly quota: QuotaService,
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
    const objectKey = this.storage.buildObjectKey(fileId, versionId);

    await this.prisma.$transaction(async (tx) => {
      await tx.file.create({
        data: {
          id: fileId,
          orgId: user.org_id,
          folderId: folder?.id ?? null,
          name: input.name,
          ownerId: user.sub,
        },
      });
      await tx.fileVersion.create({
        data: {
          id: versionId,
          orgId: user.org_id,
          fileId,
          versionNumber: 1,
          s3Key: objectKey,
          size: BigInt(input.size),
          mimeType: input.mimeType,
          sha256Hash: input.sha256,
          uploadedById: user.sub,
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

    await this.prisma.storageQuota.upsert({ where: { orgId: user.org_id }, create: { orgId: user.org_id, quotaBytes: 10737418240n, usedBytes: version.size }, update: { usedBytes: { increment: version.size } } });
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
          s3Key: sourceVersion.s3Key,
          size: sourceVersion.size,
          mimeType: sourceVersion.mimeType,
          sha256Hash: sourceVersion.sha256Hash,
          uploadedById: user.sub,
        },
      });
      await tx.file.update({
        where: { id: fileId },
        data: { updatedAt: new Date() },
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
    await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'FILE_MOVED', resourceType: 'FILE', resourceId: id } });
    return updated;
  }

  async copy(user: AccessTokenPayload, id: string, input: MoveCopyInput) {
    const file = await this.requireMutableFile(user, await this.prisma.file.findFirst({ where: { id, deletedAt: null }, include: { folder: { select: { teamFolderId: true } }, versions: { orderBy: { versionNumber: 'desc' }, take: 1 } } }), 'Not allowed to copy this file');
    await this.assertDestination(user, input.destinationFolderId);
    const version = file.versions[0];
    if (!version) throw new NotFoundException('File version not found');
    const newFileId = randomUUID();
    const newVersionId = randomUUID();
    const copied = await this.prisma.$transaction(async (tx) => {
      const newFile = await tx.file.create({ data: { id: newFileId, orgId: user.org_id, folderId: input.destinationFolderId, name: file.name, ownerId: user.sub } });
      await tx.fileVersion.create({ data: { id: newVersionId, orgId: user.org_id, fileId: newFileId, versionNumber: 1, s3Key: version.s3Key, size: version.size, mimeType: version.mimeType, sha256Hash: version.sha256Hash, uploadedById: user.sub } });
      await tx.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'FILE_COPIED', resourceType: 'FILE', resourceId: newFileId } });
      return newFile;
    });
    return copied;
  }

  async permanentDelete(user: AccessTokenPayload, id: string) {
    const file = await this.requireMutableFile(user, await this.prisma.file.findFirst({ where: { id, deletedAt: { not: null } }, include: { folder: { select: { teamFolderId: true } }, versions: true } }), 'Not allowed to permanently delete this file');
    for (const version of file.versions) { await this.storage.deleteObject({ fileId: file.id, versionId: version.id, ownerOrgId: user.org_id }); }
    await this.prisma.file.delete({ where: { id: file.id } });
    await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'FILE_PERMANENTLY_DELETED', resourceType: 'FILE', resourceId: id } });
    return { id, deleted: true, permanent: true };
  }

  async emptyTrash(user: AccessTokenPayload) {
    const files = await this.prisma.file.findMany({ where: { orgId: user.org_id, deletedAt: { not: null } }, include: { folder: { select: { teamFolderId: true } }, versions: true } });
    let deleted = 0;
    for (const file of files) {
      if (!(await this.canReadFile(user, file))) continue;
      for (const version of file.versions) await this.storage.deleteObject({ fileId: file.id, versionId: version.id, ownerOrgId: user.org_id });
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
    const updated = await this.prisma.file.update({
      where: { id: file.id },
      data: { deletedAt: new Date() },
    });
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
      include: { folder: { select: { teamFolderId: true } } },
    });
    const visible: Array<Omit<(typeof files)[number], 'folder'>> = [];
    for (const file of files) {
      if (await this.canReadFile(user, file)) {
        const { folder: _folder, ...rest } = file;
        visible.push(rest);
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
    const updated = await this.prisma.file.update({
      where: { id: file.id },
      data: { deletedAt: null },
    });
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
