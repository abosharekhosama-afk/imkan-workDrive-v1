import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject } from '@nestjs/common';
import { createHash } from 'crypto';
import { getTenantStore } from '../auth/tenant-context';
import { buildTenantObjectKey, parseTenantObjectKey, buildPublicTemplateObjectKey, isPublicTemplateObjectKey } from './object-key';
import { contentDispositionInline } from '../common/content-disposition';
import {
  S3_CLIENT,
  S3_PRESIGNER,
  SignedUrlResult,
  StorageObjectRequest,
  StorageService,
} from './storage.types';

export type S3Presigner = (
  client: S3Client,
  command: PutObjectCommand | GetObjectCommand,
  options: { expiresIn: number },
) => Promise<string>;

@Injectable()
export class S3CompatibleStorageAdapter implements StorageService {
  constructor(
    private readonly config: ConfigService,
    @Inject(S3_CLIENT) private readonly client: S3Client,
    @Inject(S3_PRESIGNER) private readonly presign: S3Presigner,
  ) {}

  buildPublicTemplateObjectKey(fileId: string, versionId: string): string { return buildPublicTemplateObjectKey(fileId, versionId); }

  buildObjectKey(fileId: string, versionId: string): string {
    return buildTenantObjectKey(this.requireOrgId(), fileId, versionId);
  }

  async createUploadUrl(
    request: StorageObjectRequest,
  ): Promise<SignedUrlResult> {
    const orgId = this.authorize(request);
    const objectKey = request.publicAccess ? (request.storageKey ?? buildPublicTemplateObjectKey(request.fileId, request.versionId)) : (request.storageKey ?? buildTenantObjectKey(orgId, request.fileId, request.versionId));
    const expiresInSeconds = this.expiresInSeconds();
    const command = new PutObjectCommand({
      Bucket: this.bucket(),
      Key: objectKey,
      ContentType: request.contentType,
      ...(request.checksum ? { Metadata: { sha256: request.checksum } } : {}),
    });
    const url = await this.presign(this.client, command, {
      expiresIn: expiresInSeconds,
    });
    return { url, method: 'PUT', objectKey, expiresInSeconds };
  }

  async createDownloadUrl(
    request: StorageObjectRequest,
  ): Promise<SignedUrlResult> {
    const orgId = this.authorize(request);
    const objectKey = request.publicAccess ? (request.storageKey ?? buildPublicTemplateObjectKey(request.fileId, request.versionId)) : (request.storageKey ?? buildTenantObjectKey(orgId, request.fileId, request.versionId));
    const expiresInSeconds = this.expiresInSeconds();
    const command = new GetObjectCommand({
      Bucket: this.bucket(),
      Key: objectKey,
      // Inline previews must serve the stored content type and an inline
      // disposition, otherwise R2/S3 replays the upload-time headers and
      // browsers download the asset instead of rendering it (403/CORS class
      // of preview failures). These response overrides are part of the
      // signature, so they cannot be tampered with.
      ...(request.disposition === 'inline'
        ? {
            ResponseContentType: request.contentType,
            ResponseContentDisposition: contentDispositionInline(
              request.fileName ?? 'preview',
            ),
          }
        : {}),
    });
    const url = await this.presign(this.client, command, {
      expiresIn: expiresInSeconds,
    });
    return { url, method: 'GET', objectKey, expiresInSeconds };
  }

