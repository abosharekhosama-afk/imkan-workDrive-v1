import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { ConnectionAuthType, ConnectionShareRole, ConnectionStatus, ConnectionVisibility, Prisma } from '@prisma/client';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectionCryptoService } from './connection-crypto.service';
import { ConnectionProviderRegistry } from './provider-registry.service';
import { URL } from 'node:url';
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const SECRET_FIELDS = ['accessToken', 'refreshToken', 'apiKey', 'bearerToken', 'username', 'password', 'customHeaders'] as const;
type SecretKey = (typeof SECRET_FIELDS)[number];
type SecretInput = Partial<Record<SecretKey, string>>;
type OAuthProvider = 'google' | 'microsoft' | 'dropbox';

type DecryptedSecrets = Record<string, string>;

@Injectable()
export class ConnectionsService {
  constructor(private readonly prisma: PrismaService, private readonly crypto: ConnectionCryptoService, private readonly config: ConfigService, private readonly registry: ConnectionProviderRegistry) {}

  providers() { return this.registry.list(); }

  templates() {
    return [
      { key: 'rest-api-key', name: 'REST API key', provider: 'rest', authType: 'API_KEY', baseUrl: '', metadata: { responseMode: 'JSON' }, description: 'Generic HTTPS REST API using X-API-Key.' },
      { key: 'rest-bearer', name: 'REST Bearer', provider: 'rest', authType: 'BEARER', baseUrl: '', metadata: { responseMode: 'JSON' }, description: 'Generic HTTPS REST API using a Bearer token.' },
      { key: 'google-drive', name: 'Google Drive', provider: 'google', authType: 'OAUTH2', metadata: { service: 'drive' }, description: 'OAuth connection for Google Drive.' },
      { key: 'microsoft-graph', name: 'Microsoft Graph', provider: 'microsoft', authType: 'OAUTH2', metadata: { service: 'graph' }, description: 'OAuth connection for Microsoft Graph.' },
      { key: 'dropbox', name: 'Dropbox', provider: 'dropbox', authType: 'OAUTH2', metadata: { service: 'dropbox' }, description: 'OAuth connection for Dropbox.' },
    ];
  }

  private visibleWhere(user: AccessTokenPayload, id?: string): Prisma.ConnectionWhereInput {
    return { ...(id ? { id } : {}), orgId: user.org_id, OR: [{ ownerId: user.sub }, { visibility: ConnectionVisibility.ORGANIZATION }, { shares: { some: { userId: user.sub } } }] };
  }

  private async findVisible(user: AccessTokenPayload, id: string) {
    const row = await this.prisma.connection.findFirst({ where: this.visibleWhere(user, id) });
    if (!row) throw new NotFoundException('Connection not found');
    return row;
  }

  private assertProvider(provider: string, authType: ConnectionAuthType) {
    if (!this.registry.supports(provider, String(authType))) throw new BadRequestException('Unsupported provider/authentication type');
  }

  private serialize(row: any, userId?: string) {
    return { canManage: userId ? row.ownerId === userId : false, id: row.id, orgId: row.orgId, ownerId: row.ownerId, name: row.name, provider: row.provider, authType: row.authType, visibility: row.visibility, status: row.status, baseUrl: row.baseUrl, metadata: row.metadata, expiresAt: row.expiresAt, scope: row.scope, lastTestedAt: row.lastTestedAt, lastUsedAt: row.lastUsedAt, errorCode: row.errorCode, errorMessage: row.errorMessage, createdAt: row.createdAt, updatedAt: row.updatedAt };
  }

  async list(user: AccessTokenPayload, query?: { provider?: string; status?: string; search?: string }) {
    const rows = await this.prisma.connection.findMany({ where: { ...this.visibleWhere(user), ...(query?.provider ? { provider: query.provider } : {}), ...(query?.status ? { status: query.status as ConnectionStatus } : {}), ...(query?.search ? { name: { contains: query.search } } : {}) }, orderBy: { updatedAt: 'desc' } });
    return rows.map((row) => this.serialize(row, user.sub));
  }

  async get(user: AccessTokenPayload, id: string) { return this.serialize(await this.findVisible(user, id), user.sub); }

