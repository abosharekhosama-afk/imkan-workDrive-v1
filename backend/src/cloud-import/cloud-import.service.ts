import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { CloudImportJobStatus } from '@prisma/client';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { runWithTenant } from '../auth/tenant-context';
import { PrismaService } from '../prisma/prisma.service';
import { ForbiddenException } from '@nestjs/common';
import { AuditAction, FileStatus, VersionStatus } from '@prisma/client';
import { classifyFileType, extractExtension } from '../common/file-classification';
import { WorkflowEngineService } from '../workflows/workflow-engine.service';
import { STORAGE_SERVICE, type StorageService } from '../storage/storage.types';
import { Inject } from '@nestjs/common';
import { CloudProvider } from './cloud-import.schemas';
import { parseCreateJobs } from './cloud-import.schemas';
import { ConnectionsService } from '../connections/connections.service';

const MAX_IMPORT_BYTES = 250 * 1024 * 1024;
const MAX_LIST_ITEMS = 100;
const TOKEN_TTL_MS = 10 * 60 * 1000;

type RemoteFile = { id: string; name: string; size: number | null; mimeType: string; modifiedAt?: string | null; kind?: 'file' | 'folder' };
type Connection = { id: string; provider: CloudProvider; accessToken: string; refreshToken: string | null; expiresAt: Date | null };

