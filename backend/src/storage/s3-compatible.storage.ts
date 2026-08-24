import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject } from '@nestjs/common';
import { getTenantStore } from '../auth/tenant-context';
import { buildTenantObjectKey } from './object-key';
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
    const command = new PutObjectCommand({
      Bucket: this.bucket(),
      Key: objectKey,
      ContentType: request.contentType,
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
    const objectKey = buildTenantObjectKey(
      orgId,
      request.fileId,
      request.versionId,
    );
    const expiresInSeconds = this.expiresInSeconds();
    const command = new GetObjectCommand({
      Bucket: this.bucket(),
      Key: objectKey,
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

  async assertObjectExists(request: StorageObjectRequest): Promise<void> {
    const orgId = this.authorize(request);
    const objectKey = buildTenantObjectKey(
      orgId,
      request.fileId,
      request.versionId,
    );
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