  async create(user: AccessTokenPayload, input: { name: string; provider: string; authType: ConnectionAuthType; visibility?: ConnectionVisibility; baseUrl?: string; metadata?: Record<string, unknown>; secrets?: SecretInput }) {
    const name = String(input.name ?? '').trim();
    if (!name || name.length > 120) throw new BadRequestException('Connection name is required');
    this.assertProvider(input.provider, input.authType);
    if (input.provider === 'rest' && input.baseUrl && !/^https:\/\//i.test(input.baseUrl)) throw new BadRequestException('REST base URL must use HTTPS');
    if (input.authType === ConnectionAuthType.OAUTH2 && input.secrets && Object.keys(input.secrets).length) throw new BadRequestException('OAuth credentials must be connected through the provider authorization flow');
    const secretData = this.encryptSecrets(input.secrets ?? {});
    const row = await this.prisma.connection.create({ data: { id: randomUUID(), orgId: user.org_id, ownerId: user.sub, name, provider: input.provider, authType: input.authType, visibility: input.visibility ?? ConnectionVisibility.PRIVATE, baseUrl: input.baseUrl?.trim() || null, metadata: (input.metadata ?? {}) as Prisma.InputJsonValue, ...(Object.keys(secretData).length ? { secret: { create: { id: randomUUID(), ownerId: user.sub, ...secretData } } } : {}) } });
    if (Object.keys(secretData).length) await this.createSecretVersion(row.id, user.sub, secretData, 1);
    await this.audit(user, 'connection.created', row.id, { provider: row.provider, authType: row.authType, visibility: row.visibility });
    return this.serialize(row, user.sub);
  }

  async update(user: AccessTokenPayload, id: string, input: { name?: string; visibility?: ConnectionVisibility; baseUrl?: string; metadata?: Record<string, unknown>; secrets?: SecretInput; status?: ConnectionStatus }) {
    const current = await this.findVisible(user, id);
    const share = current.ownerId === user.sub ? null : await this.prisma.connectionShare.findFirst({ where: { connectionId: id, userId: user.sub } });
    if (current.ownerId !== user.sub && share?.role !== ConnectionShareRole.MANAGE) throw new ForbiddenException('You do not have permission to edit this connection');
    if (input.status && input.status !== ConnectionStatus.ACTIVE && input.status !== ConnectionStatus.DISABLED) throw new BadRequestException('Invalid connection status change');
    if (input.baseUrl !== undefined && input.baseUrl && !/^https:\/\//i.test(input.baseUrl)) throw new BadRequestException('REST base URL must use HTTPS');
    const secretData = input.secrets ? this.encryptSecrets(input.secrets) : {};
    let versionSnapshot: Record<string, string> | null = null;
    if (Object.keys(secretData).length) {
      const existingSecret = await this.prisma.connectionSecret.findUnique({ where: { connectionId: id } });
      versionSnapshot = this.mergeSecretSnapshot(existingSecret, secretData);
    }
    const row = await this.prisma.connection.update({ where: { id }, data: { ...(input.name !== undefined ? { name: String(input.name).trim().slice(0, 120) } : {}), ...(input.visibility ? { visibility: input.visibility } : {}), ...(input.baseUrl !== undefined ? { baseUrl: input.baseUrl?.trim() || null } : {}), ...(input.metadata !== undefined ? { metadata: input.metadata as Prisma.InputJsonValue } : {}), ...(input.status ? { status: input.status } : {}), ...(Object.keys(secretData).length ? { secret: { upsert: { create: { id: randomUUID(), ownerId: current.ownerId, ...secretData }, update: secretData } } } : {}) } });
    if (versionSnapshot) { const next = await this.nextSecretVersion(id); await this.createSecretVersion(id, user.sub, versionSnapshot, next); await this.prisma.connectionSecret.update({ where: { connectionId: id }, data: { keyVersion: next } }); }
    await this.audit(user, 'connection.updated', row.id, { changedSecrets: Object.keys(secretData).length > 0 });
    return this.serialize(row, user.sub);
  }

  async secretVersions(user: AccessTokenPayload, id: string) {
    const current = await this.findVisible(user, id);
    const rows = await this.prisma.connectionSecretVersion.findMany({ where: { connectionId: id }, orderBy: { version: 'desc' }, select: { id: true, version: true, createdById: true, createdAt: true } });
    const secret = await this.prisma.connectionSecret.findUnique({ where: { connectionId: id }, select: { keyVersion: true } });
    return { connectionId: current.id, currentVersion: secret?.keyVersion ?? null, versions: rows };
  }

  async rotateSecret(user: AccessTokenPayload, id: string, secrets: SecretInput) {
    const current = await this.findVisible(user, id);
    const share = current.ownerId === user.sub ? null : await this.prisma.connectionShare.findFirst({ where: { connectionId: id, userId: user.sub } });
    if (current.ownerId !== user.sub && share?.role !== ConnectionShareRole.MANAGE) throw new ForbiddenException('You do not have permission to rotate this connection');
    const encrypted = this.encryptSecrets(secrets);
    if (!Object.keys(encrypted).length) throw new BadRequestException('At least one secret is required');
    const existingSecret = await this.prisma.connectionSecret.findUnique({ where: { connectionId: id } });
    const snapshot = this.mergeSecretSnapshot(existingSecret, encrypted);
    const version = await this.nextSecretVersion(id);
    await this.prisma.connectionSecret.upsert({ where: { connectionId: id }, create: { id: randomUUID(), connectionId: id, ownerId: current.ownerId, ...snapshot }, update: snapshot });
    await this.createSecretVersion(id, user.sub, snapshot, version);
    await this.prisma.connectionSecret.update({ where: { connectionId: id }, data: { keyVersion: version } });
    await this.prisma.connection.update({ where: { id }, data: { status: ConnectionStatus.ACTIVE, errorCode: null, errorMessage: null } });
    await this.audit(user, 'connection.secret_rotated', id, { version });
    return { id, version, rotated: true };
  }

  async rollbackSecret(user: AccessTokenPayload, id: string, version: number) {
    const current = await this.findVisible(user, id);
    const share = current.ownerId === user.sub ? null : await this.prisma.connectionShare.findFirst({ where: { connectionId: id, userId: user.sub } });
    if (current.ownerId !== user.sub && share?.role !== ConnectionShareRole.MANAGE) throw new ForbiddenException('You do not have permission to rollback this connection');
    const target = await this.prisma.connectionSecretVersion.findFirst({ where: { connectionId: id, version } });
    if (!target) throw new NotFoundException('Secret version not found');
    const data: Record<string, string> = {}; for (const key of SECRET_FIELDS) if (target[key]) data[key] = target[key];
    if (!Object.keys(data).length) throw new BadRequestException('Secret version is empty');
    await this.prisma.connectionSecret.upsert({ where: { connectionId: id }, create: { id: randomUUID(), connectionId: id, ownerId: current.ownerId, ...data }, update: data });
    const next = await this.nextSecretVersion(id);
    await this.createSecretVersion(id, user.sub, data, next);
    await this.prisma.connectionSecret.update({ where: { connectionId: id }, data: { keyVersion: next } });
    await this.prisma.connection.update({ where: { id }, data: { status: ConnectionStatus.ACTIVE, errorCode: null, errorMessage: null } });
    await this.audit(user, 'connection.secret_rollback', id, { fromVersion: version, newVersion: next });
    return { id, version: next, restoredFrom: version, restored: true };
  }

  private async nextSecretVersion(id: string) { const latest = await this.prisma.connectionSecretVersion.findFirst({ where: { connectionId: id }, orderBy: { version: 'desc' }, select: { version: true } }); return (latest?.version ?? 0) + 1; }
  private async createSecretVersion(connectionId: string, createdById: string, data: Record<string, string>, version: number) { return this.prisma.connectionSecretVersion.create({ data: { id: randomUUID(), connectionId, createdById, version, ...data } }); }

  async disable(user: AccessTokenPayload, id: string) { return this.update(user, id, { status: ConnectionStatus.DISABLED }); }

  async enable(user: AccessTokenPayload, id: string) { return this.update(user, id, { status: ConnectionStatus.ACTIVE }); }

  async revoke(user: AccessTokenPayload, id: string) {
    const current = await this.findVisible(user, id);
    if (current.ownerId !== user.sub) throw new ForbiddenException('Only the connection owner can revoke it');
    if (current.authType !== ConnectionAuthType.OAUTH2) throw new BadRequestException('Remote revoke is supported for OAuth connections only');
    const secret = await this.prisma.connectionSecret.findUnique({ where: { connectionId: id } });
    const token = secret?.accessToken ? this.crypto.decrypt(secret.accessToken) : null;
    try { if (token) await this.providerRevoke(current.provider, token); } catch { /* local revoke still proceeds */ }
    await this.prisma.connection.update({ where: { id }, data: { status: ConnectionStatus.DISABLED, errorCode: 'REVOKED', errorMessage: 'OAuth access was revoked by the owner' } });
    await this.prisma.connectionSecret.deleteMany({ where: { connectionId: id } });
    await this.audit(user, 'connection.revoked', id, { provider: current.provider });
    return { id, revoked: true, status: ConnectionStatus.DISABLED };
  }

  async shares(user: AccessTokenPayload, id: string) {
    const current = await this.findVisible(user, id);
    const rows = await this.prisma.connectionShare.findMany({ where: { connectionId: id, connection: { orgId: user.org_id } }, orderBy: { createdAt: 'desc' }, include: { user: { select: { id: true, name: true, email: true } } } });
    return { ownerId: current.ownerId, shares: rows };
  }

  async share(user: AccessTokenPayload, id: string, targetUserId: string, role: ConnectionShareRole = ConnectionShareRole.USE) {
    const current = await this.findVisible(user, id);
    if (current.ownerId !== user.sub) throw new ForbiddenException('Only the connection owner can manage sharing');
    if (!targetUserId || targetUserId === user.sub) throw new BadRequestException('Choose another organization member');
    const target = await this.prisma.user.findFirst({ where: { id: targetUserId, memberships: { some: { organizationId: user.org_id } } }, select: { id: true } });
    if (!target) throw new NotFoundException('User is not a member of this organization');
    const row = await this.prisma.connectionShare.upsert({ where: { connectionId_userId: { connectionId: id, userId: targetUserId } }, create: { id: randomUUID(), connectionId: id, userId: targetUserId, role }, update: { role } , include: { user: { select: { id: true, name: true, email: true } } } });
    await this.audit(user, 'connection.shared', id, { userId: targetUserId, role });
    return row;
  }

  async unshare(user: AccessTokenPayload, id: string, targetUserId: string) {
    const current = await this.findVisible(user, id);
    if (current.ownerId !== user.sub) throw new ForbiddenException('Only the connection owner can manage sharing');
    await this.prisma.connectionShare.deleteMany({ where: { connectionId: id, userId: targetUserId } });
    await this.audit(user, 'connection.unshared', id, { userId: targetUserId });
    return { id, userId: targetUserId, revoked: true };
  }

  async remove(user: AccessTokenPayload, id: string) {
    const current = await this.findVisible(user, id);
    if (current.ownerId !== user.sub) throw new ForbiddenException('Only the connection owner can delete it');
    await this.prisma.connection.delete({ where: { id } });
    await this.audit(user, 'connection.deleted', id, { provider: current.provider });
    return { id, deleted: true };
  }

  async test(user: AccessTokenPayload, id: string) {
    const row = await this.findVisible(user, id);
    if (row.status === ConnectionStatus.DISABLED) throw new ConflictException('Connection is disabled');
    try {
      if (row.authType === ConnectionAuthType.OAUTH2) {
        const token = await this.getAccessTokenById(row.id);
        if (!token) throw new Error('Missing OAuth access token');
        await this.providerProbe(row.provider, token, row.baseUrl);
      } else {
        const secret = await this.prisma.connectionSecret.findUnique({ where: { connectionId: id } });
        const missing = this.requiredSecretFields(row.authType).filter((key) => !secret?.[key as SecretKey]);
        if (missing.length) throw new Error(`Missing credential: ${missing.join(', ')}`);
      }
      await this.prisma.connection.update({ where: { id }, data: { lastTestedAt: new Date(), status: ConnectionStatus.ACTIVE, errorCode: null, errorMessage: null } });
      await this.audit(user, 'connection.tested', id, { ok: true });
      return { id, ok: true, status: ConnectionStatus.ACTIVE, missing: [] as string[] };
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : 'Connection test failed';
      const reauth = row.authType === ConnectionAuthType.OAUTH2;
      await this.prisma.connection.update({ where: { id }, data: { lastTestedAt: new Date(), status: reauth ? ConnectionStatus.REAUTH_REQUIRED : ConnectionStatus.ERROR, errorCode: reauth ? 'REAUTH_REQUIRED' : 'TEST_FAILED', errorMessage: message } });
      await this.audit(user, 'connection.tested', id, { ok: false, errorCode: reauth ? 'REAUTH_REQUIRED' : 'TEST_FAILED' });
      return { id, ok: false, status: reauth ? ConnectionStatus.REAUTH_REQUIRED : ConnectionStatus.ERROR, missing: [] as string[] };
    }
  }

  async diagnostics(user: AccessTokenPayload, id: string) {
    const row = await this.findVisible(user, id);
    const secret = await this.prisma.connectionSecret.findUnique({ where: { connectionId: id }, select: { accessToken: true, refreshToken: true, apiKey: true, bearerToken: true, username: true, password: true, customHeaders: true } });
    const usage = await this.prisma.connectionUsage.aggregate({ where: { connectionId: id, orgId: user.org_id }, _count: { _all: true }, _avg: { durationMs: true } });
    const checks = {
      organizationAccess: row.orgId === user.org_id,
      enabled: row.status === ConnectionStatus.ACTIVE,
      credentialsPresent: !!secret && Object.values(secret).some(Boolean),
      restBaseUrl: row.provider !== 'rest' || !!row.baseUrl,
      oauthExpiry: row.authType !== ConnectionAuthType.OAUTH2 || !row.expiresAt || row.expiresAt.getTime() > Date.now(),
    };
    return { id: row.id, provider: row.provider, authType: row.authType, status: row.status, checks, lastTestedAt: row.lastTestedAt, lastUsedAt: row.lastUsedAt, errorCode: row.errorCode, errorMessage: row.errorMessage, usageCount: usage._count._all, averageDurationMs: usage._avg.durationMs };
  }

  async usage(user: AccessTokenPayload, id: string) {
    await this.findVisible(user, id);
    const where = { connectionId: id, orgId: user.org_id };
    const [count, recent, byStatus, byAction] = await this.prisma.$transaction([
      this.prisma.connectionUsage.count({ where }),
      this.prisma.connectionUsage.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, userId: true, workflowId: true, runId: true, actionType: true, status: true, durationMs: true, createdAt: true } }),
      this.prisma.connectionUsage.groupBy({ by: ['status'], where, _count: { _all: true }, _avg: { durationMs: true }, orderBy: { _count: { status: 'desc' } } }),
      this.prisma.connectionUsage.groupBy({ by: ['actionType'], where, _count: { _all: true }, _avg: { durationMs: true }, orderBy: { _count: { actionType: 'desc' } }, take: 10 }),
    ]);
    return { count, recent, summary: { byStatus, byAction } };
  }

  async beginOAuth(user: AccessTokenPayload, provider: OAuthProvider, folderId: string | null = null) {
    this.assertOAuthProvider(provider);
    const cfg = this.oauthConfig(provider);
    if (!cfg.clientId || !cfg.clientSecret) throw new BadRequestException(`${provider} OAuth integration is not configured`);
    const state = randomBytes(32).toString('base64url');
    await this.prisma.connectionOAuthState.create({ data: { id: randomUUID(), stateHash: this.hash(state), orgId: user.org_id, userId: user.sub, provider, folderId, expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS) } });
    const params = new URLSearchParams({ client_id: cfg.clientId, redirect_uri: cfg.callbackUrl, response_type: 'code', state });
    if (provider === 'google') params.set('scope', 'https://www.googleapis.com/auth/drive.readonly');
    if (provider === 'dropbox') params.set('token_access_type', 'offline');
    if (provider === 'microsoft') { params.set('scope', 'offline_access Files.Read'); params.set('response_mode', 'query'); }
    return { url: `${cfg.authBase}?${params.toString()}` };
  }

  async completeOAuth(provider: OAuthProvider, code: string, state: string) {
    this.assertOAuthProvider(provider);
    if (!code || !state) throw new BadRequestException('Missing OAuth callback parameters');
    const row = await this.prisma.connectionOAuthState.findFirst({ where: { stateHash: this.hash(state), provider, usedAt: null, expiresAt: { gt: new Date() } } });
    if (!row) throw new BadRequestException('OAuth state is invalid or expired');
    await this.prisma.connectionOAuthState.update({ where: { id: row.id }, data: { usedAt: new Date() } });
    const cfg = this.oauthConfig(provider);
    if (!cfg.clientId || !cfg.clientSecret) throw new BadRequestException(`${provider} OAuth integration is not configured`);
    const body = new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, code, redirect_uri: cfg.callbackUrl, grant_type: 'authorization_code' });
    const response = await fetch(cfg.tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
    const payload = await this.readJson(response);
    if (!response.ok || typeof payload.access_token !== 'string') throw new BadRequestException('OAuth authorization failed');
    const expiresAt = typeof payload.expires_in === 'number' ? new Date(Date.now() + payload.expires_in * 1000) : null;
    const existing = await this.prisma.connection.findFirst({ where: { orgId: row.orgId, ownerId: row.userId, provider, authType: ConnectionAuthType.OAUTH2 } });
    const name = existing?.name ?? `${this.registry.get(provider).name} connection`;
    const metadata = { ...(existing?.metadata && typeof existing.metadata === 'object' ? existing.metadata as Record<string, unknown> : {}), oauthProvider: provider, oauthConnectedAt: new Date().toISOString() };
    const accessToken = this.crypto.encrypt(payload.access_token);
    const newRefreshToken = typeof payload.refresh_token === 'string' ? this.crypto.encrypt(payload.refresh_token) : undefined;
    const connection = existing
      ? await this.prisma.connection.update({ where: { id: existing.id }, data: { status: ConnectionStatus.ACTIVE, metadata: metadata as Prisma.InputJsonValue, expiresAt, scope: typeof payload.scope === 'string' ? payload.scope.slice(0, 4000) : existing.scope, errorCode: null, errorMessage: null, secret: { upsert: { create: { id: randomUUID(), ownerId: row.userId, accessToken, ...(newRefreshToken ? { refreshToken: newRefreshToken } : {}) }, update: { accessToken, ...(newRefreshToken ? { refreshToken: newRefreshToken } : {}) } } } } })
      : await this.prisma.connection.create({ data: { id: randomUUID(), orgId: row.orgId, ownerId: row.userId, name, provider, authType: ConnectionAuthType.OAUTH2, visibility: ConnectionVisibility.PRIVATE, status: ConnectionStatus.ACTIVE, metadata: metadata as Prisma.InputJsonValue, expiresAt, scope: typeof payload.scope === 'string' ? payload.scope.slice(0, 4000) : null, secret: { create: { id: randomUUID(), ownerId: row.userId, accessToken, ...(newRefreshToken ? { refreshToken: newRefreshToken } : {}) } } } });
    const oauthSecret = await this.prisma.connectionSecret.findUnique({ where: { connectionId: connection.id } });
    if (oauthSecret) {
      const version = await this.nextSecretVersion(connection.id);
      const snapshot = this.mergeSecretSnapshot(oauthSecret, {});
      await this.createSecretVersion(connection.id, row.userId, snapshot, version);
      await this.prisma.connectionSecret.update({ where: { connectionId: connection.id }, data: { keyVersion: version } });
    }
    await this.prisma.auditLog.create({ data: { id: randomUUID(), orgId: row.orgId, actorId: row.userId, action: 'connection.reconnected', resourceType: 'CONNECTION', resourceId: connection.id, metadata: { provider, oauth: true } as Prisma.InputJsonValue } }).catch(() => undefined);
    return { connectionId: connection.id, frontend: this.frontendUrl(), folderId: row.folderId, orgId: row.orgId, userId: row.userId };
  }

  async reconnect(user: AccessTokenPayload, id: string) {
    const row = await this.findVisible(user, id);
    if (row.ownerId !== user.sub) throw new ForbiddenException('Only the connection owner can reconnect it');
    if (row.authType !== ConnectionAuthType.OAUTH2) throw new BadRequestException('Only OAuth connections can be reconnected');
    return this.beginOAuth(user, row.provider as OAuthProvider);
  }

  providerDefinition(provider: string) { return this.registry.get(provider); }

  async executeWorkflowRest(user: AccessTokenPayload, id: string, method: string, path: string, rawBody?: unknown, rawHeaders?: unknown, options: { responseMode?: string; jsonPath?: string; maxResponseBytes?: number; retries?: number; idempotencyKey?: string; workflowId?: string; runId?: string } = {}) {
    const result = await this.executeRestFunction(user, id, method, path, rawBody, rawHeaders, {
      responseMode: options.responseMode,
      jsonPath: options.jsonPath,
      retries: options.retries,
      idempotencyKey: options.idempotencyKey,
      workflowId: options.workflowId,
      runId: options.runId,
      maxResponseBytes: options.maxResponseBytes,
      actionType: 'http_request',
    } as any);
    return result;
  }

  async executeRestFunction(user: AccessTokenPayload, id: string, method: string, path: string, rawBody?: unknown, rawHeaders?: unknown, options: { responseMode?: string; jsonPath?: string; retries?: number; idempotencyKey?: string; workflowId?: string; runId?: string; maxResponseBytes?: number; actionType?: string } = {}) {
    const row = await this.findVisible(user, id);
    if (row.provider !== 'rest') throw new BadRequestException('HTTP_REQUEST requires a REST connection');
    if (row.status !== ConnectionStatus.ACTIVE) throw new ForbiddenException('Connection is not active');
    if (!row.baseUrl) throw new BadRequestException('REST connection base URL is missing');
    const base = new URL(row.baseUrl); if (base.protocol !== 'https:') throw new BadRequestException('REST connection must use HTTPS');
    const target = new URL(path, base); if (target.origin !== base.origin) throw new BadRequestException('HTTP_REQUEST target must remain on the connection origin');
    await this.assertSafeFunctionHost(target.hostname);
    const { secrets } = await this.getSecretsForExecution(user, id); const headers = new Headers();
    if (row.authType === ConnectionAuthType.API_KEY && secrets.apiKey) headers.set('X-API-Key', secrets.apiKey);
    if (row.authType === ConnectionAuthType.BEARER && secrets.bearerToken) headers.set('Authorization', `Bearer ${secrets.bearerToken}`);
    if (row.authType === ConnectionAuthType.BASIC && secrets.username) headers.set('Authorization', `Basic ${Buffer.from(`${secrets.username}:${secrets.password ?? ''}`).toString('base64')}`);
    if (row.authType === ConnectionAuthType.CUSTOM_HEADER && secrets.customHeaders) { const h=JSON.parse(secrets.customHeaders); if (h && typeof h==='object') for (const [k,v] of Object.entries(h)) if (!/^(authorization|cookie|proxy-authorization)$/i.test(k) && typeof v==='string') headers.set(k,v); }
    if (rawHeaders && typeof rawHeaders==='object') for (const [k,v] of Object.entries(rawHeaders as Record<string,unknown>)) if (!/^(authorization|cookie|proxy-authorization)$/i.test(k) && typeof v==='string') headers.set(k,v);
    let body: string|undefined; if (rawBody !== undefined && rawBody !== null) { body=typeof rawBody==='string'?rawBody:JSON.stringify(rawBody); if (!headers.has('content-type')) headers.set('content-type','application/json'); }
    const started=Date.now(); let status='FAILED'; const maxRetries=Math.min(Math.max(Number(options.retries ?? 0),0),3);
    const retryable = method === 'GET' || method === 'HEAD' || (Boolean(options.idempotencyKey) && ['PUT','PATCH','DELETE'].includes(method));
    if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey);
    try {
      let response: Response | null = null; let lastError: unknown = null;
      for (let attempt=0; attempt<=maxRetries; attempt++) {
        try { response=await fetch(target,{method,headers,body,redirect:'error',signal:AbortSignal.timeout(15000)}); if (response.ok || !retryable || ![408,429,500,502,503,504].includes(response.status) || attempt===maxRetries) break; }
        catch (e) { lastError=e; if (!retryable || attempt===maxRetries) throw e; }
        await new Promise(r=>setTimeout(r, Math.min(250 * 2**attempt, 1500)));
      }
      if (!response) throw (lastError instanceof Error ? lastError : new Error('HTTP request failed'));
      const text=await response.text(); status=response.ok?'SUCCESS':'FAILED';
      const maxBytes = Number.isFinite(Number(options.maxResponseBytes)) ? Math.min(20000, Math.max(256, Math.floor(Number(options.maxResponseBytes)))) : 20000;
      if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new BadRequestException(`HTTP response exceeds the ${maxBytes} byte limit`);
      const clipped=text.slice(0,maxBytes); const mode=String(options.responseMode ?? 'TEXT').toUpperCase();
      let parsed: unknown = clipped;
      if (mode === 'NONE') parsed = undefined;
      else if (mode === 'HEADERS') parsed = Object.fromEntries(response.headers.entries());
      else if (mode === 'JSON') { try { parsed=JSON.parse(clipped); } catch { parsed=clipped; } }
      if (options.jsonPath && parsed && typeof parsed === 'object') { for (const part of options.jsonPath.split('.').filter(Boolean)) { if (parsed && typeof parsed === 'object') parsed=(parsed as any)[part]; else { parsed=undefined; break; } } }
      return { status:response.status, ok:response.ok, headers:Object.fromEntries(response.headers.entries()), body: parsed };
    } finally { await this.prisma.connectionUsage.create({data:{id:randomUUID(),orgId:user.org_id,connectionId:id,userId:user.sub,actionType: options.actionType ?? 'function:http_request', workflowId: options.workflowId, runId: options.runId,status,durationMs:Date.now()-started}}).catch(()=>undefined); }
  }

  decryptSecret(value: string) { return this.crypto.decrypt(value); }

  async getAccessTokenById(id: string): Promise<string | null> {
    const row = await this.prisma.connection.findUnique({ where: { id }, include: { secret: true } });
    if (!row || row.authType !== ConnectionAuthType.OAUTH2 || row.status === ConnectionStatus.DISABLED) return null;
    const secret = row.secret;
    if (!secret?.accessToken) return null;
    const accessToken = this.crypto.decrypt(secret.accessToken);
    if (!row.expiresAt || row.expiresAt.getTime() > Date.now() + 60_000) return accessToken;
    if (!secret.refreshToken) return accessToken;
    return this.refreshOAuthToken(row.provider as OAuthProvider, id, this.crypto.decrypt(secret.refreshToken));
  }

  async getSecretsForExecution(user: AccessTokenPayload, id: string) {
    const row = await this.findVisible(user, id);
    if (row.status === ConnectionStatus.DISABLED) throw new ForbiddenException('Connection is disabled');
    if (row.status === ConnectionStatus.REAUTH_REQUIRED) throw new ForbiddenException('Connection requires re-authentication');
    const secret = await this.prisma.connectionSecret.findUnique({ where: { connectionId: id } });
    if (!secret) throw new BadRequestException('Connection credentials are missing');
    const out: DecryptedSecrets = {};
    for (const key of SECRET_FIELDS) if (secret[key]) out[key] = this.crypto.decrypt(secret[key]!);
    if (row.authType === ConnectionAuthType.OAUTH2) { const token = await this.getAccessTokenById(id); if (token) out.accessToken = token; }
    await this.prisma.connection.update({ where: { id }, data: { lastUsedAt: new Date() } });
    return { row, secrets: out };
  }

  private async refreshOAuthToken(provider: OAuthProvider, id: string, currentRefreshToken: string) {
    const cfg = this.oauthConfig(provider);
    if (!cfg.clientId || !cfg.clientSecret) throw new BadRequestException('OAuth provider is not configured');
    const body = new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: currentRefreshToken, grant_type: 'refresh_token' });
    const response = await fetch(cfg.tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
    const payload = await this.readJson(response);
    if (!response.ok || typeof payload.access_token !== 'string') {
      await this.prisma.connection.update({ where: { id }, data: { status: ConnectionStatus.REAUTH_REQUIRED, errorCode: 'TOKEN_REFRESH_FAILED', errorMessage: 'OAuth token refresh failed' } }).catch(() => undefined);
      throw new ForbiddenException('Connection requires re-authentication');
    }
    const accessToken = this.crypto.encrypt(payload.access_token);
    const newRefreshToken = typeof payload.refresh_token === 'string' ? this.crypto.encrypt(payload.refresh_token) : undefined;
    await this.prisma.connection.update({ where: { id }, data: { expiresAt: typeof payload.expires_in === 'number' ? new Date(Date.now() + payload.expires_in * 1000) : null, status: ConnectionStatus.ACTIVE, errorCode: null, errorMessage: null, secret: { update: { accessToken, ...(newRefreshToken ? { refreshToken: newRefreshToken } : {}) } } } });
    return payload.access_token as string;
  }

  private async providerRevoke(provider: string, token: string) {
    if (provider === 'google') {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000) });
      return;
    }
    if (provider === 'dropbox') {
      await fetch('https://api.dropboxapi.com/2/auth/token/revoke', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(10000) });
      return;
    }
    if (provider === 'microsoft') {
      return; // Microsoft Graph delegated tokens are invalidated through provider-side session/consent controls.
    }
  }

  private async providerProbe(provider: string, token: string, baseUrl?: string | null) {
    const url = provider === 'google' ? 'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)' : provider === 'dropbox' ? 'https://api.dropboxapi.com/2/users/get_current_account' : provider === 'microsoft' ? 'https://graph.microsoft.com/v1.0/me?$select=id' : baseUrl;
    if (!url) return;
    const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}`);
  }

  private assertOAuthProvider(provider: string): asserts provider is OAuthProvider {
    if (!['google', 'microsoft', 'dropbox'].includes(provider)) throw new BadRequestException('Unsupported OAuth provider');
  }

  private oauthConfig(provider: OAuthProvider) {
    const prefix = provider.toUpperCase();
    const frontend = this.frontendUrl();
    const clientId = (this.config.get<string>(`${prefix}_CLIENT_ID`) ?? (provider === 'google' ? this.config.get<string>('GOOGLE_ID') : undefined))?.trim();
    const clientSecret = (this.config.get<string>(`${prefix}_CLIENT_SECRET`) ?? (provider === 'google' ? this.config.get<string>('GOOGLE_SECRET') : undefined))?.trim();
    const callbackUrl = (this.config.get<string>(`${prefix}_CONNECTION_CALLBACK_URL`) ?? `${this.config.get<string>('PUBLIC_API_URL') ?? 'http://localhost:3001'}/connections/oauth/${provider}/callback`).trim();
    const authBase = provider === 'google' ? 'https://accounts.google.com/o/oauth2/v2/auth' : provider === 'dropbox' ? 'https://www.dropbox.com/oauth2/authorize' : 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
    const tokenUrl = provider === 'google' ? 'https://oauth2.googleapis.com/token' : provider === 'dropbox' ? 'https://api.dropboxapi.com/oauth2/token' : 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
    return { frontend, clientId, clientSecret, callbackUrl, authBase, tokenUrl };
  }

  private frontendUrl() { return (this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000').replace(/\/$/, ''); }
  private hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
  private async readJson(response: Response): Promise<any> { const text = await response.text(); try { return JSON.parse(text); } catch { return { raw: text.slice(0, 1000) }; } }
  private requiredSecretFields(authType: ConnectionAuthType): string[] { if (authType === ConnectionAuthType.API_KEY) return ['apiKey']; if (authType === ConnectionAuthType.BEARER) return ['bearerToken']; if (authType === ConnectionAuthType.OAUTH2) return ['accessToken']; if (authType === ConnectionAuthType.BASIC) return ['username', 'password']; if (authType === ConnectionAuthType.CUSTOM_HEADER) return ['customHeaders']; return []; }
  private async assertSafeFunctionHost(hostname: string) {
    const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (['localhost', '127.0.0.1', '::1'].includes(host) || host.endsWith('.local') || host.endsWith('.internal')) throw new BadRequestException('HTTP_REQUEST target is not allowed');
    if (isIP(host)) {
      if (this.isPrivateFunctionIp(host)) throw new BadRequestException('HTTP_REQUEST target is private');
      return;
    }
    const addresses = await lookup(host, { all: true, verbatim: true });
    if (!addresses.length || addresses.some((entry) => this.isPrivateFunctionIp(entry.address))) throw new BadRequestException('HTTP_REQUEST hostname resolves to a private or local network target');
  }

  private isPrivateFunctionIp(host: string) {
    if (host.includes(':')) {
      const h = host.toLowerCase();
      return h === '::1' || h === '::' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe8') || h.startsWith('fe9') || h.startsWith('fea') || h.startsWith('feb');
    }
    const p = host.split('.').map(Number);
    if (p.length !== 4 || p.some(Number.isNaN)) return true;
    return p[0] === 0 || p[0] === 10 || p[0] === 127 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168) || (p[0] === 169 && p[1] === 254);
  }

  private mergeSecretSnapshot(existing: Record<string, any> | null, encrypted: Record<string, string>) {
    const snapshot: Record<string, string> = {};
    for (const key of SECRET_FIELDS) {
      const value = encrypted[key] ?? existing?.[key];
      if (value) snapshot[key] = String(value);
    }
    return snapshot;
  }

  private encryptSecrets(input: SecretInput) { const out: Record<string, string> = {}; for (const key of SECRET_FIELDS) if (input[key]) out[key] = this.crypto.encrypt(String(input[key])); return out; }
  private async audit(user: AccessTokenPayload, action: string, resourceId: string, metadata: Record<string, unknown>) { await this.prisma.auditLog.create({ data: { id: randomUUID(), orgId: user.org_id, actorId: user.sub, action, resourceType: 'CONNECTION', resourceId, metadata: metadata as Prisma.InputJsonValue } }).catch(() => undefined); }
}