@Injectable()
export class CloudImportService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private readonly processing = new Set<string>();
  private readonly maxBytes = MAX_IMPORT_BYTES;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    private readonly workflowEngine: WorkflowEngineService,
    private readonly connections: ConnectionsService,
  ) {}

  onModuleInit() {
    this.recoverStaleJobs().catch(() => undefined);
    this.timer = setInterval(() => { void this.processPendingJobs(); }, 2000);
    this.timer.unref?.();
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  private key(): Buffer {
    const configured = this.config.get<string>('CLOUD_IMPORT_ENCRYPTION_KEY')?.trim();
    if (configured) {
      const hex = Buffer.from(configured, 'hex');
      if (hex.length === 32) return hex;
      const base64 = Buffer.from(configured, 'base64');
      if (base64.length === 32) return base64;
      throw new BadRequestException('CLOUD_IMPORT_ENCRYPTION_KEY must be 32 bytes (hex or base64)');
    }
    return createHash('sha256').update(this.config.get<string>('JWT_SECRET') ?? 'development-only-secret').digest();
  }

  private encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
  }
  private decrypt(value: string): string {
    const [iv, tag, data] = value.split('.');
    if (!iv || !tag || !data) throw new BadRequestException('Stored cloud credential is invalid');
    const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  }
  private hash(value: string) { return createHash('sha256').update(value).digest('hex'); }

  providerConfig(provider: CloudProvider) {
    const frontend = (this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000').replace(/\/$/, '');
    const configuredCallback = this.config.get<string>(`${provider.toUpperCase()}_CLOUD_CALLBACK_URL`);
    return {
      frontend,
      clientId: (this.config.get<string>(`${provider.toUpperCase()}_CLIENT_ID`) ?? (provider === 'google' ? this.config.get<string>('GOOGLE_ID') : undefined))?.trim(),
      clientSecret: (this.config.get<string>(`${provider.toUpperCase()}_CLIENT_SECRET`) ?? (provider === 'google' ? this.config.get<string>('GOOGLE_SECRET') : undefined))?.trim(),
      callbackUrl: configuredCallback?.trim() || `${this.config.get<string>('PUBLIC_API_URL') ?? 'http://localhost:3001'}/cloud-import/oauth/${provider}/callback`,
    };
  }

  async beginOAuth(user: AccessTokenPayload, provider: CloudProvider, folderId: string | null, connectionId: string | null = null) {
    const genericProvider = provider === 'onedrive' ? 'microsoft' : provider;
    return this.connections.beginOAuth(user, genericProvider as 'google' | 'microsoft' | 'dropbox', folderId, connectionId, '/files');
  }

  async oauthCallback(provider: CloudProvider, code: string, state: string) {
    const genericProvider = provider === 'onedrive' ? 'microsoft' : provider;
    const result = await this.connections.completeOAuth(genericProvider as 'google' | 'microsoft' | 'dropbox', code, state);
    // Keep CloudConnection as a compatibility mirror for existing import jobs and older deployments.
    const generic = await this.prisma.connection.findUnique({ where: { id: result.connectionId }, include: { secret: true } });
    if (generic?.secret?.accessToken) {
      const accessToken = this.connections.decryptSecret(generic.secret.accessToken);
      const refreshToken = generic.secret.refreshToken ? this.connections.decryptSecret(generic.secret.refreshToken) : null;
      await this.prisma.cloudConnection.upsert({
        where: { orgId_userId_provider: { orgId: result.orgId ?? '', userId: result.userId ?? '', provider } },
        create: { id: randomUUID(), orgId: result.orgId ?? '', userId: result.userId ?? '', provider, accessToken: this.encrypt(accessToken), refreshToken: refreshToken ? this.encrypt(refreshToken) : null, expiresAt: generic.expiresAt, scope: generic.scope },
        update: { accessToken: this.encrypt(accessToken), ...(refreshToken ? { refreshToken: this.encrypt(refreshToken) } : {}), expiresAt: generic.expiresAt, scope: generic.scope },
      });
    }
    return { frontend: result.frontend, folderId: result.folderId, connectionId: result.connectionId };
  }

  async listProviders(user: AccessTokenPayload) {
    const genericRows = await this.prisma.connection.findMany({
      where: { orgId: user.org_id, authType: 'OAUTH2', provider: { in: ['google', 'microsoft', 'dropbox'] }, status: 'ACTIVE', OR: [{ ownerId: user.sub }, { visibility: 'ORGANIZATION' }, { shares: { some: { userId: user.sub } } }] },
      select: { id: true, provider: true, name: true, status: true, updatedAt: true, expiresAt: true },
      orderBy: { updatedAt: 'desc' },
    });
    const legacyRows = await this.prisma.cloudConnection.findMany({ where: { orgId: user.org_id, userId: user.sub }, select: { id: true, provider: true, expiresAt: true, updatedAt: true } });
    return ['google', 'dropbox', 'onedrive'].map((provider) => {
      const genericProvider = provider === 'onedrive' ? 'microsoft' : provider;
      const matches = genericRows.filter((r) => r.provider === genericProvider);
      const legacy = legacyRows.find((r) => r.provider === provider);
      const first = matches[0];
      return {
        provider,
        connected: Boolean(first || legacy),
        connectionId: first?.id ?? (legacy ? legacy.id : null),
        connectionName: first?.name ?? null,
        connections: matches.map((r) => ({ id: r.id, name: r.name, updatedAt: r.updatedAt, expiresAt: r.expiresAt })),
        updatedAt: first?.updatedAt ?? legacy?.updatedAt ?? null,
      };
    });
  }

  async listFiles(user: AccessTokenPayload, provider: CloudProvider, connectionId: string | null = null): Promise<RemoteFile[]> {
    const connection = await this.getConnection(user, provider, connectionId);
    const token = await this.ensureAccessToken(connection);
    if (provider === 'google') {
      const q = encodeURIComponent("trashed = false and mimeType != 'application/vnd.google-apps.folder'");
      const response = await fetch(`https://www.googleapis.com/drive/v3/files?pageSize=${MAX_LIST_ITEMS}&q=${q}&fields=files(id,name,size,mimeType,modifiedTime),nextPageToken`, { headers: { authorization: `Bearer ${token}` } });
      const payload = await this.readJson(response); if (!response.ok) throw new BadRequestException('Google Drive listing failed');
      return (Array.isArray(payload.files) ? payload.files : []).map((f: any) => ({ id: String(f.id), name: String(f.name ?? 'Untitled'), size: f.size ? Number(f.size) : null, mimeType: String(f.mimeType ?? 'application/octet-stream'), modifiedAt: f.modifiedTime ?? null, kind: 'file' }));
    }
    if (provider === 'dropbox') {
      const response = await fetch('https://api.dropboxapi.com/2/files/list_folder', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ path: '', recursive: false, limit: MAX_LIST_ITEMS }) });
      const payload = await this.readJson(response); if (!response.ok) throw new BadRequestException('Dropbox listing failed');
      return (Array.isArray(payload.entries) ? payload.entries : []).filter((f: any) => f['.tag'] === 'file').map((f: any) => ({ id: String(f.id ?? f.path_lower), name: String(f.name ?? 'Untitled'), size: typeof f.size === 'number' ? f.size : null, mimeType: this.mimeFromName(String(f.name ?? '')), modifiedAt: f.server_modified ?? null, kind: 'file' }));
    }
    const response = await fetch('https://graph.microsoft.com/v1.0/me/drive/root/children?$top=100&$select=id,name,size,file,fileSystemInfo,@microsoft.graph.downloadUrl', { headers: { authorization: `Bearer ${token}` } });
    const payload = await this.readJson(response); if (!response.ok) throw new BadRequestException('OneDrive listing failed');
    return (Array.isArray(payload.value) ? payload.value : []).filter((f: any) => f.file).map((f: any) => ({ id: String(f.id), name: String(f.name ?? 'Untitled'), size: typeof f.size === 'number' ? f.size : null, mimeType: String(f.file?.mimeType ?? this.mimeFromName(String(f.name ?? ''))), modifiedAt: f.fileSystemInfo?.lastModifiedDateTime ?? null, kind: 'file' }));
  }

  async createJobs(user: AccessTokenPayload, provider: CloudProvider, body: unknown) {
    const input = parseCreateJobs(body);
    if (input.folderId) {
      const folder = await this.prisma.folder.findFirst({ where: { id: input.folderId } });
      if (!folder || folder.orgId !== user.org_id) throw new NotFoundException('Destination folder not found');
    }
    const connection = await this.getConnection(user, provider, input.connectionId ?? null);
    const remote = await this.listFiles(user, provider, input.connectionId ?? null);
    const byId = new Map(remote.map((file) => [file.id, file]));
    const jobs = [];
    for (const requested of input.files) {
      const file = byId.get(requested.id);
      if (!file || file.kind !== 'file') throw new BadRequestException('One or more selected cloud files are no longer available');
      if (file.size !== null && file.size > this.maxBytes) throw new BadRequestException(`${file.name} exceeds the ${Math.floor(this.maxBytes / 1024 / 1024)} MB import limit`);
      const existing = await this.prisma.cloudImportJob.findFirst({ where: { orgId: user.org_id, userId: user.sub, connectionId: connection.id, remoteFileId: file.id, folderId: input.folderId, status: { in: [CloudImportJobStatus.PENDING, CloudImportJobStatus.IN_PROGRESS, CloudImportJobStatus.COMPLETED] } }, orderBy: { createdAt: 'desc' } });
      if (existing) { jobs.push(existing); continue; }
      jobs.push(await this.prisma.cloudImportJob.create({ data: { id: randomUUID(), orgId: user.org_id, userId: user.sub, connectionId: connection.id, provider, folderId: input.folderId, remoteFileId: file.id, remoteName: file.name, remoteMimeType: file.mimeType, totalBytes: file.size === null ? null : BigInt(file.size), status: CloudImportJobStatus.PENDING, progress: 0 } }));
    }
    void this.processPendingJobs();
    return jobs.map((job) => this.publicJob(job));
  }

  async retryJob(user: AccessTokenPayload, id: string) {
    const job = await this.prisma.cloudImportJob.findFirst({ where: { id, orgId: user.org_id, userId: user.sub } });
    if (!job) throw new NotFoundException('Import job not found');
    if (job.status !== CloudImportJobStatus.FAILED) throw new ConflictException('Only failed imports can be retried');
    const updated = await this.prisma.cloudImportJob.update({ where: { id: job.id }, data: { status: CloudImportJobStatus.PENDING, progress: 0, bytesDone: 0n, error: null, startedAt: null, completedAt: null } });
    void this.processPendingJobs();
    return this.publicJob(updated);
  }

  async listJobs(user: AccessTokenPayload, ids?: string[]) {
    const rows = await this.prisma.cloudImportJob.findMany({ where: { orgId: user.org_id, userId: user.sub, ...(ids?.length ? { id: { in: ids } } : {}) }, orderBy: { createdAt: 'desc' }, take: 50 });
    return rows.map((row) => this.publicJob(row));
  }

  private publicJob(row: any) { return { id: row.id, provider: row.provider, remoteName: row.remoteName, status: row.status, progress: row.progress, bytesDone: Number(row.bytesDone), totalBytes: row.totalBytes === null ? null : Number(row.totalBytes), error: row.error, fileId: row.fileId, createdAt: row.createdAt, updatedAt: row.updatedAt }; }

  private async processPendingJobs() {
    const pending = await this.prisma.cloudImportJob.findMany({ where: { status: CloudImportJobStatus.PENDING }, orderBy: { createdAt: 'asc' }, take: 3 });
    for (const job of pending) {
      if (this.processing.has(job.id)) continue;
      this.processing.add(job.id);
      void runWithTenant({ orgId: job.orgId, userId: job.userId }, () => this.runJob(job.id)).finally(() => this.processing.delete(job.id));
    }
  }

  private async recoverStaleJobs() {
    await this.prisma.cloudImportJob.updateMany({ where: { status: CloudImportJobStatus.IN_PROGRESS, updatedAt: { lt: new Date(Date.now() - 5 * 60 * 1000) } }, data: { status: CloudImportJobStatus.PENDING, error: 'Recovered after an interrupted import' } });
  }

  private async runJob(id: string) {
    const claimed = await this.prisma.cloudImportJob.updateMany({ where: { id, status: CloudImportJobStatus.PENDING }, data: { status: CloudImportJobStatus.IN_PROGRESS, startedAt: new Date(), error: null } });
    if (claimed.count !== 1) return;
    const job = await this.prisma.cloudImportJob.findUnique({ where: { id }, include: { connection: true } });
    if (!job) return;
    try {
      const connection: Connection = { id: job.connection.id, provider: job.connection.provider as CloudProvider, accessToken: this.decrypt(job.connection.accessToken), refreshToken: job.connection.refreshToken ? this.decrypt(job.connection.refreshToken) : null, expiresAt: job.connection.expiresAt };
      const token = await this.ensureAccessToken(connection);
      const downloaded = await this.downloadRemote(connection.provider, token, job.remoteFileId, job.remoteName, job.remoteMimeType, async (done, total) => {
        const progress = total > 0 ? Math.min(75, Math.max(1, Math.floor((done / total) * 75))) : Math.min(75, Math.max(1, job.progress + 1));
        if (progress !== job.progress) await this.prisma.cloudImportJob.update({ where: { id }, data: { progress, bytesDone: BigInt(done), totalBytes: total > 0 ? BigInt(total) : undefined } }).catch(() => undefined);
      });
      if (downloaded.bytes.length > this.maxBytes) throw new BadRequestException('Imported file exceeds the server import limit');
      const sha = createHash('sha256').update(downloaded.bytes).digest('hex');
      let fileId = job.fileId;
      let versionId = job.versionId;
      if (!fileId || !versionId) {
        fileId = randomUUID(); versionId = randomUUID();
        await this.prisma.cloudImportJob.update({ where: { id }, data: { fileId, versionId } });
      }
      const objectKey = this.storage.buildObjectKey(fileId, versionId);
      const bucket = this.config.get<string>('S3_BUCKET') ?? 'imkan-workdrive-dev';
      const region = this.config.get<string>('S3_REGION') ?? 'us-east-1';
      await this.storage.storeObject({ fileId, versionId, ownerOrgId: job.orgId, contentType: downloaded.mimeType, storageKey: objectKey }, downloaded.bytes);
      await this.prisma.cloudImportJob.update({ where: { id }, data: { totalBytes: BigInt(downloaded.bytes.length), bytesDone: BigInt(downloaded.bytes.length), progress: 90 } });
      const cleanName = this.safeFileName(downloaded.name);
      const extension = extractExtension(cleanName);
      const fileType = classifyFileType(downloaded.mimeType);
      await this.prisma.$transaction(async (tx) => {
        const existing = await tx.file.findFirst({ where: { id: fileId!, orgId: job.orgId } });
        if (existing) {
          await tx.cloudImportJob.update({ where: { id }, data: { status: CloudImportJobStatus.COMPLETED, progress: 100, bytesDone: BigInt(downloaded.bytes.length), completedAt: new Date(), error: null } });
          return;
        }
        await tx.storageQuota.upsert({ where: { orgId: job.orgId }, create: { orgId: job.orgId, quotaBytes: 10737418240n, usedBytes: 0n }, update: {} });
        const quotaRows = await tx.$queryRawUnsafe<any[]>('SELECT quota_bytes AS quotaBytes, used_bytes AS usedBytes FROM storage_quotas WHERE org_id=? FOR UPDATE', job.orgId);
        const quota = quotaRows[0];
        const quotaBytes = BigInt(quota.quotaBytes); const usedBytes = BigInt(quota.usedBytes); const size = BigInt(downloaded.bytes.length);
        if (usedBytes + size > quotaBytes) throw new ForbiddenException('Storage quota exceeded');
        const storageObjectId = randomUUID();
        await tx.file.create({ data: { id: fileId!, orgId: job.orgId, folderId: job.folderId, name: cleanName, originalName: cleanName, extension, mimeType: downloaded.mimeType, fileType, size, sha256Hash: sha, status: FileStatus.ACTIVE, ownerId: job.userId, storageKey: objectKey, storageObjectId } });
        await tx.storageObject.create({ data: { id: storageObjectId, orgId: job.orgId, fileId: fileId!, storageKey: objectKey, bucket, region, size, checksum: sha } });
        await tx.fileVersion.create({ data: { id: versionId!, orgId: job.orgId, fileId: fileId!, versionNumber: 1, storageObjectId, size, mimeType: downloaded.mimeType, extension, sha256Hash: sha, uploadedById: job.userId, status: VersionStatus.ACTIVE } });
        await tx.fileActivity.create({ data: { orgId: job.orgId, fileId: fileId!, userId: job.userId, action: AuditAction.CREATE, metadata: { source: 'cloud-import', provider: connection.provider, remoteFileId: job.remoteFileId, name: cleanName, mimeType: downloaded.mimeType } } });
        await tx.storageQuota.update({ where: { orgId: job.orgId }, data: { usedBytes: { increment: size } } });
        await tx.auditLog.create({ data: { orgId: job.orgId, actorId: job.userId, action: 'FILE_IMPORTED_FROM_CLOUD', resourceType: 'FILE', resourceId: fileId!, metadata: { provider: connection.provider, remoteFileId: job.remoteFileId } } });
        await tx.cloudImportJob.update({ where: { id }, data: { status: CloudImportJobStatus.COMPLETED, progress: 100, bytesDone: size, totalBytes: size, completedAt: new Date(), error: null } });
      });
      void this.workflowEngine.onFileUploaded({ sub: job.userId, org_id: job.orgId, role: 'MEMBER' } as AccessTokenPayload, { fileId, name: cleanName, mimeType: downloaded.mimeType, fileType, size: downloaded.bytes.length.toString(), userId: job.userId });
      void this.workflowEngine.executeTrigger({ sub: job.userId, org_id: job.orgId, role: 'MEMBER' } as AccessTokenPayload, { eventType: 'create', fileId, name: cleanName, mimeType: downloaded.mimeType, fileType, size: downloaded.bytes.length.toString(), userId: job.userId, resourceType: 'FILE' }).catch(() => undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : 'Cloud import failed';
      await this.prisma.cloudImportJob.update({ where: { id }, data: { status: CloudImportJobStatus.FAILED, error: message } }).catch(() => undefined);
    }
  }

  private async downloadRemote(provider: CloudProvider, token: string, id: string, name: string, mimeType: string, onProgress?: (done: number, total: number) => Promise<void>): Promise<{ bytes: Buffer; name: string; mimeType: string }> {
    let url = '';
    let headers: Record<string, string> = { authorization: `Bearer ${token}` };
    let outputName = name;
    let outputMime = mimeType || this.mimeFromName(name);
    if (provider === 'google') {
      const nativeExports: Record<string, [string, string, string]> = {
        'application/vnd.google-apps.document': ['application/pdf', 'pdf', 'application/pdf'],
        'application/vnd.google-apps.spreadsheet': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
        'application/vnd.google-apps.presentation': ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
      };
      if (nativeExports[outputMime]) { const [exportMime, ext, finalMime] = nativeExports[outputMime]; url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}/export?mimeType=${encodeURIComponent(exportMime)}`; outputName = `${outputName}.${ext}`; outputMime = finalMime; }
      else url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`;
    } else if (provider === 'dropbox') {
      url = 'https://content.dropboxapi.com/2/files/download';
      headers = { authorization: `Bearer ${token}`, 'Dropbox-API-Arg': JSON.stringify({ path: id }) };
    } else {
      const meta = await this.graphMetadata(token, id);
      if (!meta.downloadUrl) throw new BadRequestException('OneDrive file is not downloadable');
      url = meta.downloadUrl;
    }
    const response = await fetch(url, { headers });
    if (!response.ok || !response.body) throw new BadRequestException('Cloud file download failed');
    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (contentLength > this.maxBytes) throw new BadRequestException('Cloud file exceeds the server import limit');
    const reader = response.body.getReader(); const chunks: Buffer[] = []; let total = 0;
    let lastProgressBytes = 0;
    while (true) { const part = await reader.read(); if (part.done) break; total += part.value.byteLength; if (total > this.maxBytes) { await reader.cancel(); throw new BadRequestException('Cloud file exceeds the server import limit'); } chunks.push(Buffer.from(part.value)); if (onProgress && (total - lastProgressBytes >= 5 * 1024 * 1024 || total === contentLength)) { lastProgressBytes = total; await onProgress(total, contentLength); } }
    if (onProgress) await onProgress(total, contentLength || total);
    return { bytes: Buffer.concat(chunks), name: outputName, mimeType: outputMime };
  }

  private async graphMetadata(token: string, id: string) { const response = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(id)}?$select=name,size,file,@microsoft.graph.downloadUrl`, { headers: { authorization: `Bearer ${token}` } }); const payload = await this.readJson(response); if (!response.ok) throw new BadRequestException('OneDrive metadata request failed'); return { downloadUrl: payload['@microsoft.graph.downloadUrl'], name: payload.name, size: payload.size, mimeType: payload.file?.mimeType }; }

  private async getConnection(user: AccessTokenPayload, provider: CloudProvider, connectionId: string | null = null) {
    const genericProvider = provider === 'onedrive' ? 'microsoft' : provider;
    const generic = connectionId
      ? await this.prisma.connection.findFirst({ where: { id: connectionId, orgId: user.org_id, provider: genericProvider, authType: 'OAUTH2', status: 'ACTIVE', OR: [{ ownerId: user.sub }, { visibility: 'ORGANIZATION' }, { shares: { some: { userId: user.sub } } }] }, include: { secret: true } })
      : await this.prisma.connection.findFirst({ where: { orgId: user.org_id, ownerId: user.sub, provider: genericProvider, authType: 'OAUTH2', status: 'ACTIVE' }, include: { secret: true }, orderBy: { updatedAt: 'desc' } });
    if (generic?.secret?.accessToken) return { id: generic.id, provider, accessToken: this.connections.decryptSecret(generic.secret.accessToken), refreshToken: generic.secret.refreshToken ? this.connections.decryptSecret(generic.secret.refreshToken) : null, expiresAt: generic.expiresAt };
    const row = await this.prisma.cloudConnection.findFirst({ where: { orgId: user.org_id, userId: user.sub, provider } });
    if (!row) throw new ConflictException('Connect this cloud provider first');
    return { id: row.id, provider, accessToken: this.decrypt(row.accessToken), refreshToken: row.refreshToken ? this.decrypt(row.refreshToken) : null, expiresAt: row.expiresAt };
  }

  private async ensureAccessToken(connection: Connection): Promise<string> {
    if (!connection.expiresAt || connection.expiresAt.getTime() > Date.now() + 60_000) return connection.accessToken;
    const generic = await this.prisma.connection.findUnique({ where: { id: connection.id } });
    if (generic) return (await this.connections.getAccessTokenById(generic.id)) ?? connection.accessToken;
    if (!connection.refreshToken) return connection.accessToken;
    const cfg = this.providerConfig(connection.provider);
    const body = new URLSearchParams({ client_id: cfg.clientId!, client_secret: cfg.clientSecret!, refresh_token: connection.refreshToken, grant_type: 'refresh_token' });
    const tokenUrl = connection.provider === 'google' ? 'https://oauth2.googleapis.com/token' : connection.provider === 'dropbox' ? 'https://api.dropboxapi.com/oauth2/token' : 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
    const response = await fetch(tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
    const payload = await this.readJson(response);
    if (!response.ok || typeof payload.access_token !== 'string') throw new BadRequestException('Cloud authorization expired; reconnect the provider');
    await this.prisma.cloudConnection.update({ where: { id: connection.id }, data: { accessToken: this.encrypt(payload.access_token), ...(typeof payload.refresh_token === 'string' ? { refreshToken: this.encrypt(payload.refresh_token) } : {}), expiresAt: typeof payload.expires_in === 'number' ? new Date(Date.now() + payload.expires_in * 1000) : null } });
    return payload.access_token;
  }

  private async readJson(response: Response): Promise<any> { const text = await response.text(); try { return text ? JSON.parse(text) : {}; } catch { return {}; } }
  private mimeFromName(name: string) { const ext = name.toLowerCase().split('.').pop(); const map: Record<string,string> = { pdf:'application/pdf', png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',txt:'text/plain',csv:'text/csv',json:'application/json',zip:'application/zip',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xls:'application/vnd.ms-excel',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',ppt:'application/vnd.ms-powerpoint',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation' }; return map[ext ?? ''] ?? 'application/octet-stream'; }
  private safeFileName(name: string) { const clean = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().replace(/\.+$/g, ''); return (clean || 'Imported file').slice(0, 255); }
}
