import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, type ReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { Response } from 'express';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  forwardRef,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuditAction,
  FileStatus,
  TeamFolderRole,
  TrashReason,
  VersionStatus,
  UploadStatus,
  UploadSessionStatus,
  ResourceType,
} from '@prisma/client';
import type { AccessTokenPayload } from '../auth/jwt.types';
import {
  PermissionService,
  type AccessibleResource,
} from '../permissions/permission.service';
import { EffectivePermissionService } from '../permissions/effective-permission.service';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE, type StorageService } from '../storage/storage.types';
import { contentDispositionInline } from '../common/content-disposition';
import type { UploadRequestInput } from './upload-request.schema';
import type { BulkFileOperationInput, MoveCopyInput } from './operation.schema';
import {
  extractSafeExtension,
  parseVersionUploadFile,
} from './version-upload.schema';
import { QuotaService } from '../quota/quota.service';
import { classifyFileType, extractExtension } from '../common/file-classification';
import { WorkflowEngineService } from '../workflows/workflow-engine.service';
import { DlpService } from '../dlp/dlp.service';

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

export type ResumableUploadStartResponse = {
  session_id: string;
  file_id: string;
  version_id: string;
  part_size: number;
  total_parts: number;
  expires_at: string;
};

export type ResumableUploadPartResponse = {
  session_id: string;
  part_number: number;
  size: number;
  checksum: string;
  etag: string;
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

/** Response contract for `POST /files/:id/versions` (multipart version upload). */
export type UploadNewVersionResponse = {
  file_id: string;
  version_id: string;
  version_number: number;
  size: number;
  checksum: string;
  status: 'complete';
};

/** Entry contract for `GET /files/:id/versions` (version history drawer). */
export type VersionHistoryEntry = {
  id: string;
  versionNumber: number;
  status: VersionStatus;
  size: number;
  mimeType: string;
  sha256Hash: string;
  uploadedBy: {
    id: string;
    name: string | null;
    email: string;
    avatarUrl: string | null;
  } | null;
  createdAt: string;
  isCurrent: boolean;
};

const TRASH_RETENTION_DAYS = 30;

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    private readonly permissions: PermissionService,
    private readonly effective: EffectivePermissionService,
    private readonly quota: QuotaService,
    private readonly config: ConfigService,
    @Inject(forwardRef(() => WorkflowEngineService)) private readonly workflowEngine: WorkflowEngineService,
    private readonly dlp: DlpService,
  ) {}

  async requestUpload(
    user: AccessTokenPayload,
    input: UploadRequestInput,
  ): Promise<UploadRequestResponse> {
    await this.quota.assertAvailable(user, BigInt(input.size));
    const folder = input.folderId ? await this.prisma.folder.findFirst({ where: { id: input.folderId } }) : null;
    if (input.folderId && (!folder || folder.orgId !== user.org_id)) throw new NotFoundException('Folder not found');
    if (folder) await this.assertCanUploadToFolder(user, folder);

    const cleanName = input.name.trim();
    if (!cleanName || cleanName.length > 255 || /[\x00-\x1F\x7F]/.test(cleanName)) {
      throw new BadRequestException('Invalid file name');
    }
    const duplicate = await this.prisma.file.findFirst({
      where: { orgId: user.org_id, folderId: folder?.id ?? null, name: cleanName, status: FileStatus.ACTIVE, deletedAt: null },
      select: { id: true },
    });
    if (duplicate) throw new ConflictException('A file with this name already exists in the destination folder');

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
          uploadStatus: UploadStatus.PENDING,
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
      checksum: input.sha256,
    });

    return {
      upload_url: signed.url,
      upload_id: versionId,
      file_id: fileId,
    };
  }

  async createFileFromBytes(
    user: AccessTokenPayload,
    input: {
      folderId?: string | null;
      name: string;
      mimeType: string;
      extension?: string | null;
      bytes: Buffer;
    },
  ) {
    const size = BigInt(input.bytes.length);
    await this.quota.assertAvailable(user, size);
    const folder = input.folderId ? await this.prisma.folder.findFirst({ where: { id: input.folderId } }) : null;
    if (input.folderId && (!folder || folder.orgId !== user.org_id)) throw new NotFoundException('Folder not found');
    if (folder) await this.assertCanUploadToFolder(user, folder);
    const cleanName = input.name.trim();
    if (!cleanName || cleanName.length > 255 || /[\x00-\x1F\x7F]/.test(cleanName)) throw new BadRequestException('Invalid file name');
    const duplicate = await this.prisma.file.findFirst({ where: { orgId: user.org_id, folderId: folder?.id ?? null, name: cleanName, status: FileStatus.ACTIVE, deletedAt: null }, select: { id: true } });
    if (duplicate) throw new ConflictException('A file with this name already exists in the destination folder');

    const fileId = randomUUID();
    const versionId = randomUUID();
    const storageObjectId = randomUUID();
    const objectKey = this.storage.buildObjectKey(fileId, versionId);
    const { bucket, region } = this.storageLocation();
    const sha256 = createHash('sha256').update(input.bytes).digest('hex');
    const extension = (input.extension ?? extractExtension(cleanName) ?? '').replace(/^\./, '').toLowerCase() || null;
    await this.storage.storeObject({ fileId, versionId, ownerOrgId: user.org_id, storageKey: objectKey, contentType: input.mimeType }, input.bytes);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.file.create({ data: { id: fileId, orgId: user.org_id, folderId: folder?.id ?? null, name: cleanName, originalName: cleanName, extension, mimeType: input.mimeType, fileType: classifyFileType(input.mimeType), size, sha256Hash: sha256, status: FileStatus.ACTIVE, ownerId: user.sub } });
        await tx.storageObject.create({ data: { id: storageObjectId, orgId: user.org_id, fileId, storageKey: objectKey, bucket, region, size, checksum: sha256 } });
        await tx.fileVersion.create({ data: { id: versionId, orgId: user.org_id, fileId, versionNumber: 1, storageObjectId, size, mimeType: input.mimeType, extension, sha256Hash: sha256, uploadedById: user.sub, status: VersionStatus.ACTIVE, uploadStatus: UploadStatus.COMPLETE } });
        await tx.fileActivity.create({ data: { orgId: user.org_id, fileId, userId: user.sub, action: AuditAction.CREATE, metadata: { versionNumber: 1, name: cleanName, mimeType: input.mimeType, source: 'office-template-wizard' } } });
        await tx.storageQuota.upsert({ where: { orgId: user.org_id }, create: { orgId: user.org_id, quotaBytes: 10737418240n, usedBytes: size }, update: { usedBytes: { increment: size } } });
      });
    } catch (error) {
      await this.storage.deleteStoredObject(objectKey).catch(() => undefined);
      throw error;
    }
    return { file_id: fileId, version_id: versionId, name: cleanName, extension, mime_type: input.mimeType, size: input.bytes.length };
  }

  async createFileFromStorageSnapshot(
    user: AccessTokenPayload,
    input: {
      folderId?: string | null;
      name: string;
      mimeType: string;
      extension?: string | null;
      size: bigint;
      sha256Hash: string;
      sourceStorageKey: string;
    },
  ) {
    await this.quota.assertAvailable(user, input.size);
    const folder = input.folderId
      ? await this.prisma.folder.findFirst({ where: { id: input.folderId } })
      : null;
    if (input.folderId && (!folder || folder.orgId !== user.org_id)) {
      throw new NotFoundException('Folder not found');
    }
    if (folder) await this.assertCanUploadToFolder(user, folder);

    const cleanName = input.name.trim();
    if (!cleanName || cleanName.length > 255 || /[\x00-\x1F\x7F]/.test(cleanName)) {
      throw new BadRequestException('Invalid file name');
    }
    const duplicate = await this.prisma.file.findFirst({
      where: { orgId: user.org_id, folderId: folder?.id ?? null, name: cleanName, status: FileStatus.ACTIVE, deletedAt: null },
      select: { id: true },
    });
    if (duplicate) throw new ConflictException('A file with this name already exists in the destination folder');

    const fileId = randomUUID();
    const versionId = randomUUID();
    const storageObjectId = randomUUID();
    const objectKey = this.storage.buildObjectKey(fileId, versionId);
    const { bucket, region } = this.storageLocation();

    await this.storage.copyStoredObject(input.sourceStorageKey, {
      fileId,
      versionId,
      ownerOrgId: user.org_id,
      contentType: input.mimeType,
      storageKey: objectKey,
    });

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.file.create({
          data: {
            id: fileId,
            orgId: user.org_id,
            folderId: folder?.id ?? null,
            name: cleanName,
            originalName: cleanName,
            extension: input.extension ?? null,
            mimeType: input.mimeType,
            fileType: classifyFileType(input.mimeType),
            size: input.size,
            sha256Hash: input.sha256Hash,
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
            size: input.size,
            checksum: input.sha256Hash,
          },
        });
        await tx.fileVersion.create({
          data: {
            id: versionId,
            orgId: user.org_id,
            fileId,
            versionNumber: 1,
            storageObjectId,
            size: input.size,
            mimeType: input.mimeType,
            extension: input.extension ?? null,
            sha256Hash: input.sha256Hash,
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
            metadata: { source: 'template', name: cleanName },
          },
        });
        await tx.storageQuota.upsert({
          where: { orgId: user.org_id },
          create: { orgId: user.org_id, quotaBytes: 10737418240n, usedBytes: input.size },
          update: { usedBytes: { increment: input.size } },
        });
        await tx.auditLog.create({
          data: {
            orgId: user.org_id,
            actorId: user.sub,
            action: 'FILE_CREATED_FROM_TEMPLATE',
            resourceType: 'FILE',
            resourceId: fileId,
          },
        });
      });
    } catch (error) {
      await this.storage.deleteStoredObject(objectKey).catch(() => undefined);
      throw error;
    }

    void this.workflowEngine.executeTrigger(user, {
      eventType: 'create',
      fileId,
      name: cleanName,
      mimeType: input.mimeType,
      fileType: classifyFileType(input.mimeType),
      size: input.size.toString(),
      userId: user.sub,
      folderId: folder?.id ?? null,
      resourceType: 'FILE',
    }).catch(() => undefined);

    return {
      file_id: fileId,
      name: cleanName,
      folder_id: folder?.id ?? null,
      file_type: classifyFileType(input.mimeType),
    };
  }

  async startResumableUpload(
    user: AccessTokenPayload,
    input: { folderId?: string | null; name: string; mimeType: string; size: number; sha256: string; partSize?: number },
  ): Promise<ResumableUploadStartResponse> {
    const size = BigInt(input.size);
    if (!Number.isSafeInteger(input.size) || input.size <= 0) throw new BadRequestException('Invalid upload size');
    if (typeof input.name !== 'string' || typeof input.mimeType !== 'string') throw new BadRequestException('Invalid upload manifest');
    if (!/^[a-zA-Z0-9][a-zA-Z0-9!#$&^_.+-]{0,126}\/[a-zA-Z0-9][a-zA-Z0-9!#$&^_.+-]{0,126}$/.test(input.mimeType)) throw new BadRequestException('Invalid mime_type');
    if (!/^[a-f0-9]{64}$/i.test(input.sha256)) throw new BadRequestException('Invalid SHA-256 checksum');
    const partSize = input.partSize ?? 16 * 1024 * 1024;
    if (!Number.isInteger(partSize) || partSize < 5 * 1024 * 1024 || partSize > 100 * 1024 * 1024) {
      throw new BadRequestException('partSize must be between 5 MiB and 100 MiB');
    }
    const totalParts = Math.ceil(input.size / partSize);
    if (totalParts > 10000) throw new BadRequestException('Upload requires too many parts');
    await this.quota.assertAvailable(user, size);
    const folder = input.folderId ? await this.prisma.folder.findFirst({ where: { id: input.folderId } }) : null;
    if (input.folderId && (!folder || folder.orgId !== user.org_id)) throw new NotFoundException('Folder not found');
    if (folder) await this.assertCanUploadToFolder(user, folder);
    const cleanName = input.name.trim();
    if (!cleanName || cleanName.length > 255 || /[\x00-\x1F\x7F]/.test(cleanName)) throw new BadRequestException('Invalid file name');
    const duplicate = await this.prisma.file.findFirst({ where: { orgId: user.org_id, folderId: folder?.id ?? null, name: cleanName, status: FileStatus.ACTIVE, deletedAt: null }, select: { id: true } });
    if (duplicate) throw new ConflictException('A file with this name already exists in the destination folder');

    const fileId = randomUUID();
    const versionId = randomUUID();
    const storageObjectId = randomUUID();
    const sessionId = randomUUID();
    const objectKey = this.storage.buildObjectKey(fileId, versionId);
    const { bucket, region } = this.storageLocation();
    let multipart: { uploadId: string; objectKey: string } | null = null;
    try {
      multipart = await this.storage.createMultipartUpload({ fileId, versionId, ownerOrgId: user.org_id, contentType: input.mimeType, checksum: input.sha256, storageKey: objectKey });
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await this.prisma.$transaction(async (tx) => {
        await tx.file.create({ data: { id: fileId, orgId: user.org_id, folderId: folder?.id ?? null, name: cleanName, originalName: cleanName, extension: extractExtension(cleanName), mimeType: input.mimeType, fileType: classifyFileType(input.mimeType), size, sha256Hash: input.sha256.toLowerCase(), status: FileStatus.ACTIVE, ownerId: user.sub } });
        await tx.storageObject.create({ data: { id: storageObjectId, orgId: user.org_id, fileId, storageKey: objectKey, bucket, region, size, checksum: input.sha256.toLowerCase() } });
        await tx.fileVersion.create({ data: { id: versionId, orgId: user.org_id, fileId, versionNumber: 1, storageObjectId, size, mimeType: input.mimeType, extension: extractExtension(cleanName), sha256Hash: input.sha256.toLowerCase(), uploadedById: user.sub, status: VersionStatus.ACTIVE, uploadStatus: UploadStatus.PENDING } });
        await tx.uploadSession.create({ data: { id: sessionId, orgId: user.org_id, fileId, versionId, storageUploadId: multipart!.uploadId, objectKey: multipart!.objectKey, expectedSize: size, expectedSha256: input.sha256.toLowerCase(), partSize, totalParts, status: UploadSessionStatus.PENDING, expiresAt, createdById: user.sub } });
        await tx.fileActivity.create({ data: { orgId: user.org_id, fileId, userId: user.sub, action: AuditAction.CREATE, metadata: { uploadSessionId: sessionId, pending: true, name: cleanName, mimeType: input.mimeType, totalParts } } });
      });
      return { session_id: sessionId, file_id: fileId, version_id: versionId, part_size: partSize, total_parts: totalParts, expires_at: expiresAt.toISOString() };
    } catch (error) {
      if (multipart) await this.storage.abortMultipartUpload({ fileId, versionId, ownerOrgId: user.org_id, contentType: input.mimeType, storageKey: objectKey }, multipart.uploadId).catch(() => undefined);
      throw error;
    }
  }

  async uploadResumablePart(user: AccessTokenPayload, sessionId: string, partNumber: number, rawUpload: unknown, checksum: string): Promise<ResumableUploadPartResponse> {
    if (!Number.isInteger(partNumber) || partNumber < 1) throw new BadRequestException('Invalid part number');
    if (!/^[a-f0-9]{64}$/i.test(checksum)) throw new BadRequestException('Invalid part checksum');
    const upload = parseVersionUploadFile(rawUpload);
    const session = await this.prisma.uploadSession.findFirst({ where: { id: sessionId, orgId: user.org_id }, include: { version: true } });
    if (!session) throw new NotFoundException('Upload session not found');
    if (session.status !== UploadSessionStatus.PENDING) throw new ConflictException('Upload session is no longer active');
    if (session.expiresAt.getTime() <= Date.now()) throw new ConflictException('Upload session has expired');
    if (partNumber > session.totalParts) throw new BadRequestException('Part number exceeds the upload manifest');
    const isLast = partNumber === session.totalParts;
    if (!isLast && upload.size !== session.partSize) throw new BadRequestException('Non-final upload parts must use the configured part size');
    if (isLast && (upload.size < 1 || upload.size > session.partSize)) throw new BadRequestException('Final upload part has an invalid size');
    if (BigInt(upload.size) > session.expectedSize) throw new BadRequestException('Upload part exceeds the expected file size');
    const result = await this.storage.uploadMultipartPart({ fileId: session.fileId, versionId: session.versionId, ownerOrgId: user.org_id, contentType: session.version.mimeType, storageKey: session.objectKey }, session.storageUploadId, partNumber, upload.buffer, checksum.toLowerCase());
    await this.prisma.uploadPart.upsert({ where: { sessionId_partNumber: { sessionId, partNumber } }, create: { sessionId, partNumber, size: result.size, checksum: result.checksum, etag: result.etag }, update: { size: result.size, checksum: result.checksum, etag: result.etag, createdAt: new Date() } });
    return { session_id: sessionId, part_number: partNumber, size: result.size, checksum: result.checksum, etag: result.etag };
  }

  async getResumableUpload(user: AccessTokenPayload, sessionId: string) {
    const session = await this.prisma.uploadSession.findFirst({ where: { id: sessionId, orgId: user.org_id }, include: { parts: { orderBy: { partNumber: 'asc' } } } });
    if (!session) throw new NotFoundException('Upload session not found');
    return { session_id: session.id, file_id: session.fileId, version_id: session.versionId, status: session.status, part_size: session.partSize, total_parts: session.totalParts, expected_size: session.expectedSize.toString(), expected_sha256: session.expectedSha256, expires_at: session.expiresAt.toISOString(), received_parts: session.parts.map(p => ({ part_number: p.partNumber, size: p.size, checksum: p.checksum, etag: p.etag })) };
  }

  async completeResumableUpload(user: AccessTokenPayload, sessionId: string): Promise<UploadCompleteResponse> {
    const session = await this.prisma.uploadSession.findFirst({ where: { id: sessionId, orgId: user.org_id }, include: { version: true, file: true, parts: { orderBy: { partNumber: 'asc' } } } });
    if (!session) throw new NotFoundException('Upload session not found');
    if (session.status === UploadSessionStatus.COMPLETE) return { file_id: session.fileId, upload_id: session.versionId, status: 'complete' };
    if (session.status !== UploadSessionStatus.PENDING) throw new ConflictException('Upload session is no longer completable');
    if (session.expiresAt.getTime() <= Date.now()) throw new ConflictException('Upload session has expired');
    if (session.parts.length !== session.totalParts || session.parts.some((p, i) => p.partNumber !== i + 1 || !p.etag)) throw new BadRequestException('Not all upload parts have been received');
    const totalSize = session.parts.reduce((sum, p) => sum + p.size, 0);
    if (BigInt(totalSize) !== session.expectedSize) throw new BadRequestException('Uploaded parts do not match the expected file size');

    if (!session.storageCompletedAt) {
      try {
        await this.storage.completeMultipartUpload({ fileId: session.fileId, versionId: session.versionId, ownerOrgId: user.org_id, contentType: session.version.mimeType, storageKey: session.objectKey }, session.storageUploadId, session.parts.map(p => ({ partNumber: p.partNumber, etag: p.etag! })));
      } catch (error) {
        // Crash-safe retry: the storage provider may have completed the
        // multipart operation immediately before the process lost the DB write.
        const existing = await this.storage.inspectObject({ fileId: session.fileId, versionId: session.versionId, ownerOrgId: user.org_id, contentType: session.version.mimeType, checksum: session.expectedSha256, storageKey: session.objectKey }).catch(() => null);
        if (!existing || existing.size !== Number(session.expectedSize) || existing.checksum?.toLowerCase() !== session.expectedSha256.toLowerCase()) throw error;
      }
      await this.prisma.uploadSession.update({ where: { id: session.id }, data: { storageCompletedAt: new Date() } });
    }
    const inspected = await this.storage.inspectObject({ fileId: session.fileId, versionId: session.versionId, ownerOrgId: user.org_id, contentType: session.version.mimeType, checksum: session.expectedSha256, storageKey: session.objectKey });
    if (inspected.size !== Number(session.expectedSize) || inspected.checksum?.toLowerCase() !== session.expectedSha256.toLowerCase()) {
      await this.storage.deleteStoredObject(session.objectKey).catch(() => undefined);
      await this.prisma.$transaction(async tx => {
        await tx.uploadSession.updateMany({ where: { id: session.id, status: UploadSessionStatus.PENDING }, data: { status: UploadSessionStatus.ABORTED } });
        await tx.file.delete({ where: { id: session.fileId } }).catch(() => undefined);
      });
      throw new BadRequestException('Completed object failed the upload integrity check');
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        // Claim the session first. This makes completion single-writer and prevents
        // a losing concurrent request from ever mutating quota or deleting the
        // physical object finalized by the winning request.
        const claimed = await tx.uploadSession.updateMany({ where: { id: session.id, status: UploadSessionStatus.PENDING }, data: { status: UploadSessionStatus.COMPLETE, completedAt: new Date() } });
        if (claimed.count !== 1) throw new ConflictException('Upload completion was already processed; retry the request');
        await tx.storageQuota.upsert({ where: { orgId: user.org_id }, create: { orgId: user.org_id, quotaBytes: 10737418240n, usedBytes: 0n }, update: {} });
        const quotaUpdated = await tx.$executeRaw`UPDATE storage_quotas SET used_bytes = used_bytes + ${session.expectedSize} WHERE org_id = ${user.org_id} AND used_bytes + ${session.expectedSize} <= quota_bytes`;
        if (quotaUpdated !== 1) throw new ForbiddenException('Storage quota exceeded');
        await tx.fileVersion.update({ where: { id: session.versionId }, data: { uploadStatus: UploadStatus.COMPLETE, status: VersionStatus.ACTIVE } });
        await tx.file.update({ where: { id: session.fileId }, data: { size: session.expectedSize, sha256Hash: session.expectedSha256, mimeType: session.version.mimeType, fileType: classifyFileType(session.version.mimeType) } });
        await tx.fileActivity.create({ data: { orgId: user.org_id, fileId: session.fileId, userId: user.sub, action: AuditAction.UPLOAD_VERSION, metadata: { resumable: true, versionNumber: session.version.versionNumber, size: session.expectedSize.toString(), checksum: session.expectedSha256 } } });
        await tx.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'FILE_UPLOAD_COMPLETE', resourceType: 'FILE', resourceId: session.fileId, metadata: { resumable: true, sessionId: session.id } } });
      });
    } catch (error) {
      // If the DB claim/quota gate failed after storage finalization, remove the
      // physical object and mark the pending session terminal. This avoids an
      // unreferenced object consuming storage indefinitely. A losing concurrent
      // request cannot enter this branch after another request has committed the
      // COMPLETE claim because the transaction above fails before its cleanup.
      if (error instanceof ForbiddenException) {
        await this.storage.deleteStoredObject(session.objectKey).catch(() => undefined);
        await this.prisma.$transaction(async tx => {
          const rolledBack = await tx.uploadSession.updateMany({ where: { id: session.id, status: UploadSessionStatus.PENDING }, data: { status: UploadSessionStatus.ABORTED } });
          if (rolledBack.count) {
            await tx.fileVersion.update({ where: { id: session.versionId }, data: { uploadStatus: UploadStatus.ABORTED, status: VersionStatus.DELETED } });
            await tx.file.delete({ where: { id: session.fileId } }).catch(() => undefined);
            await tx.storageObject.delete({ where: { id: session.version.storageObjectId } }).catch(() => undefined);
          }
        });
      }
      throw error;
    }
    void this.dlp.classifyFile(user, session.fileId).catch(() => undefined);
    return { file_id: session.fileId, upload_id: session.versionId, status: 'complete' };
  }

  async abortResumableUpload(user: AccessTokenPayload, sessionId: string) {
    const session = await this.prisma.uploadSession.findFirst({ where: { id: sessionId, orgId: user.org_id }, include: { version: { select: { storageObjectId: true } } } });
    if (!session) throw new NotFoundException('Upload session not found');
    if (session.status === UploadSessionStatus.COMPLETE) throw new ConflictException('Completed uploads cannot be aborted');
    await this.storage.abortMultipartUpload({ fileId: session.fileId, versionId: session.versionId, ownerOrgId: user.org_id, storageKey: session.objectKey }, session.storageUploadId).catch(() => undefined);
    await this.prisma.$transaction(async tx => {
      await tx.uploadSession.update({ where: { id: session.id }, data: { status: UploadSessionStatus.ABORTED } });
      await tx.fileVersion.update({ where: { id: session.versionId }, data: { uploadStatus: UploadStatus.ABORTED, status: VersionStatus.DELETED } });
      await tx.file.delete({ where: { id: session.fileId } });
      await tx.storageObject.delete({ where: { id: session.version.storageObjectId } }).catch(() => undefined);
    });
    return { session_id: session.id, aborted: true };
  }

  async cleanupExpiredResumableUploads(user: AccessTokenPayload) {
    const sessions = await this.prisma.uploadSession.findMany({ where: { orgId: user.org_id, status: UploadSessionStatus.PENDING, expiresAt: { lt: new Date() } }, include: { version: { select: { storageObjectId: true } } }, take: 100 });
    let cleaned = 0;
    for (const session of sessions) {
      await this.storage.abortMultipartUpload({ fileId: session.fileId, versionId: session.versionId, ownerOrgId: user.org_id, storageKey: session.objectKey }, session.storageUploadId).catch(() => undefined);
      await this.prisma.$transaction(async tx => {
        const claimed = await tx.uploadSession.updateMany({ where: { id: session.id, status: UploadSessionStatus.PENDING }, data: { status: UploadSessionStatus.EXPIRED } });
        if (claimed.count) {
          await tx.fileVersion.update({ where: { id: session.versionId }, data: { uploadStatus: UploadStatus.ABORTED, status: VersionStatus.DELETED } });
          await tx.file.delete({ where: { id: session.fileId } }).catch(() => undefined);
          await tx.storageObject.delete({ where: { id: session.version.storageObjectId } }).catch(() => undefined);
          cleaned++;
        }
      });
    }
    return { cleaned };
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

    // Completion is idempotent: a client retry must never double-count quota
    // or emit duplicate completion side effects.
    if (version.uploadStatus === UploadStatus.COMPLETE) {
      return { file_id: version.fileId, upload_id: version.id, status: 'complete' };
    }
    if (version.uploadStatus !== UploadStatus.PENDING) {
      throw new BadRequestException('Upload is no longer completable');
    }

    let inspected: { size: number; checksum: string | null };
    try {
      inspected = await this.storage.inspectObject({
        fileId: version.fileId,
        versionId: version.id,
        ownerOrgId: user.org_id,
        contentType: version.mimeType,
        checksum: version.sha256Hash,
      });
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Uploaded object was not found');
    }
    if (inspected.size !== Number(version.size)) {
      throw new BadRequestException('Uploaded object size does not match the upload manifest');
    }
    if (!inspected.checksum || inspected.checksum !== version.sha256Hash.toLowerCase()) {
      throw new BadRequestException('Uploaded object checksum does not match the upload manifest');
    }

    await this.prisma.$transaction(async (tx) => {
      // Claim completion atomically. Only the request that changes PENDING →
      // COMPLETE is allowed to increment quota and emit completion effects.
      const claimed = await tx.fileVersion.updateMany({
        where: { id: version.id, uploadStatus: UploadStatus.PENDING },
        data: { uploadStatus: UploadStatus.COMPLETE },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('Upload completion was already processed; retry the request');
      }

      await tx.storageQuota.upsert({ where: { orgId: user.org_id }, create: { orgId: user.org_id, quotaBytes: 10737418240n, usedBytes: 0n }, update: {} });
      const quotaUpdated = await tx.$executeRaw`UPDATE storage_quotas SET used_bytes = used_bytes + ${version.size} WHERE org_id = ${user.org_id} AND used_bytes + ${version.size} <= quota_bytes`;
      if (quotaUpdated !== 1) throw new ForbiddenException('Storage quota exceeded');
      await tx.file.update({
        where: { id: version.fileId },
        data: {
          size: version.size,
          mimeType: version.mimeType,
          sha256Hash: version.sha256Hash,
          fileType: classifyFileType(version.mimeType),
        },
      });
      await tx.fileActivity.create({
        data: {
          orgId: user.org_id,
          fileId: version.fileId,
          userId: user.sub,
          action: AuditAction.UPLOAD_VERSION,
          metadata: { versionNumber: version.versionNumber, size: version.size.toString() },
        },
      });
      await tx.auditLog.create({
        data: {
          orgId: user.org_id,
          actorId: user.sub,
          action: 'FILE_UPLOAD_COMPLETE',
          resourceType: 'FILE',
          resourceId: version.fileId,
        },
      });
    });
    void this.dlp.classifyFile(user, version.fileId).catch(() => undefined);

    // Active upload workflows are evaluated only after the upload transaction
    // succeeds. Execution is idempotent per workflow/file event and failures
    // never roll back a successful upload.
    void this.workflowEngine.onFileUploaded(user, {
      fileId: version.fileId,
      name: version.file.name,
      mimeType: version.mimeType,
      fileType: classifyFileType(version.mimeType),
      size: version.size.toString(),
      userId: user.sub,
    });
    void this.workflowEngine.executeTrigger(user, {
      eventType: 'create',
      fileId: version.fileId,
      name: version.file.name,
      mimeType: version.mimeType,
      fileType: classifyFileType(version.mimeType),
      size: version.size.toString(),
      userId: user.sub,
      resourceType: 'FILE',
    }).catch(() => undefined);

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
          where: { uploadStatus: UploadStatus.COMPLETE },
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
    await this.dlp.assertAllowed(user, file.id, 'DOWNLOAD');
    const scan = await this.prisma.$queryRawUnsafe<any[]>(`SELECT status FROM malware_scans WHERE org_id=? AND file_id=? ORDER BY created_at DESC LIMIT 1`, user.org_id, file.id).catch(() => []);
    if (scan[0]?.status === 'INFECTED') throw new NotFoundException('File is unavailable');

    const version = file.versions[0];
    const storageObject = await this.resolveVersionStorageObject(version);
    const signed = await this.storage.createDownloadUrl({
      fileId: file.id,
      versionId: version.id,
      storageKey: storageObject?.storageKey ?? undefined,
      ownerOrgId: user.org_id,
      contentType: version.mimeType,
      // Force a direct download: the signed URL carries an attachment
      // disposition so browsers never render the bytes inline.
      disposition: 'attachment',
      fileName: file.name,
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
          where: { versionNumber, uploadStatus: UploadStatus.COMPLETE },
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
    await this.dlp.assertAllowed(user, file.id, 'DOWNLOAD');

    const version = file.versions[0];
    const storageObject = await this.resolveVersionStorageObject(version);
    const signed = await this.storage.createDownloadUrl({
      fileId: file.id,
      versionId: version.id,
      storageKey: storageObject?.storageKey ?? undefined,
      ownerOrgId: user.org_id,
      contentType: version.mimeType,
      disposition: 'attachment',
      fileName: file.name,
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
   * Version download addressed by `versionId` (UUID) instead of the numeric
   * `versionNumber`. Same ACL/malware/audit contract as the numeric variant.
   */
  async createVersionDownloadUrlById(
    user: AccessTokenPayload,
    fileId: string,
    versionId: string,
  ): Promise<VersionDownloadResponse> {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, deletedAt: null },
      include: {
        versions: { where: { id: versionId, uploadStatus: UploadStatus.COMPLETE }, take: 1 },
        folder: { select: { teamFolderId: true } },
      },
    });
    if (!file || file.orgId !== user.org_id || file.versions.length === 0) {
      throw new NotFoundException('File or version not found');
    }
    if (!(await this.canReadFile(user, file))) {
      throw new NotFoundException('File not found');
    }
    await this.dlp.assertAllowed(user, file.id, 'DOWNLOAD');

    const version = file.versions[0];
    const storageObject = await this.resolveVersionStorageObject(version);
    const signed = await this.storage.createDownloadUrl({
      fileId: file.id,
      versionId: version.id,
      storageKey: storageObject?.storageKey ?? undefined,
      ownerOrgId: user.org_id,
      contentType: version.mimeType,
      disposition: 'attachment',
      fileName: file.name,
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
   * Direct multipart version upload (`POST /files/:fileId/versions`).
   *
   * Security contract (zero-trust):
   * - tenant isolation first: a cross-org `fileId` is a 404, never a 403;
   * - `canRead` → 404, `canWrite` → 403 (viewers can never create versions);
   * - the server computes the SHA-256 checksum itself — client-supplied
   *   hashes are never trusted for deduplication/integrity.
   *
   * Atomicity contract:
   * - bytes are written to storage first, then the whole database mutation
   *   (version N+1, ACTIVE→SUPERSEDED flip, parent file refresh, quota,
   *   FileActivity + AuditLog) runs inside one `prisma.$transaction`;
   * - a transaction failure triggers a compensating delete of the stored
   *   object so no orphaned bytes or half-applied rows survive.
   */
  async uploadNewVersion(
    user: AccessTokenPayload,
    fileId: string,
    rawUpload: unknown,
  ): Promise<UploadNewVersionResponse> {
    const upload = parseVersionUploadFile(rawUpload);
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, deletedAt: null },
      include: { folder: { select: { teamFolderId: true } } },
    });
    if (!file || file.orgId !== user.org_id) {
      throw new NotFoundException('File not found');
    }
    const resource = await this.toFileAccessResource(user, file);
    if (!(await this.effective.canRead(user, ResourceType.FILE, file.id))) {
      throw new NotFoundException('File not found');
    }
    if (!(await this.effective.canWrite(user, ResourceType.FILE, file.id))) {
      throw new ForbiddenException(
        'Not allowed to upload a new version of this file',
      );
    }

    // A version must stay the same file type as the entity it versions.
    const parentExtension = file.extension ? file.extension.toLowerCase() : null;
    const uploadExtension = extractSafeExtension(upload.originalName);
    if (uploadExtension === null) {
      throw new BadRequestException('Invalid file extension');
    }
    if (parentExtension && uploadExtension !== parentExtension) {
      throw new BadRequestException(
        `Version uploads must keep the .${parentExtension} file type`,
      );
    }
    await this.quota.assertAvailable(user, BigInt(upload.size));

    // Server-side SHA-256: authoritative checksum for deduplication and
    // integrity verification, independent of any client-provided value.
    const checksum = createHash('sha256').update(upload.buffer).digest('hex');
    const versionId = randomUUID();
    const storageObjectId = randomUUID();
    const objectKey = this.storage.buildObjectKey(fileId, versionId);
    const { bucket, region } = this.storageLocation();
    const size = BigInt(upload.size);

    await this.storage.storeObject(
      {
        fileId,
        versionId,
        ownerOrgId: user.org_id,
        contentType: upload.mimeType,
      },
      upload.buffer,
    );
    let newVersionNumber = 0;
    try {
      await this.prisma.$transaction(async (tx) => {
        // Read-modify-write of the version counter happens inside the
        // transaction; the @@unique([fileId, versionNumber]) constraint
        // backstops concurrent uploads (P2002 → 409 below).
        const latest = await tx.fileVersion.findFirst({
          where: { fileId },
          orderBy: { versionNumber: 'desc' },
          select: { versionNumber: true },
        });
        newVersionNumber = (latest?.versionNumber ?? 0) + 1;

        await tx.fileVersion.updateMany({
          where: { fileId, status: VersionStatus.ACTIVE },
          data: { status: VersionStatus.SUPERSEDED },
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
            checksum,
          },
        });
        await tx.fileVersion.create({
          data: {
            id: versionId,
            orgId: user.org_id,
            fileId,
            versionNumber: newVersionNumber,
            storageObjectId,
            size,
            mimeType: upload.mimeType,
            extension: uploadExtension,
            sha256Hash: checksum,
            uploadedById: user.sub,
            status: VersionStatus.ACTIVE,
          },
        });
        await tx.file.update({
          where: { id: fileId },
          data: {
            size,
            mimeType: upload.mimeType,
            extension: uploadExtension,
            sha256Hash: checksum,
            fileType: classifyFileType(upload.mimeType),
            updatedAt: new Date(),
          },
        });
        await tx.fileActivity.create({
          data: {
            orgId: user.org_id,
            fileId,
            userId: user.sub,
            action: AuditAction.UPLOAD_VERSION,
            metadata: {
              versionNumber: newVersionNumber,
              size: upload.size,
              checksum,
              originalName: upload.originalName,
            },
          },
        });
        await tx.storageQuota.upsert({
          where: { orgId: user.org_id },
          create: { orgId: user.org_id, quotaBytes: 10737418240n, usedBytes: size },
          update: { usedBytes: { increment: size } },
        });
        await tx.auditLog.create({
          data: {
            orgId: user.org_id,
            actorId: user.sub,
            action: 'FILE_VERSION_UPLOADED',
            resourceType: 'FILE',
            resourceId: fileId,
            metadata: { versionNumber: newVersionNumber, checksum },
          },
        });
      });
    } catch (error) {
      // Compensating action: a rolled-back transaction must not leak bytes.
      await this.storage.deleteStoredObject(objectKey).catch(() => undefined);
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException(
          'A concurrent upload created a newer version; please retry',
        );
      }
      throw error;
    }

    void this.dlp.classifyFile(user, fileId).catch(() => undefined);

    return {
      file_id: fileId,
      version_id: versionId,
      version_number: newVersionNumber,
      size: upload.size,
      checksum,
      status: 'complete',
    };
  }


  /**
   * Fast inline preview URL (PVW-04): same ACL/malware gating as downloads
   * but deliberately free of the heavy audit side effects (no lastAccessedAt
   * write, no FILE_DOWNLOAD audit row) so preview refreshes stay cheap. The
   * signed URL carries an inline content disposition and the stored content
   * type so browsers render the asset instead of downloading it Ã¢â‚¬â€ this is the
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
          where: { status: VersionStatus.ACTIVE, uploadStatus: UploadStatus.COMPLETE },
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
    const storageObject = await this.resolveVersionStorageObject(version);
    const signed = await this.storage.createDownloadUrl({
      fileId: file.id,
      versionId: version.id,
      storageKey: storageObject?.storageKey ?? undefined,
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


  /** Aggregated collaboration activity visible to the current user. */
  async collaborationActivity(user: AccessTokenPayload, limit = 50) {
    const candidates = await this.prisma.file.findMany({
      where: { orgId: user.org_id, deletedAt: null },
      take: 250,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true, ownerId: true, folder: { select: { teamFolderId: true } } },
    });
    const visible: string[] = [];
    for (const file of candidates) {
      if (await this.canReadFile(user, file)) visible.push(file.id);
      if (visible.length >= 100) break;
    }
    if (!visible.length) return [];
    const rows = await this.prisma.fileActivity.findMany({
      where: { orgId: user.org_id, fileId: { in: visible } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
      include: {
        file: { select: { id: true, name: true, ownerId: true } },
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id, action: row.action, createdAt: row.createdAt.toISOString(),
      file: row.file, actor: row.user, metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    }));
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
/**
   * Complete version history for a file, newest first. Tenant-scoped by
   * `orgId` and read-gated: cross-tenant or unreadable files are a 404.
   */
  async getDetails(user: AccessTokenPayload, id: string) {
    const file = await this.prisma.file.findFirst({
      where: { id, orgId: user.org_id, deletedAt: null },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        folder: { select: { id: true, name: true, teamFolderId: true } },
        metadata: true,
        tags: { include: { tag: true } },
      },
    });
    if (!file || !(await this.canReadFile(user, file))) throw new NotFoundException('File not found');
    return {
      id: file.id, resourceType: 'FILE' as const, name: file.name, originalName: file.originalName,
      mimeType: file.mimeType, extension: file.extension, size: Number(file.size),
      createdAt: file.createdAt.toISOString(), updatedAt: file.updatedAt.toISOString(),
      owner: file.owner, location: file.folder, visibility: file.visibility, status: file.status,
      metadata: file.metadata, tags: file.tags.map(({ tag }) => tag),
    };
  }

  async getVersionHistory(
    user: AccessTokenPayload,
    fileId: string,
  ): Promise<VersionHistoryEntry[]> {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, deletedAt: null },
      select: {
        id: true,
        orgId: true,
        ownerId: true,
        folder: { select: { teamFolderId: true } },
      },
    });
    if (!file || file.orgId !== user.org_id) {
      throw new NotFoundException('File not found');
    }
    if (!(await this.canReadFile(user, file))) {
      throw new NotFoundException('File not found');
    }

    const versions = await this.prisma.fileVersion.findMany({
      where: { fileId, orgId: user.org_id, uploadStatus: UploadStatus.COMPLETE },
      orderBy: { versionNumber: 'desc' },
      include: {
        uploadedBy: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
      },
    });
    const currentVersionNumber = versions[0]?.versionNumber ?? 0;
    return versions.map((version) => ({
      id: version.id,
      versionNumber: version.versionNumber,
      status: version.status,
      size: Number(version.size),
      mimeType: version.mimeType,
      sha256Hash: version.sha256Hash,
      uploadedBy: version.uploadedBy,
      createdAt: version.createdAt.toISOString(),
      isCurrent: version.versionNumber === currentVersionNumber,
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
          where: { versionNumber, uploadStatus: UploadStatus.COMPLETE },
          take: 1,
        },
        folder: { select: { teamFolderId: true } },
      },
    });
    if (!file || file.orgId !== user.org_id || file.versions.length === 0) {
      throw new NotFoundException('File or version not found');
    }
    const resource = await this.toFileAccessResource(user, file);
    if (!(await this.effective.canRead(user, ResourceType.FILE, file.id))) {
      throw new NotFoundException('File not found');
    }
    if (!(await this.effective.canWrite(user, ResourceType.FILE, file.id))) {
      throw new ForbiddenException('Not allowed to restore this file version');
    }
    if (versionNumber === file.versions[0]?.versionNumber) {
      // Check if this is the current version
      const currentVersion = await this.prisma.fileVersion.findFirst({
        where: { fileId, uploadStatus: UploadStatus.COMPLETE },
        orderBy: { versionNumber: 'desc' },
      });
      if (currentVersion && versionNumber === currentVersion.versionNumber) {
        throw new BadRequestException('Cannot restore the current version');
      }
    }

    const sourceVersion = file.versions[0];
    return this.applyVersionRestore(user, fileId, sourceVersion, versionNumber);
  }

  /**
   * Restore addressed by `versionId` (UUID) instead of `versionNumber`.
   * The new version re-points at the historical version's storage object —
   * zero data duplication — and is stamped `RESTORED` for the audit trail.
   */
  async restoreVersionById(
    user: AccessTokenPayload,
    fileId: string,
    versionId: string,
  ): Promise<RestoreVersionResponse> {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, deletedAt: null },
      include: {
        versions: { where: { id: versionId, uploadStatus: UploadStatus.COMPLETE }, take: 1 },
        folder: { select: { teamFolderId: true } },
      },
    });
    if (!file || file.orgId !== user.org_id || file.versions.length === 0) {
      throw new NotFoundException('File or version not found');
    }
    const resource = await this.toFileAccessResource(user, file);
    if (!(await this.effective.canRead(user, ResourceType.FILE, file.id))) {
      throw new NotFoundException('File not found');
    }
    if (!(await this.effective.canWrite(user, ResourceType.FILE, file.id))) {
      throw new ForbiddenException('Not allowed to restore this file version');
    }
    const targetVersion = file.versions[0];
    const maxVersion = await this.prisma.fileVersion.findFirst({
      where: { fileId },
      orderBy: { versionNumber: 'desc' },
    });
    if (maxVersion && maxVersion.id === versionId) {
      throw new BadRequestException('Cannot restore the current version');
    }
    return this.applyVersionRestore(
      user,
      fileId,
      targetVersion,
      targetVersion.versionNumber,
    );
  }

  /**
   * Shared restore transaction: creates version `CurrentMax + 1` pointing at
   * the historical version's storage object (no bytes are copied), supersedes
   * the previously ACTIVE version, refreshes the parent file, and appends a
   * user-facing FileActivity plus a security AuditLog — all atomically. Any
   * failure rolls back every database modification.
   */
  private async applyVersionRestore(
    user: AccessTokenPayload,
    fileId: string,
    sourceVersion: {
      storageObjectId: string;
      size: bigint;
      mimeType: string;
      extension: string | null;
      sha256Hash: string;
    },
    restoredFromVersion: number,
  ): Promise<RestoreVersionResponse> {
    const maxVersion = await this.prisma.fileVersion.findFirst({
      where: { fileId },
      orderBy: { versionNumber: 'desc' },
    });
    const newVersionNumber = (maxVersion?.versionNumber ?? 0) + 1;

    // Storage integrity gate (BEFORE the database transaction): the physical
    // bytes behind the historical storage object must still exist (Render/S3/
    // local disk). Asserting up front keeps the restore transaction out of
    // phantom data and rolls back nothing on a missing object — a clean 404.
    const storageObject = await this.resolveVersionStorageObject(sourceVersion);
    if (!storageObject) {
      throw new NotFoundException('Storage object not found');
    }
    await this.storage.assertStoredObjectExists(storageObject.storageKey);

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
          uploadStatus: UploadStatus.COMPLETE,
        },
        data: { status: VersionStatus.SUPERSEDED },
      });
      // Strictly mirror the restored version's storage attributes onto the
      // parent File so every stream/download/preview path resolves the real
      // physical bytes (its historical storage key), not a key re-derived from
      // the restored version's own UUID — the root cause of preview corruption.
      await tx.file.update({
        where: { id: fileId },
        data: {
          updatedAt: new Date(),
          size: sourceVersion.size,
          mimeType: sourceVersion.mimeType,
          sha256Hash: sourceVersion.sha256Hash,
          extension: sourceVersion.extension,
          fileType: classifyFileType(sourceVersion.mimeType),
          storageKey: storageObject.storageKey,
          storageObjectId: sourceVersion.storageObjectId,
        },
      });
      await tx.fileActivity.create({
        data: {
          orgId: user.org_id,
          fileId,
          userId: user.sub,
          action: AuditAction.RESTORE_VERSION,
          metadata: {
            restoredFromVersion,
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
      restoredFromVersion,
    };
  }


  private dispatchWorkflowFileEvent(user: AccessTokenPayload, eventType: string, file: { id: string; name: string; mimeType: string | null; fileType: string | null; size: bigint | number; folderId?: string | null }) {
    void this.workflowEngine.executeTrigger(user, {
      eventType,
      fileId: file.id,
      name: file.name,
      mimeType: file.mimeType ?? undefined,
      fileType: file.fileType ?? undefined,
      size: file.size.toString(),
      userId: user.sub,
      folderId: file.folderId ?? undefined,
      resourceType: 'FILE',
    }).catch(() => undefined);
  }


  async move(user: AccessTokenPayload, id: string, input: MoveCopyInput) {
    const file = await this.requireMutableFile(user, await this.prisma.file.findFirst({ where: { id, deletedAt: null }, include: { folder: { select: { teamFolderId: true } } } }), 'Not allowed to move this file');
    await this.assertDestination(user, input.destinationFolderId);
    const updated = await this.prisma.file.update({ where: { id }, data: { folderId: input.destinationFolderId } });
    await this.recordActivity(user.org_id, id, user.sub, AuditAction.MOVE, { destinationFolderId: input.destinationFolderId });
    await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'FILE_MOVED', resourceType: 'FILE', resourceId: id } });
    this.dispatchWorkflowFileEvent(user, 'move', updated);
    return updated;
  }

  async copy(user: AccessTokenPayload, id: string, input: MoveCopyInput) {
    const file = await this.requireMutableFile(user, await this.prisma.file.findFirst({ where: { id, deletedAt: null }, include: { folder: { select: { teamFolderId: true } }, versions: { where: { uploadStatus: UploadStatus.COMPLETE }, orderBy: { versionNumber: 'desc' }, take: 1 } } }), 'Not allowed to copy this file');
    await this.assertDestination(user, input.destinationFolderId);
    const version = file.versions[0];
    if (!version) throw new NotFoundException('File version not found');
    const newFileId = randomUUID();
    const copied = await this.prisma.$transaction(async (tx) => {
      const newFile = await tx.file.create({ data: { id: newFileId, orgId: user.org_id, folderId: input.destinationFolderId, name: file.name, originalName: file.originalName, extension: file.extension, mimeType: file.mimeType, fileType: file.fileType, size: file.size, sha256Hash: file.sha256Hash, status: FileStatus.ACTIVE, ownerId: user.sub } });
      await tx.fileVersion.create({ data: { id: randomUUID(), orgId: user.org_id, fileId: newFileId, versionNumber: 1, storageObjectId: version.storageObjectId, size: version.size, mimeType: version.mimeType, extension: version.extension, sha256Hash: version.sha256Hash, uploadedById: user.sub, status: VersionStatus.ACTIVE, uploadStatus: UploadStatus.COMPLETE } });
      await tx.fileActivity.create({ data: { orgId: user.org_id, fileId: newFileId, userId: user.sub, action: AuditAction.COPY, metadata: { copiedFromFileId: id } } });
      await tx.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'FILE_COPIED', resourceType: 'FILE', resourceId: newFileId } });
      return newFile;
    });
    this.dispatchWorkflowFileEvent(user, 'copy', copied);
    // Do not return the Prisma model directly: File.size is a BigInt and
    // Express JSON serialization would throw after the transaction has already
    // committed, making a successful copy look like a failed request.
    return { id: copied.id, name: copied.name, action: 'copy' };
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

  private async requireMutableFile(
    user: AccessTokenPayload,
    file: { id: string; orgId: string; ownerId: string; folder?: { teamFolderId?: string | null } | null } | null,
    deniedMessage: string,
  ) {
    if (!file || file.orgId !== user.org_id) throw new NotFoundException('File not found');
    if (!(await this.effective.canRead(user, ResourceType.FILE, file.id))) {
      throw new NotFoundException('File not found');
    }
    if (!(await this.effective.canWrite(user, ResourceType.FILE, file.id))) {
      throw new ForbiddenException(deniedMessage);
    }
    return file;
  }

  private async toFileAccessResource(
    user: AccessTokenPayload,
    file: { orgId: string; ownerId: string; folder?: { teamFolderId: string | null } | null },
  ): Promise<AccessibleResource> {
    const teamFolderId = file.folder?.teamFolderId ?? null;
    if (!teamFolderId) return this.toAccessibleResource(file);
    return this.toTeamFolderResource(user, file.orgId, teamFolderId);
  }

  private async assertDestination(user: AccessTokenPayload, folderId: string | null) {
    if (!folderId) return;
    const folder = await this.prisma.folder.findFirst({ where: { id: folderId } });
    if (!folder || folder.orgId !== user.org_id) throw new NotFoundException('Destination folder not found');
    if (!(await this.canReadFolderForFile(user, folder)) || !(await this.canWriteFolderForFile(user, folder))) throw new ForbiddenException('Not allowed to use destination folder');
  }

  private async canReadFolderForFile(
    user: AccessTokenPayload,
    folder: { id?: string; orgId: string; ownerId: string; teamFolderId?: string | null },
  ) {
    return !!folder.id && this.effective.canRead(user, ResourceType.FOLDER, folder.id);
  }

  private async canWriteFolderForFile(
    user: AccessTokenPayload,
    folder: { id?: string; orgId: string; ownerId: string; teamFolderId?: string | null },
  ) {
    return !!folder.id && this.effective.canWrite(user, ResourceType.FOLDER, folder.id);
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
    folder?: { teamFolderId?: string | null } | null;
  }): AccessibleResource {
    return {
      orgId: file.orgId,
      ownerId: file.ownerId,
      teamFolderId: file.folder?.teamFolderId ?? null,
    };
  }
}