  async deleteObject(request: StorageObjectRequest): Promise<void> {
    const orgId = this.authorize(request);
    const objectKey = buildTenantObjectKey(orgId, request.fileId, request.versionId);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket(), Key: objectKey }));
  }

  async deleteStoredObject(storageKey: string): Promise<void> {
    if (!isPublicTemplateObjectKey(storageKey)) parseTenantObjectKey(storageKey);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket(), Key: storageKey }));
  }

  /** Server-side ingestion for direct multipart uploads (version upload). */
  async copyStoredObject(sourceStorageKey: string, destination: StorageObjectRequest): Promise<void> {
    const orgId = this.authorize(destination);
    const source = isPublicTemplateObjectKey(sourceStorageKey) ? null : parseTenantObjectKey(sourceStorageKey);
    if (source && source.orgId !== orgId) throw new ForbiddenException('Resource does not belong to this organization');
    const destinationKey = destination.storageKey ?? buildTenantObjectKey(orgId, destination.fileId, destination.versionId);
    await this.client.send(new CopyObjectCommand({
      Bucket: this.bucket(),
      CopySource: `${this.bucket()}/${sourceStorageKey}`,
      Key: destinationKey,
      ContentType: destination.contentType,
      MetadataDirective: 'REPLACE',
    }));
  }

  async readStoredObject(storageKey: string): Promise<Buffer> {
    const source = isPublicTemplateObjectKey(storageKey) ? null : parseTenantObjectKey(storageKey);
    if (source && source.orgId !== this.requireOrgId()) throw new ForbiddenException('Resource does not belong to this organization');
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket(), Key: storageKey }));
      const body: any = result.Body;
      if (!body) throw new Error('empty body');
      if (typeof body.transformToByteArray === 'function') return Buffer.from(await body.transformToByteArray());
      const chunks: Buffer[] = [];
      for await (const chunk of body as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks);
    } catch { throw new NotFoundException('File object not found on storage'); }
  }

  async storeObject(request: StorageObjectRequest, bytes: Buffer): Promise<void> {
    const orgId = this.authorize(request);
    const objectKey = request.publicAccess ? (request.storageKey ?? buildPublicTemplateObjectKey(request.fileId, request.versionId)) : (request.storageKey ?? buildTenantObjectKey(orgId, request.fileId, request.versionId));
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket(),
        Key: objectKey,
        ContentType: request.contentType,
        Body: bytes,
      }),
    );
  }

  async createMultipartUpload(request: StorageObjectRequest): Promise<{ uploadId: string; objectKey: string }> {
    const orgId = this.authorize(request);
    const objectKey = request.storageKey ?? buildTenantObjectKey(orgId, request.fileId, request.versionId);
    const result = await this.client.send(new CreateMultipartUploadCommand({
      Bucket: this.bucket(), Key: objectKey, ContentType: request.contentType,
      Metadata: request.checksum ? { sha256: request.checksum } : undefined,
    }));
    if (!result.UploadId) throw new BadRequestException('Storage did not return a multipart upload id');
    return { uploadId: result.UploadId, objectKey };
  }

  async uploadMultipartPart(request: StorageObjectRequest, uploadId: string, partNumber: number, bytes: Buffer, checksum: string): Promise<{ etag: string; size: number; checksum: string }> {
    const orgId = this.authorize(request);
    const objectKey = request.storageKey ?? buildTenantObjectKey(orgId, request.fileId, request.versionId);
    const actualChecksum = createHash('sha256').update(bytes).digest('hex');
    if (actualChecksum !== checksum.toLowerCase()) throw new BadRequestException('Multipart part checksum mismatch');
    const result = await this.client.send(new UploadPartCommand({
      Bucket: this.bucket(), Key: objectKey, UploadId: uploadId, PartNumber: partNumber, Body: bytes,
    }));
    if (!result.ETag) throw new BadRequestException('Storage did not return a part ETag');
    return { etag: result.ETag, size: bytes.length, checksum };
  }

  async completeMultipartUpload(request: StorageObjectRequest, uploadId: string, parts: Array<{ partNumber: number; etag: string }>): Promise<void> {
    const orgId = this.authorize(request);
    const objectKey = request.storageKey ?? buildTenantObjectKey(orgId, request.fileId, request.versionId);
    if (!uploadId || !Array.isArray(parts) || parts.length === 0) {
      throw new BadRequestException('Multipart completion requires an upload id and at least one part');
    }
    const ordered = [...parts].sort((a, b) => a.partNumber - b.partNumber);
    for (let i = 0; i < ordered.length; i += 1) {
      if (!Number.isInteger(ordered[i].partNumber) || ordered[i].partNumber !== i + 1 || !ordered[i].etag) {
        throw new BadRequestException('Multipart parts must be contiguous and ordered from part 1');
      }
    }
    await this.client.send(new CompleteMultipartUploadCommand({
      Bucket: this.bucket(), Key: objectKey, UploadId: uploadId,
      MultipartUpload: { Parts: ordered.map(p => ({ PartNumber: p.partNumber, ETag: p.etag })) },
    }));
  }

  async abortMultipartUpload(request: StorageObjectRequest, uploadId: string): Promise<void> {
    const orgId = this.authorize(request);
    const objectKey = request.storageKey ?? buildTenantObjectKey(orgId, request.fileId, request.versionId);
    await this.client.send(new AbortMultipartUploadCommand({ Bucket: this.bucket(), Key: objectKey, UploadId: uploadId }));
  }

  async inspectObject(
    request: StorageObjectRequest,
  ): Promise<{ size: number; checksum: string | null }> {
    const orgId = this.authorize(request);
    const objectKey = request.publicAccess
      ? (request.storageKey ?? buildPublicTemplateObjectKey(request.fileId, request.versionId))
      : (request.storageKey ?? buildTenantObjectKey(orgId, request.fileId, request.versionId));
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket(), Key: objectKey }),
      );
      if (typeof result.ContentLength !== 'number') {
        throw new BadRequestException('Stored object has no measurable size');
      }
      let checksum = result.Metadata?.sha256?.toLowerCase() ?? null;
      if (request.checksum) {
        const bodyResult = await this.client.send(new GetObjectCommand({ Bucket: this.bucket(), Key: objectKey }));
        const body: any = bodyResult.Body;
        if (!body) throw new NotFoundException('Uploaded object has no body');
        const hash = createHash('sha256');
        if (typeof body.transformToByteArray === 'function') {
          hash.update(Buffer.from(await body.transformToByteArray()));
        } else {
          for await (const chunk of body as AsyncIterable<Uint8Array>) hash.update(Buffer.from(chunk));
        }
        checksum = hash.digest('hex');
      }
      return { size: result.ContentLength, checksum };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new NotFoundException('Uploaded object was not found');
    }
  }

  async assertObjectExists(request: StorageObjectRequest): Promise<void> {
    const orgId = this.authorize(request);
    const objectKey = request.publicAccess ? (request.storageKey ?? buildPublicTemplateObjectKey(request.fileId, request.versionId)) : (request.storageKey ?? buildTenantObjectKey(orgId, request.fileId, request.versionId));
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket(),
          Key: objectKey,
        }),
      );
    } catch {
      throw new BadRequestException('Uploaded object was not found');
    }
  }

  /**
   * Storage-integrity gate for version restore: the physical bytes behind an
   * existing tenant storage key must still be present. Cross-tenant keys are
   * rejected up front (zero-trust), and a missing object surfaces as a clean
   * 404 so the restore transaction is never entered against phantom data.
   */
  async assertStoredObjectExists(storageKey: string): Promise<void> {
    const parsed = parseTenantObjectKey(storageKey);
    if (parsed.orgId !== this.requireOrgId()) {
      throw new ForbiddenException('Resource does not belong to this organization');
    }
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket(), Key: storageKey }),
      );
    } catch {
      throw new NotFoundException('File object not found on storage');
    }
  }

  private authorize(request: StorageObjectRequest): string {
    if ('orgId' in request) {
      throw new ForbiddenException('orgId must not be supplied by the client');
    }
    if (request.publicAccess) return request.ownerOrgId;
    const orgId = this.requireOrgId();
    if (request.ownerOrgId !== orgId) {
      throw new ForbiddenException(
        'Resource does not belong to this organization',
      );
    }
    if (request.storageKey) {
      const parsed = parseTenantObjectKey(request.storageKey);
      if (parsed.orgId !== orgId) {
        throw new ForbiddenException('Storage key does not belong to this organization');
      }
    }
    return orgId;
  }

  private requireOrgId(): string {
    const orgId = getTenantStore()?.orgId;
    if (!orgId) {
      throw new UnauthorizedException('Tenant context is missing');
    }
    return orgId;
  }

  private bucket(): string {
    const bucket = this.config.get<string>('S3_BUCKET');
    if (!bucket) {
      throw new Error('S3_BUCKET is not configured');
    }
    return bucket;
  }

  private expiresInSeconds(): number {
    const raw = this.config.get<string>('S3_SIGNED_URL_EXPIRES_SECONDS');
    const parsed = raw ? Number(raw) : 900;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 900;
  }
}

export const defaultS3Presigner: S3Presigner = (client, command, options) =>
  getSignedUrl(client, command, options);
