import { access, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getTenantStore } from '../auth/tenant-context';
import {
  signObjectAccess,
  verifyObjectAccess,
  type ObjectAccessMethod,
} from './object-access-token';
import { buildTenantObjectKey, parseTenantObjectKey } from './object-key';
import type {
  SignedUrlResult,
  StorageObjectRequest,
  StorageService,
} from './storage.types';

@Injectable()
export class LocalDiskStorageAdapter implements StorageService {
  constructor(private readonly config: ConfigService) {}

  buildObjectKey(fileId: string, versionId: string): string {
    return buildTenantObjectKey(this.requireOrgId(), fileId, versionId);
  }

  async createUploadUrl(
    request: StorageObjectRequest,
  ): Promise<SignedUrlResult> {
    const orgId = this.authorize(request);
    const objectKey = buildTenantObjectKey(
      orgId,
      request.fileId,
      request.versionId,
    );
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
    const objectKey = buildTenantObjectKey(
      orgId,
      request.fileId,
      request.versionId,
    );
    const expiresInSeconds = this.expiresInSeconds();
    const token = signObjectAccess(this.signingSecret(), {
      method: 'GET',
      objectKey,
      exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
      contentType: request.contentType,
    });
    return {
      url: `${this.publicBaseUrl()}/storage/objects?token=${encodeURIComponent(token)}`,
      method: 'GET',
      objectKey,
      expiresInSeconds,
    };
  }

  async assertObjectExists(request: StorageObjectRequest): Promise<void> {
    const orgId = this.authorize(request);
    const objectKey = buildTenantObjectKey(
      orgId,
      request.fileId,
      request.versionId,
    );
    try {
      await access(this.resolveObjectPath(objectKey));
    } catch {
      throw new BadRequestException('Uploaded object was not found');
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

  async putObjectFromToken(token: string, bytes: Buffer): Promise<void> {
    const payload = verifyObjectAccess(this.signingSecret(), token, 'PUT');
    const path = this.resolveObjectPath(payload.objectKey);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
  }

  async getObjectFromToken(
    token: string,
  ): Promise<{ bytes: Buffer; contentType: string }> {
    const payload = verifyObjectAccess(this.signingSecret(), token, 'GET');
    const path = this.resolveObjectPath(payload.objectKey);
    try {
      const bytes = await readFile(path);
      return {
        bytes,
        contentType: payload.contentType ?? 'application/octet-stream',
      };
    } catch {
      throw new BadRequestException('Uploaded object was not found');
    }
  }

  verifyToken(token: string, method: ObjectAccessMethod) {
    return verifyObjectAccess(this.signingSecret(), token, method);
  }

  resolveObjectPath(objectKey: string): string {
    const parsed = parseTenantObjectKey(objectKey);
    const root = resolve(this.localRoot());
    const target = resolve(
      root,
      `tenant_${parsed.orgId}`,
      'files',
      parsed.fileId,
      parsed.versionId,
    );
    if (target !== root && !target.startsWith(root + sep)) {
      throw new ForbiddenException('Invalid object path');
    }
    return target;
  }

  private authorize(request: StorageObjectRequest): string {
    if ('orgId' in request) {
      throw new ForbiddenException('orgId must not be supplied by the client');
    }
    const orgId = this.requireOrgId();
    if (request.ownerOrgId !== orgId) {
      throw new ForbiddenException(
        'Resource does not belong to this organization',
      );
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
