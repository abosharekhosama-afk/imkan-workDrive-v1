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
import { request as httpsRequest } from 'node:https';

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const SECRET_FIELDS = ['accessToken', 'refreshToken', 'apiKey', 'bearerToken', 'username', 'password', 'customHeaders'] as const;
type SecretInput = Partial<Record<(typeof SECRET_FIELDS)[number], string>>;
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
    if (input.provider === 'rest' && input.baseUrl) this.validateRestBaseUrl(input.baseUrl);
    this.validateSecretInput(input.authType, input.secrets);
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
    if (input.name !== undefined && !String(input.name).trim()) throw new BadRequestException('Connection name is required');
    if (input.baseUrl !== undefined && input.baseUrl) this.validateRestBaseUrl(input.baseUrl);
    this.validateSecretInput(current.authType, input.secrets);
    const secretData = input.secrets ? this.encryptSecrets(input.secrets) : {};
    const row = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.connection.update({ where: { id }, data: {
        ...(input.name !== undefined ? { name: String(input.name).trim().slice(0, 120) } : {}),
        ...(input.visibility ? { visibility: input.visibility } : {}),
        ...(input.baseUrl !== undefined ? { baseUrl: input.baseUrl?.trim() || null } : {}),
        ...(input.metadata !== undefined ? { metadata: input.metadata as Prisma.InputJsonValue } : {}),
        ...(input.status ? { status: input.status } : {}),
      } });
      if (Object.keys(secretData).length) {
        const existingSecret = await tx.connectionSecret.findUnique({ where: { connectionId: id } });
        const snapshot = this.mergeSecretSnapshot(existingSecret, secretData);
        await tx.connectionSecret.upsert({ where: { connectionId: id }, create: { id: randomUUID(), ownerId: current.ownerId, ...snapshot }, update: snapshot });
        const latest = await tx.connectionSecretVersion.findFirst({ where: { connectionId: id }, orderBy: { version: 'desc' }, select: { version: true } });
        const version = (latest?.version ?? 0) + 1;
        const secret = await tx.connectionSecret.findUnique({ where: { connectionId: id }, select: { id: true } });
        await tx.connectionSecretVersion.create({ data: { id: randomUUID(), connectionId: id, createdById: user.sub, version, ...snapshot, ...(secret ? { secretId: secret.id } : {}) } });
        await tx.connectionSecret.update({ where: { connectionId: id }, data: { keyVersion: version } });
      }
      return locked;
    });
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
    this.validateSecretInput(current.authType, secrets);
    const encrypted = this.encryptSecrets(secrets);
    if (!Object.keys(encrypted).length) throw new BadRequestException('At least one secret is required');
    const version = await this.prisma.$transaction(async (tx) => {
      await tx.connection.update({ where: { id }, data: { status: ConnectionStatus.ACTIVE, errorCode: null, errorMessage: null } });
      const existingSecret = await tx.connectionSecret.findUnique({ where: { connectionId: id } });
      const snapshot = this.mergeSecretSnapshot(existingSecret, encrypted);
      await tx.connectionSecret.upsert({ where: { connectionId: id }, create: { id: randomUUID(), ownerId: current.ownerId, ...snapshot }, update: snapshot });
      const latest = await tx.connectionSecretVersion.findFirst({ where: { connectionId: id }, orderBy: { version: 'desc' }, select: { version: true } });
      const next = (latest?.version ?? 0) + 1;
      const secret = await tx.connectionSecret.findUnique({ where: { connectionId: id }, select: { id: true } });
      await tx.connectionSecretVersion.create({ data: { id: randomUUID(), connectionId: id, createdById: user.sub, version: next, ...snapshot, ...(secret ? { secretId: secret.id } : {}) } });
      await tx.connectionSecret.update({ where: { connectionId: id }, data: { keyVersion: next } });
      return next;
    });
    await this.audit(user, 'connection.secret_rotated', id, { version });
    return { id, version, rotated: true };
  }

  async rollbackSecret(user: AccessTokenPayload, id: string, version: number) {
    const current = await this.findVisible(user, id);
    const share = current.ownerId === user.sub ? null : await this.prisma.connectionShare.findFirst({ where: { connectionId: id, userId: user.sub } });
    if (current.ownerId !== user.sub && share?.role !== ConnectionShareRole.MANAGE) throw new ForbiddenException('You do not have permission to rollback this connection');
    if (!Number.isInteger(version) || version < 1) throw new BadRequestException('Invalid secret version');
    const next = await this.prisma.$transaction(async (tx) => {
      await tx.connection.update({ where: { id }, data: { status: ConnectionStatus.ACTIVE, errorCode: null, errorMessage: null } });
      const target = await tx.connectionSecretVersion.findFirst({ where: { connectionId: id, version } });
      if (!target) throw new NotFoundException('Secret version not found');
      const data: Record<string, string> = {};
      for (const key of SECRET_FIELDS) if (target[key]) data[key] = target[key];
      if (!Object.keys(data).length) throw new BadRequestException('Secret version is empty');
      await tx.connectionSecret.upsert({ where: { connectionId: id }, create: { id: randomUUID(), ownerId: current.ownerId, ...data }, update: data });
      const latest = await tx.connectionSecretVersion.findFirst({ where: { connectionId: id }, orderBy: { version: 'desc' }, select: { version: true } });
      const newVersion = (latest?.version ?? 0) + 1;
      const secret = await tx.connectionSecret.findUnique({ where: { connectionId: id }, select: { id: true } });
      await tx.connectionSecretVersion.create({ data: { id: randomUUID(), connectionId: id, createdById: user.sub, version: newVersion, ...data, ...(secret ? { secretId: secret.id } : {}) } });
      await tx.connectionSecret.update({ where: { connectionId: id }, data: { keyVersion: newVersion } });
      return newVersion;
    });
    await this.audit(user, 'connection.secret_rollback', id, { fromVersion: version, newVersion: next });
    return { id, version: next, restoredFrom: version, restored: true };
  }

  private async createSecretVersion(connectionId: string, createdById: string, data: Record<string, string>, version: number) {
    const secret = await this.prisma.connectionSecret.findUnique({ where: { connectionId }, select: { id: true } });
    return this.prisma.connectionSecretVersion.create({ data: { id: randomUUID(), connectionId, createdById, version, ...data, ...(secret ? { secretId: secret.id } : {}) } });
  }

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
        const token = await this.getAccessTokenById(user, row.id);
        if (!token) throw new Error('Missing OAuth access token');
        await this.providerProbe(row.provider, token, row.baseUrl);
      } else if (row.provider === 'rest') {
        const secret = await this.prisma.connectionSecret.findUnique({ where: { connectionId: id } });
        const missing = this.requiredSecretFields(row.authType).filter((key) => !secret?.[key as keyof typeof secret]);
        if (missing.length) throw new Error(`Missing credential: ${missing.join(', ')}`);
        const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata as Record<string, unknown> : {};
        const testPath = typeof metadata.testPath === 'string' && metadata.testPath.startsWith('/') ? metadata.testPath : '/';
        const testMethod = typeof metadata.testMethod === 'string' && ['GET','HEAD'].includes(metadata.testMethod.toUpperCase()) ? metadata.testMethod.toUpperCase() : 'GET';
        const probe = await this.executeRestFunction(user, id, testMethod, testPath, undefined, undefined, { responseMode: 'HEADERS', maxResponseBytes: 256, actionType: 'connection:test' });
        if ([401, 403].includes(Number(probe.status))) throw new Error(`REST endpoint rejected credentials (HTTP ${probe.status})`);
      } else {
        const secret = await this.prisma.connectionSecret.findUnique({ where: { connectionId: id } });
        const missing = this.requiredSecretFields(row.authType).filter((key) => !secret?.[key as keyof typeof secret]);
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
      this.prisma.connectionUsage.groupBy({ by: ['status'], where, _count: { _all: true }, _avg: { durationMs: true }, orderBy: { status: 'asc' } }),
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
    const consumed = await this.prisma.connectionOAuthState.updateMany({ where: { id: row.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
    if (consumed.count !== 1) throw new BadRequestException('OAuth state is invalid or already used');
    const cfg = this.oauthConfig(provider);
    if (!cfg.clientId || !cfg.clientSecret) throw new BadRequestException(`${provider} OAuth integration is not configured`);
    const body = new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, code, redirect_uri: cfg.callbackUrl, grant_type: 'authorization_code' });
    const response = await fetch(cfg.tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body, redirect: 'error', signal: AbortSignal.timeout(15000) });
    const payload = await this.readJson(response);
    if (!response.ok || typeof payload.access_token !== 'string') throw new BadRequestException('OAuth authorization failed');
    const expiresAt = typeof payload.expires_in === 'number' ? new Date(Date.now() + payload.expires_in * 1000) : null;
    const existing = await this.prisma.connection.findFirst({ where: { orgId: row.orgId, ownerId: row.userId, provider, authType: ConnectionAuthType.OAUTH2 } });
    const name = existing?.name ?? `${this.registry.get(provider).name} connection`;
    const metadata = { ...(existing?.metadata && typeof existing.metadata === 'object' ? existing.metadata as Record<string, unknown> : {}), oauthProvider: provider, oauthConnectedAt: new Date().toISOString() };
    const accessToken = this.crypto.encrypt(payload.access_token);
    const refreshToken = typeof payload.refresh_token === 'string' ? this.crypto.encrypt(payload.refresh_token) : undefined;
    const connection = await this.prisma.$transaction(async (tx) => {
      const connection = existing
        ? await tx.connection.update({ where: { id: existing.id }, data: { status: ConnectionStatus.ACTIVE, metadata: metadata as Prisma.InputJsonValue, expiresAt, scope: typeof payload.scope === 'string' ? payload.scope.slice(0, 4000) : existing.scope, errorCode: null, errorMessage: null, secret: { upsert: { create: { id: randomUUID(), connectionId: existing.id, ownerId: row.userId, accessToken, ...(refreshToken ? { refreshToken } : {}) }, update: { accessToken, ...(refreshToken ? { refreshToken } : {}) } } } } })
        : await tx.connection.create({ data: { id: randomUUID(), orgId: row.orgId, ownerId: row.userId, name, provider, authType: ConnectionAuthType.OAUTH2, visibility: ConnectionVisibility.PRIVATE, status: ConnectionStatus.ACTIVE, metadata: metadata as Prisma.InputJsonValue, expiresAt, scope: typeof payload.scope === 'string' ? payload.scope.slice(0, 4000) : null, secret: { create: { id: randomUUID(), ownerId: row.userId, accessToken, ...(refreshToken ? { refreshToken } : {}) } } } });
      const secret = await tx.connectionSecret.findUnique({ where: { connectionId: connection.id } });
      if (!secret) throw new BadRequestException('OAuth connection secret could not be stored');
      const latest = await tx.connectionSecretVersion.findFirst({ where: { connectionId: connection.id }, orderBy: { version: 'desc' }, select: { version: true } });
      const version = (latest?.version ?? 0) + 1;
      const snapshot = this.mergeSecretSnapshot(secret, {});
      await tx.connectionSecretVersion.create({ data: { id: randomUUID(), connectionId: connection.id, createdById: row.userId, version, ...snapshot, secretId: secret.id } });
      await tx.connectionSecret.update({ where: { connectionId: connection.id }, data: { keyVersion: version } });
      return connection;
    });
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
    const { row: connection, secrets } = await this.getSecretsForExecution(user, id);
    if (connection.provider !== 'rest') throw new BadRequestException('HTTP_REQUEST requires a REST connection');
    if (connection.status !== ConnectionStatus.ACTIVE) throw new ForbiddenException('Connection is not active');
    if (!connection.baseUrl) throw new BadRequestException('REST connection base URL is missing');
    const base = new URL(connection.baseUrl); if (base.protocol !== 'https:') throw new BadRequestException('REST connection must use HTTPS');
    const target = new URL(path, base); if (target.origin !== base.origin) throw new BadRequestException('HTTP_REQUEST target must remain on the connection origin');
    await this.assertSafeFunctionHost(target.hostname);
    const headers = new Headers();
    if (connection.authType === ConnectionAuthType.API_KEY && secrets.apiKey) headers.set('X-API-Key', secrets.apiKey);
    if (connection.authType === ConnectionAuthType.BEARER && secrets.bearerToken) headers.set('Authorization', `Bearer ${secrets.bearerToken}`);
    if (connection.authType === ConnectionAuthType.BASIC && secrets.username) headers.set('Authorization', `Basic ${Buffer.from(`${secrets.username}:${secrets.password ?? ''}`).toString('base64')}`);
    if (connection.authType === ConnectionAuthType.CUSTOM_HEADER && secrets.customHeaders) { const h=JSON.parse(secrets.customHeaders); if (h && typeof h==='object') for (const [k,v] of Object.entries(h)) if (!/^(authorization|cookie|proxy-authorization|host|content-length|transfer-encoding)$/i.test(k) && typeof v==='string') headers.set(k,v); }
    if (rawHeaders && typeof rawHeaders==='object') for (const [k,v] of Object.entries(rawHeaders as Record<string,unknown>)) if (!/^(authorization|cookie|proxy-authorization|host|content-length|transfer-encoding)$/i.test(k) && typeof v==='string') headers.set(k,v);
    let body: string|undefined; if (rawBody !== undefined && rawBody !== null) { body=typeof rawBody==='string'?rawBody:JSON.stringify(rawBody); if (!headers.has('content-type')) headers.set('content-type','application/json'); }
    const started=Date.now(); let status='FAILED'; const maxRetries=Math.min(Math.max(Number(options.retries ?? 0),0),3);
    const retryable = method === 'GET' || method === 'HEAD' || (Boolean(options.idempotencyKey) && ['PUT','PATCH','DELETE'].includes(method));
    if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey);
    try {
      let response: Response | null = null; let lastError: unknown = null;
      for (let attempt=0; attempt<=maxRetries; attempt++) {
        try {
          const pinned = await this.requestPinnedHttps(target, { method, headers, body, timeoutMs: 15000, maxBytes: Math.min(20000, Math.max(256, Number(options.maxResponseBytes ?? 20000))) });
          response = new Response(pinned.body, { status: pinned.status, headers: pinned.headers });
          if (response.ok || !retryable || ![408,429,500,502,503,504].includes(response.status) || attempt===maxRetries) break;
        }
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

  async getAccessTokenById(user: AccessTokenPayload, id: string): Promise<string | null> {
    const row = await this.findVisible(user, id);
    const full = await this.prisma.connection.findUnique({ where: { id }, include: { secret: true } });
    if (!full) return null;
    if (!row || row.authType !== ConnectionAuthType.OAUTH2 || row.status !== ConnectionStatus.ACTIVE) return null;
    const secret = full.secret;
    if (!secret?.accessToken) return null;
    const accessToken = this.crypto.decrypt(secret.accessToken);
    if (!full.expiresAt || full.expiresAt.getTime() > Date.now() + 60_000) return accessToken;
    if (!secret.refreshToken) return accessToken;
    return this.refreshOAuthToken(full.provider as OAuthProvider, id, this.crypto.decrypt(secret.refreshToken));
  }

  async getSecretsForExecution(user: AccessTokenPayload, id: string) {
    const row = await this.findVisible(user, id);
    if (row.status === ConnectionStatus.DISABLED) throw new ForbiddenException('Connection is disabled');
    if (row.status === ConnectionStatus.REAUTH_REQUIRED) throw new ForbiddenException('Connection requires re-authentication');
    const secret = await this.prisma.connectionSecret.findUnique({ where: { connectionId: id } });
    if (!secret) throw new BadRequestException('Connection credentials are missing');
    const out: DecryptedSecrets = {};
    for (const key of SECRET_FIELDS) if (secret[key]) out[key] = this.crypto.decrypt(secret[key]!);
    if (row.authType === ConnectionAuthType.OAUTH2) { const token = await this.getAccessTokenById(user, id); if (token) out.accessToken = token; }
    await this.prisma.connection.update({ where: { id }, data: { lastUsedAt: new Date() } });
    return { row, secrets: out };
  }

  private async refreshOAuthToken(provider: OAuthProvider, id: string, refreshToken: string) {
    const cfg = this.oauthConfig(provider);
    if (!cfg.clientId || !cfg.clientSecret) throw new BadRequestException('OAuth provider is not configured');
    const body = new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' });
    const response = await fetch(cfg.tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body, redirect: 'error', signal: AbortSignal.timeout(15000) });
    const payload = await this.readJson(response);
    if (!response.ok || typeof payload.access_token !== 'string') {
      await this.prisma.connection.update({ where: { id }, data: { status: ConnectionStatus.REAUTH_REQUIRED, errorCode: 'TOKEN_REFRESH_FAILED', errorMessage: 'OAuth token refresh failed' } }).catch(() => undefined);
      throw new ForbiddenException('Connection requires re-authentication');
    }
    const accessToken = this.crypto.encrypt(payload.access_token);
    const newRefreshToken = typeof payload.refresh_token === 'string' ? this.crypto.encrypt(payload.refresh_token) : undefined;
    const existingSecret = await this.prisma.connectionSecret.findUnique({ where: { connectionId: id } });
    const connectionOwner = existingSecret?.ownerId ?? (await this.prisma.connection.findUniqueOrThrow({ where: { id }, select: { ownerId: true } })).ownerId;
    const snapshot = this.mergeSecretSnapshot(existingSecret, { accessToken, ...(refreshToken ? { refreshToken } : {}) });
    await this.prisma.$transaction(async (tx) => {
      await tx.connection.update({ where: { id }, data: { expiresAt: typeof payload.expires_in === 'number' ? new Date(Date.now() + payload.expires_in * 1000) : null, status: ConnectionStatus.ACTIVE, errorCode: null, errorMessage: null } });
      const latest = await tx.connectionSecretVersion.findFirst({ where: { connectionId: id }, orderBy: { version: 'desc' }, select: { version: true } });
      const version = (latest?.version ?? 0) + 1;
      await tx.connectionSecret.upsert({ where: { connectionId: id }, create: { id: randomUUID(), connectionId: id, ownerId: connectionOwner, ...snapshot }, update: snapshot });
      const secret = await tx.connectionSecret.findUnique({ where: { connectionId: id }, select: { id: true } });
      await tx.connectionSecretVersion.create({ data: { id: randomUUID(), connectionId: id, createdById: connectionOwner, version, ...snapshot, ...(secret ? { secretId: secret.id } : {}) } });
      await tx.connectionSecret.update({ where: { connectionId: id }, data: { keyVersion: version } });
    });
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
    const response = await fetch(url, { headers: { authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(10000) });
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

  private isPrivateFunctionIp(host: string): boolean {
    const normalized = host.toLowerCase().replace(/^\[|\]$/g, '');
    if (isIP(normalized) === 4) {
      const p = normalized.split('.').map(Number);
      if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
      const n = (((p[0] * 256 + p[1]) * 256 + p[2]) * 256 + p[3]) >>> 0;
      const inRange = (a: number, b: number) => n >= a && n <= b;
      return inRange(0x00000000, 0x00ffffff) || inRange(0x0a000000, 0x0affffff) || inRange(0x64400000, 0x647fffff) || inRange(0x7f000000, 0x7fffffff) || inRange(0xa9fe0000, 0xa9feffff) || inRange(0xc0000000, 0xc00000ff) || inRange(0xc0000200, 0xc00002ff) || inRange(0xc0a80000, 0xc0a8ffff) || inRange(0xc6120000, 0xc613ffff) || inRange(0xc6336400, 0xc63364ff) || inRange(0xcb007100, 0xcb0071ff) || inRange(0xe0000000, 0xffffffff);
    }
    if (isIP(normalized) !== 6) return true;
    const value = this.ipv6ToBigInt(normalized);
    if (value === null) return true;
    const range = (prefix: string, bits: number) => {
      const start = this.ipv6ToBigInt(prefix);
      if (start === null) return false;
      const size = 1n << BigInt(128 - bits);
      return value >= start && value < start + size;
    };
    if (range('::', 128) || range('::1', 128) || range('fc00::', 7) || range('fe80::', 10) || range('ff00::', 8) || range('100::', 64) || range('2001:db8::', 32) || range('2001:2::', 48) || range('2001:10::', 28)) return true;
    if (range('::ffff:0:0', 96)) {
      const mapped = normalized.split(':').slice(-2).join('.');
      const tail = normalized.match(/([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
      if (tail) {
        const a = parseInt(tail[1], 16), b = parseInt(tail[2], 16);
        const ipv4 = `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`;
        return this.isPrivateFunctionIp(ipv4);
      }
      void mapped;
      return true;
    }
    return false;
  }

  private ipv6ToBigInt(input: string): bigint | null {
    let value = input.toLowerCase();
    if (value.includes('%')) value = value.split('%')[0];
    if (!value.includes('::') && value.split(':').length !== 8) return null;
    const parts = value.split('::');
    if (parts.length > 2) return null;
    const left = parts[0] ? parts[0].split(':') : [];
    const right = parts[1] ? parts[1].split(':') : [];
    if (left.some((x) => !/^[0-9a-f]{1,4}$/.test(x)) || right.some((x) => !/^[0-9a-f]{1,4}$/.test(x))) return null;
    const missing = 8 - left.length - right.length;
    if (missing < 0 || (parts.length === 1 && missing !== 0)) return null;
    const all = [...left, ...Array(missing).fill('0'), ...right];
    if (all.length !== 8) return null;
    return all.reduce((acc, part) => (acc << 16n) + BigInt(parseInt(part, 16)), 0n);
  }

  private async requestPinnedHttps(url: URL, init: { method: string; headers: Headers; body?: string; timeoutMs?: number; maxBytes?: number }) {
    const addresses = await lookup(url.hostname, { all: true, verbatim: true });
    const publicAddresses = addresses.filter((entry) => !this.isPrivateFunctionIp(entry.address));
    if (!publicAddresses.length) throw new BadRequestException('HTTP_REQUEST hostname has no public egress address');
    const selected = publicAddresses[0].address;
    return new Promise<{ status: number; headers: Record<string, string>; body: string }>((resolve, reject) => {
      const req = httpsRequest({
        protocol: 'https:', hostname: url.hostname, port: url.port || 443, path: `${url.pathname}${url.search}`,
        method: init.method, headers: Object.fromEntries(init.headers.entries()),
        lookup: (_hostname, _options, cb) => cb(null, selected, isIP(selected)),
        servername: url.hostname, rejectUnauthorized: true,
      }, (res) => {
        const chunks: Buffer[] = []; let total = 0; const maxBytes = init.maxBytes ?? 20000;
        res.on('data', (chunk: Buffer) => { total += chunk.length; if (total <= maxBytes) chunks.push(chunk); else { req.destroy(new BadRequestException(`HTTP response exceeds the ${maxBytes} byte limit`)); } });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: Object.fromEntries(Object.entries(res.headers).flatMap(([k,v]) => [[k, Array.isArray(v) ? v.join(', ') : String(v ?? '')]])), body: Buffer.concat(chunks).toString('utf8') }));
      });
      req.setTimeout(init.timeoutMs ?? 15000, () => req.destroy(new Error('HTTP request timed out')));
      req.on('error', reject);
      if (init.body !== undefined) req.write(init.body);
      req.end();
    });
  }

  private mergeSecretSnapshot(existing: Record<string, any> | null, encrypted: Record<string, string>) {
    const snapshot: Record<string, string> = {};
    for (const key of SECRET_FIELDS) {
      const value = encrypted[key] ?? existing?.[key];
      if (value) snapshot[key] = String(value);
    }
    return snapshot;
  }

  private validateRestBaseUrl(value: string) {
    let url: URL;
    try { url = new URL(value.trim()); } catch { throw new BadRequestException('REST base URL is invalid'); }
    if (url.protocol !== 'https:') throw new BadRequestException('REST base URL must use HTTPS');
    if (!url.hostname || url.username || url.password) throw new BadRequestException('REST base URL must not contain credentials');
    if (url.hash) throw new BadRequestException('REST base URL must not contain a fragment');
  }

  private validateSecretInput(authType: ConnectionAuthType, input?: SecretInput) {
    if (!input || Object.keys(input).length === 0) return;
    if (authType === ConnectionAuthType.OAUTH2) throw new BadRequestException('OAuth credentials must be managed through the provider authorization flow');
    const allowed: Record<string, string[]> = {
      [ConnectionAuthType.API_KEY]: ['apiKey'],
      [ConnectionAuthType.BEARER]: ['bearerToken'],
      [ConnectionAuthType.BASIC]: ['username', 'password'],
      [ConnectionAuthType.CUSTOM_HEADER]: ['customHeaders'],
      [ConnectionAuthType.NONE]: [],
    };
    const keys = Object.keys(input);
    if (keys.some((key) => !allowed[authType]?.includes(key))) throw new BadRequestException('Credential fields do not match the connection authentication type');
    if (authType === ConnectionAuthType.CUSTOM_HEADER && input.customHeaders) {
      let parsed: unknown;
      try { parsed = JSON.parse(input.customHeaders); } catch { throw new BadRequestException('Custom headers must be valid JSON'); }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new BadRequestException('Custom headers must be a JSON object');
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(key) || !['string','number','boolean'].includes(typeof value)) throw new BadRequestException('Invalid custom header');
        if (/^(authorization|cookie|proxy-authorization|host|content-length)$/i.test(key)) throw new BadRequestException('This custom header is not allowed');
      }
    }
  }

  private encryptSecrets(input: SecretInput) { const out: Record<string, string> = {}; for (const key of SECRET_FIELDS) if (input[key]) out[key] = this.crypto.encrypt(String(input[key])); return out; }
  private async audit(user: AccessTokenPayload, action: string, resourceId: string, metadata: Record<string, unknown>) { await this.prisma.auditLog.create({ data: { id: randomUUID(), orgId: user.org_id, actorId: user.sub, action, resourceType: 'CONNECTION', resourceId, metadata: metadata as Prisma.InputJsonValue } }).catch(() => undefined); }
}
