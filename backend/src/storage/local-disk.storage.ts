import { access, appendFile, copyFile, mkdir, readFile, stat, unlink, writeFile, rm, rename } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getTenantStore } from '../auth/tenant-context';
import {
  signObjectAccess,
  verifyObjectAccess,
  type ObjectAccessMethod,
} from './object-access-token';
import { buildTenantObjectKey, parseTenantObjectKey, buildPublicTemplateObjectKey, parsePublicTemplateObjectKey, isPublicTemplateObjectKey } from './object-key';
import type {
  SignedUrlResult,
  StorageObjectRequest,
  StorageService,
} from './storage.types';

@Injectable()
export class LocalDiskStorageAdapter implements StorageService {
  constructor(private readonly config: ConfigService) {}

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
    const token = signObjectAccess(this.signingSecret(), {
      method: 'PUT',
      objectKey,
      exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
      contentType: request.contentType,
    });
    return {
      url: `${this.publicBaseUrl()}/storage/objects?token=${encodeURIComponent(token)}`,
      method: 'PUT',
      objectKey,
      expiresInSeconds,
    };
  }

  async createDownloadUrl(
    request: StorageObjectRequest,
  ): Promise<SignedUrlResult> {
    const orgId = this.authorize(request);
    const objectKey = request.publicAccess ? (request.storageKey ?? buildPublicTemplateObjectKey(request.fileId, request.versionId)) : (request.storageKey ?? buildTenantObjectKey(orgId, request.fileId, request.versionId));
    const expiresInSeconds = this.expiresInSeconds();
    const token = signObjectAccess(this.signingSecret(), {
      method: 'GET',
      objectKey,
      exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
      contentType: request.contentType,
      disposition: request.disposition,
      fileName: request.fileName,
    });
    return {
      url: `${this.publicBaseUrl()}/storage/objects?token=${encodeURIComponent(token)}`,
      method: 'GET',
      objectKey,
      expiresInSeconds,
    };
  }

  async createMultipartUpload(request: StorageObjectRequest): Promise<{ uploadId: string; objectKey: string }> {
    const orgId = this.authorize(request);
    const objectKey = request.storageKey ?? buildTenantObjectKey(orgId, request.fileId, request.versionId);
    const uploadId = randomUUID();
    await mkdir(this.multipartDir(uploadId), { recursive: true });
    await writeFile(this.multipartManifestPath(uploadId), JSON.stringify({ objectKey, ownerOrgId: orgId, fileId: request.fileId, versionId: request.versionId, contentType: request.contentType, checksum: request.checksum ?? null }));
    return { uploadId, objectKey };
  }

  async uploadMultipartPart(request: StorageObjectRequest, uploadId: string, partNumber: number, bytes: Buffer, checksum: string): Promise<{ etag: string; size: number; checksum: string }> {
    const orgId = this.authorize(request);
    if (!Number.isInteger(partNumber) || partNumber < 1) throw new BadRequestException('Invalid part number');
    const manifest = await this.readMultipartManifest(uploadId);
    if (manifest.ownerOrgId !== orgId || manifest.fileId !== request.fileId || manifest.versionId !== request.versionId) throw new ForbiddenException('Multipart upload does not belong to this organization');
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (actual !== checksum.toLowerCase()) throw new BadRequestException('Multipart part checksum mismatch');
    await writeFile(resolve(this.multipartDir(uploadId), `part_${partNumber}`), bytes);
    return { etag: actual, size: bytes.length, checksum: actual };
  }

  async completeMultipartUpload(request: StorageObjectRequest, uploadId: string, parts: Array<{ partNumber: number; etag: string }>): Promise<void> {
    const orgId = this.authorize(request);
    const manifest = await this.readMultipartManifest(uploadId);
    if (manifest.ownerOrgId !== orgId || manifest.fileId !== request.fileId || manifest.versionId !== request.versionId) throw new ForbiddenException('Multipart upload does not belong to this organization');
    const ordered = [...parts].sort((a,b) => a.partNumber - b.partNumber);
    if (!ordered.length) throw new BadRequestException('Multipart upload has no parts');
    for (let i = 0; i < ordered.length; i += 1) {
      if (!Number.isInteger(ordered[i].partNumber) || ordered[i].partNumber !== i + 1 || !ordered[i].etag) {
        throw new BadRequestException('Multipart parts must be contiguous and ordered from part 1');
      }
    }
    const finalPath = this.resolveObjectPath(manifest.objectKey);
    await mkdir(dirname(finalPath), { recursive: true });
    // Build the object in a sibling temporary file. Never truncate/replace the
    // destination until every part has been read and integrity-checked. This
    // keeps a failed completion from leaving a partial physical object.
    const tempPath = `${finalPath}.multipart-${uploadId}.tmp`;
    try {
      await writeFile(tempPath, Buffer.alloc(0));
      for (const part of ordered) {
        const partPath = resolve(this.multipartDir(uploadId), `part_${part.partNumber}`);
        let bytes: Buffer;
        try {
          bytes = await readFile(partPath);
        } catch {
          throw new BadRequestException(`Multipart part ${part.partNumber} is missing`);
        }
        const checksum = createHash('sha256').update(bytes).digest('hex');
        if (checksum !== part.etag.replace(/^"|"$/g, '').toLowerCase()) {
          throw new BadRequestException(`Multipart part ${part.partNumber} checksum mismatch`);
        }
        await appendFile(tempPath, bytes);
      }
      await rename(tempPath, finalPath);
    } finally {
      await rm(tempPath, { force: true }).catch(() => undefined);
    }
    await rm(this.multipartDir(uploadId), { recursive: true, force: true });
  }

  async abortMultipartUpload(request: StorageObjectRequest, uploadId: string): Promise<void> {
    const orgId = this.authorize(request);
    const manifest = await this.readMultipartManifest(uploadId);
    if (manifest.ownerOrgId !== orgId) throw new ForbiddenException('Multipart upload does not belong to this organization');
    await rm(this.multipartDir(uploadId), { recursive: true, force: true });
  }

  async inspectObject(
    request: StorageObjectRequest,
  ): Promise<{ size: number; checksum: string | null }> {
    const orgId = this.authorize(request);
    const objectKey = request.publicAccess
      ? (request.storageKey ?? buildPublicTemplateObjectKey(request.fileId, request.versionId))
      : (request.storageKey ?? buildTenantObjectKey(orgId, request.fileId, request.versionId));
    const path = this.resolveObjectPath(objectKey);
    try {
      const info = await stat(path);
      const hash = createHash('sha256');
      await new Promise<void>((resolvePromise, reject) => {
        const stream = createReadStream(path);
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('end', () => resolvePromise());
        stream.on('error', reject);
      });
      return { size: info.size, checksum: hash.digest('hex') };
    } catch {
      throw new NotFoundException('Uploaded object was not found');
    }
  }

  async assertObjectExists(request: StorageObjectRequest): Promise<void> {
    const orgId = this.authorize(request);
    const objectKey = request.publicAccess ? (request.storageKey ?? buildPublicTemplateObjectKey(request.fileId, request.versionId)) : (request.storageKey ?? buildTenantObjectKey(orgId, request.fileId, request.versionId));
    try {
      await access(this.resolveObjectPath(objectKey));
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
    try {
      if (!isPublicTemplateObjectKey(storageKey)) {
        const parsed = parseTenantObjectKey(storageKey);
        if (parsed.orgId !== this.requireOrgId()) throw new ForbiddenException('Resource does not belong to this organization');
      }
      await access(this.resolveObjectPath(storageKey));
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      throw new NotFoundException('File object not found on storage');
    }
  }

  async deleteObject(request: StorageObjectRequest): Promise<void> {
    const orgId = this.authorize(request);
    const objectKey = buildTenantObjectKey(orgId, request.fileId, request.versionId);
    try {
      await unlink(this.resolveObjectPath(objectKey));
    } catch {
      // Permanent deletion is idempotent when the object is already absent.
    }
  }

  async deleteStoredObject(storageKey: string): Promise<void> {
    try {
      await unlink(this.resolveObjectPath(storageKey));
    } catch {
      // Permanent deletion is idempotent when the object is already absent.
    }
  }

  async putObjectFromToken(token: string, bytes: Buffer): Promise<void> {
    const payload = verifyObjectAccess(this.signingSecret(), token, 'PUT');
    const path = this.resolveObjectPath(payload.objectKey);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
  }

  /** Server-side ingestion for direct multipart uploads (version upload). */
  async copyStoredObject(sourceStorageKey: string, destination: StorageObjectRequest): Promise<void> {
    const orgId = this.authorize(destination);
    const source = isPublicTemplateObjectKey(sourceStorageKey) ? null : parseTenantObjectKey(sourceStorageKey);
    if (source && source.orgId !== orgId) throw new ForbiddenException('Resource does not belong to this organization');
    const destinationKey = destination.storageKey ?? buildTenantObjectKey(orgId, destination.fileId, destination.versionId);
    const sourcePath = this.resolveObjectPath(sourceStorageKey);
    const destinationPath = this.resolveObjectPath(destinationKey);
    await mkdir(dirname(destinationPath), { recursive: true });
    await copyFile(sourcePath, destinationPath);
  }

  async readStoredObject(storageKey: string): Promise<Buffer> {
    if (!isPublicTemplateObjectKey(storageKey)) {
      const parsed = parseTenantObjectKey(storageKey);
      if (parsed.orgId !== this.requireOrgId()) throw new ForbiddenException('Resource does not belong to this organization');
    }
    try { return await readFile(this.resolveObjectPath(storageKey)); }
    catch { throw new NotFoundException('File object not found on storage disk'); }
  }

  async storeObject(request: StorageObjectRequest, bytes: Buffer): Promise<void> {
    const orgId = this.authorize(request);
    const objectKey = request.publicAccess ? (request.storageKey ?? buildPublicTemplateObjectKey(request.fileId, request.versionId)) : (request.storageKey ?? buildTenantObjectKey(orgId, request.fileId, request.versionId));
    const path = this.resolveObjectPath(objectKey);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
  }

  async getObjectFromToken(
    token: string,
  ): Promise<{
    bytes: Buffer;
    contentType: string;
    disposition: 'inline' | 'attachment';
    fileName?: string;
  }> {
    const payload = verifyObjectAccess(this.signingSecret(), token, 'GET');
    const path = this.resolveObjectPath(payload.objectKey);
    try {
      const bytes = await readFile(path);
      return {
        bytes,
        contentType: payload.contentType ?? 'application/octet-stream',
        disposition: payload.disposition ?? 'attachment',
        fileName: payload.fileName,
      };
    } catch {
      // A valid token whose bytes are gone from the disk is a client-visible
      // 404 (the object no longer exists), not a malformed-request 400.
      throw new NotFoundException('File object not found on storage disk');
    }
  }

  verifyToken(token: string, method: ObjectAccessMethod) {
    return verifyObjectAccess(this.signingSecret(), token, method);
  }

  /**
   * Resolves the physical path for an already-verified token. Only used by the
   * storage controller to stream Range windows off the local disk.
   */
  resolvePathForToken(token: string): string {
    const payload = verifyObjectAccess(this.signingSecret(), token, 'GET');
    return this.resolveObjectPath(payload.objectKey);
  }

  private multipartDir(uploadId: string): string {
    const root = resolve(this.localRoot());
    const safe = uploadId.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safe) throw new BadRequestException('Invalid multipart upload id');
    return resolve(root, '_multipart', safe);
  }

  private multipartManifestPath(uploadId: string): string {
    return resolve(this.multipartDir(uploadId), 'manifest.json');
  }

  private async readMultipartManifest(uploadId: string): Promise<{ objectKey: string; ownerOrgId: string; fileId: string; versionId: string }> {
    try {
      const raw = await readFile(this.multipartManifestPath(uploadId), 'utf8');
      return JSON.parse(raw);
    } catch {
      throw new NotFoundException('Multipart upload session not found');
    }
  }

  resolveObjectPath(objectKey: string): string {
    const root = resolve(this.localRoot());
    const target = isPublicTemplateObjectKey(objectKey)
      ? resolve(root, 'public_templates', parsePublicTemplateObjectKey(objectKey).fileId, parsePublicTemplateObjectKey(objectKey).versionId)
      : (() => { const parsed = parseTenantObjectKey(objectKey); return resolve(root, `tenant_${parsed.orgId}`, 'files', parsed.fileId, parsed.versionId); })();
    if (target !== root && !target.startsWith(root + sep)) {
      throw new ForbiddenException('Invalid object path');
    }
    return target;
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

  private localRoot(): string {
    return this.config.get<string>('STORAGE_LOCAL_ROOT') ?? '.data/objects';
  }

  private publicBaseUrl(): string {
    const configured = this.config.get<string>('STORAGE_PUBLIC_BASE_URL');
    if (configured) {
      return configured.replace(/\/$/, '');
    }
    const port = this.config.get<string>('PORT') ?? '3001';
    return `http://127.0.0.1:${port}`;
  }

  private signingSecret(): string {
    const secret =
      this.config.get<string>('STORAGE_SIGNING_SECRET') ??
      this.config.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('STORAGE_SIGNING_SECRET or JWT_SECRET is not configured');
    }
    return secret;
  }

  private expiresInSeconds(): number {
    const raw = this.config.get<string>('S3_SIGNED_URL_EXPIRES_SECONDS');
    const parsed = raw ? Number(raw) : 900;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 900;
  }
}
