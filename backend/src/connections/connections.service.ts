import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { ConnectionAuthType, ConnectionShareRole, ConnectionStatus, ConnectionType, ConnectionVisibility, Prisma } from '@prisma/client';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectionCryptoService } from './connection-crypto.service';
import { ConnectionProviderRegistry, type ConnectionProviderDefinition, type ConnectionScopeDefinition } from './provider-registry.service';
import { ConnectionProviderAdapterService } from './connection-provider-adapter.service';
import { URL } from 'node:url';
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { AuthService } from '../auth.service';
import { buildOAuthBrowserUrl, normalizeOAuthReturnPath, oauthFailurePreservesActive, resolveOAuthFrontendOrigin, safeOAuthErrorCode, safeOrigin } from './oauth-flow';
import { buildConnectionCapabilitySummary, googleDriveActivationError, googleDriveScopeGranted, mapGoogleDriveApiError, providerBrowseErrorCode } from './connection-browse-logic';

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const SECRET_FIELDS = ['accessToken', 'refreshToken', 'apiKey', 'bearerToken', 'username', 'password', 'customHeaders'] as const;
type SecretKey = (typeof SECRET_FIELDS)[number];
type SecretInput = Partial<Record<SecretKey, string>>;
type OAuthProvider = string;

type DecryptedSecrets = Record<string, string>;
type ResolvedProviderDefinition = ConnectionProviderDefinition & { oauthClientId?: string; oauthClientSecret?: string };

@Injectable()
export class ConnectionsService {
  private readonly logger = new Logger(ConnectionsService.name);
  constructor(private readonly prisma: PrismaService, private readonly crypto: ConnectionCryptoService, private readonly config: ConfigService, private readonly registry: ConnectionProviderRegistry, private readonly providerAdapter: ConnectionProviderAdapterService, private readonly auth: AuthService) {}

  private oauthLog(event: string, fields: Record<string, string | number | null | undefined>) {
    const detail = Object.entries(fields)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => `${key}=${String(value).replace(/[\r\n]/g, ' ').slice(0, 180)}`)
      .join(' ');
    this.logger.log(`[OAuth] ${event}${detail ? ` ${detail}` : ''}`);
  }

  async providers(user?: AccessTokenPayload) {
    const configs = user ? await this.prisma.connectionProviderConfig.findMany({ where: { orgId: user.org_id } }) : [];
    const byProvider = new Map(configs.map((row) => [row.providerKey, row]));
    return this.registry.list().map((provider) => {
      const cfg = byProvider.get(provider.key);
      const envCfg = this.oauthConfigFromEnv(provider.key, provider);
      return {
        ...provider,
        configured: !provider.oauth || Boolean((cfg?.enabled !== false && cfg?.clientId && cfg?.clientSecret) || (!cfg && envCfg.clientId && envCfg.clientSecret)),
        providerConfigured: !!cfg && cfg.enabled && !!cfg.clientId && !!cfg.clientSecret,
        providerEnabled: cfg?.enabled ?? true,
      };
    });
  }

  async adminProviderConfigs(user: AccessTokenPayload) {
    this.assertAdmin(user);
    const rows = await this.prisma.connectionProviderConfig.findMany({ where: { orgId: user.org_id }, orderBy: { providerKey: 'asc' } });
    const byProvider = new Map(rows.map((row) => [row.providerKey, row]));
    return this.registry.list().filter((p) => p.oauth).map((provider) => {
      const row = byProvider.get(provider.key);
      const envCfg = this.oauthConfigFromEnv(provider.key, provider);
      return {
        provider: provider.key,
        name: provider.name,
        category: provider.category,
        enabled: row?.enabled ?? true,
        configured: !!row && !!row.clientId && !!row.clientSecret && row.enabled || (!row && !!envCfg.clientId && !!envCfg.clientSecret),
        source: row ? 'DATABASE' : (envCfg.clientId && envCfg.clientSecret ? 'ENVIRONMENT' : 'NONE'),
        clientId: row?.clientId ?? envCfg.clientId ?? '',
        hasClientSecret: !!row?.clientSecret || !!envCfg.clientSecret,
        tenantId: row?.tenantId ?? '',
        callbackUrl: row?.callbackUrl ?? envCfg.callbackUrl,
        authUrl: row?.authUrl ?? provider.oauthAuthUrl,
        tokenUrl: row?.tokenUrl ?? provider.oauthTokenUrl,
        revokeUrl: row?.revokeUrl ?? provider.oauthRevokeUrl ?? '',
        scopes: Array.isArray(row?.scopes) ? row?.scopes : provider.defaultScopes,
        lastTestedAt: row?.lastTestedAt ?? null,
        lastTestOk: row?.lastTestOk ?? null,
        lastTestMessage: row?.lastTestMessage ?? null,
      };
    });
  }

  async saveAdminProviderConfig(user: AccessTokenPayload, providerKey: string, input: any) {
    this.assertAdmin(user);
    const definition = this.registry.get(providerKey);
    if (!definition.oauth) throw new BadRequestException('Only OAuth providers can be configured here');
    const clientId = String(input?.clientId ?? '').trim();
    const clientSecret = String(input?.clientSecret ?? '').trim();
    const tenantId = String(input?.tenantId ?? '').trim();
    const callbackUrl = String(input?.callbackUrl ?? '').trim();
    const authUrl = String(input?.authUrl ?? definition.oauthAuthUrl ?? '').trim();
    const tokenUrl = String(input?.tokenUrl ?? definition.oauthTokenUrl ?? '').trim();
    const revokeUrl = String(input?.revokeUrl ?? definition.oauthRevokeUrl ?? '').trim();
    const enabled = input?.enabled !== false;
    const requestedScopes = Array.isArray(input?.scopes) ? input.scopes.map((v: unknown) => String(v).trim()).filter(Boolean) : definition.defaultScopes;
    const allowedScopes = new Set(definition.scopes.map((item) => item.value));
    const invalidScopes = requestedScopes.filter((value: string) => !allowedScopes.has(value));
    if (invalidScopes.length) throw new BadRequestException(`Unsupported OAuth scopes: ${invalidScopes.slice(0, 10).join(', ')}`);
    if (!clientId) throw new BadRequestException('Client ID is required');
    if (!clientSecret && !(await this.prisma.connectionProviderConfig.findUnique({ where: { orgId_providerKey: { orgId: user.org_id, providerKey } }, select: { clientSecret: true } }))?.clientSecret && !this.oauthConfigFromEnv(providerKey, definition).clientSecret) throw new BadRequestException('Client Secret is required');
    if (!/^https:\/\//i.test(authUrl) || !/^https:\/\//i.test(tokenUrl)) throw new BadRequestException('OAuth URLs must use HTTPS');
    if (!callbackUrl || !/^https:\/\//i.test(callbackUrl)) throw new BadRequestException('Callback URL must use HTTPS');
    const existing = await this.prisma.connectionProviderConfig.findUnique({ where: { orgId_providerKey: { orgId: user.org_id, providerKey } } });
    const data: any = { orgId: user.org_id, providerKey, enabled, clientId, tenantId: tenantId || null, callbackUrl, authUrl, tokenUrl, revokeUrl: revokeUrl || null, scopes: requestedScopes as Prisma.InputJsonValue, updatedById: user.sub };
    if (clientSecret) data.clientSecret = this.crypto.encrypt(clientSecret);
    const row = existing ? await this.prisma.connectionProviderConfig.update({ where: { id: existing.id }, data }) : await this.prisma.connectionProviderConfig.create({ data: { id: randomUUID(), ...data, createdById: user.sub } });
    await this.audit(user, 'connection.provider_config.updated', row.id, { provider: providerKey, source: 'DATABASE', enabled });
    return this.serializeProviderConfig(row, definition);
  }

  async testAdminProviderConfig(user: AccessTokenPayload, providerKey: string) {
    this.assertAdmin(user);
    const definition = this.registry.get(providerKey);
    if (!definition.oauth) throw new BadRequestException('Only OAuth providers can be tested here');
    const configuredRow = await this.prisma.connectionProviderConfig.findUnique({ where: { orgId_providerKey: { orgId: user.org_id, providerKey } } });
    if (configuredRow?.enabled === false) {
      const message = 'Provider is disabled by the organization administrator';
      await this.prisma.connectionProviderConfig.update({ where: { id: configuredRow.id }, data: { lastTestedAt: new Date(), lastTestOk: false, lastTestMessage: message } });
      return { provider: providerKey, ok: false, message, callbackUrl: configuredRow.callbackUrl ?? '', authUrl: configuredRow.authUrl ?? definition.oauthAuthUrl, tokenUrl: configuredRow.tokenUrl ?? definition.oauthTokenUrl };
    }
    const cfg = await this.oauthConfig(providerKey, definition, user.org_id);
    let ok = true;
    let message = 'OAuth configuration is valid';
    try {
      const probe = new URL(cfg.authBase);
      if (probe.protocol !== 'https:') throw new Error('Authorization URL must use HTTPS');
      if (!cfg.clientId || !cfg.clientSecret) throw new Error('Client ID and Client Secret are required');
      if (!cfg.callbackUrl || !cfg.callbackUrl.startsWith('https://')) throw new Error('Callback URL must use HTTPS');
      const url = new URL(cfg.authBase);
      url.searchParams.set('client_id', cfg.clientId);
      url.searchParams.set('redirect_uri', cfg.callbackUrl);
      url.searchParams.set('response_type', 'code');
      if (definition.defaultScopes.length) url.searchParams.set('scope', definition.defaultScopes.join(' '));
      const response = await fetch(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(8000) });
      if (!(response.status >= 200 && response.status < 400)) throw new Error(`Authorization endpoint returned HTTP ${response.status}`);
    } catch (error) { ok = false; message = error instanceof Error ? error.message.slice(0, 500) : 'OAuth configuration test failed'; }
    const row = await this.prisma.connectionProviderConfig.findUnique({ where: { orgId_providerKey: { orgId: user.org_id, providerKey } } });
    if (row) await this.prisma.connectionProviderConfig.update({ where: { id: row.id }, data: { lastTestedAt: new Date(), lastTestOk: ok, lastTestMessage: message } });
    return { provider: providerKey, ok, message, callbackUrl: cfg.callbackUrl, authUrl: cfg.authBase, tokenUrl: cfg.tokenUrl };
  }

  private assertAdmin(user: AccessTokenPayload) {
    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') throw new ForbiddenException('Admin access required');
  }

  private serializeProviderConfig(row: any, definition: ConnectionProviderDefinition) {
    return { provider: row.providerKey, name: definition.name, enabled: row.enabled, configured: !!row.clientId && !!row.clientSecret && row.enabled, clientId: row.clientId ?? '', hasClientSecret: !!row.clientSecret, tenantId: row.tenantId ?? '', callbackUrl: row.callbackUrl ?? '', authUrl: row.authUrl ?? definition.oauthAuthUrl, tokenUrl: row.tokenUrl ?? definition.oauthTokenUrl, revokeUrl: row.revokeUrl ?? definition.oauthRevokeUrl ?? '', scopes: Array.isArray(row.scopes) ? row.scopes : definition.defaultScopes, lastTestedAt: row.lastTestedAt ?? null, lastTestOk: row.lastTestOk ?? null, lastTestMessage: row.lastTestMessage ?? null };
  }

  templates() {
    return this.registry.list().map((provider) => ({
      key: provider.key,
      name: provider.name,
      provider: provider.key,
      authType: provider.authTypes[0],
      baseUrl: provider.baseUrl ?? '',
      scopes: provider.scopes,
      defaultScopes: provider.defaultScopes,
      metadata: { category: provider.category },
      description: `${provider.name} connection`,
    }));
  }

  async customServices(user: AccessTokenPayload) {
    const rows = await this.prisma.connectionCustomService.findMany({ where: { orgId: user.org_id, status: 'ACTIVE', OR: [{ ownerId: user.sub }, { ownerId: { not: user.sub } }] }, orderBy: { name: 'asc' } });
    return rows.map((row) => this.serializeCustomService(row));
  }

  async createCustomService(user: AccessTokenPayload, input: any) {
    this.assertAdmin(user);
    const name = String(input?.name ?? '').trim();
    const linkName = String(input?.linkName ?? input?.key ?? '').trim().toLowerCase();
    const authType = String(input?.authType ?? 'API_KEY') as ConnectionAuthType;
    if (!name || name.length > 120) throw new BadRequestException('Service name is required');
    if (!/^[a-z][a-z0-9_-]{2,63}$/.test(linkName)) throw new BadRequestException('Service Link Name must start with a letter and contain only lowercase letters, numbers, hyphens or underscores');
    if (![ConnectionAuthType.OAUTH2, ConnectionAuthType.API_KEY, ConnectionAuthType.BEARER, ConnectionAuthType.BASIC, ConnectionAuthType.CUSTOM_HEADER, ConnectionAuthType.NONE].includes(authType)) throw new BadRequestException('Unsupported authentication type');
    if (authType === ConnectionAuthType.API_KEY && !String(input?.parameterKey ?? '').trim()) throw new BadRequestException('Parameter Key is required for API Key authentication');
    const baseUrl = input?.baseUrl ? String(input.baseUrl).trim() : null;
    if (baseUrl && !/^https:\/\//i.test(baseUrl)) throw new BadRequestException('Base URL must use HTTPS');
    const accountUrl = input?.accountUrl ? String(input.accountUrl).trim() : '';
    if (accountUrl && !/^https:\/\//i.test(accountUrl)) throw new BadRequestException('Account URL must use HTTPS');
    const scopeDefinitions = Array.isArray(input?.scopes) ? input.scopes.filter((x: any) => x && typeof x.value === 'string').slice(0, 200).map((x: any) => ({ value: String(x.value).slice(0, 500), label: String(x.label ?? x.value).slice(0, 160), description: String(x.description ?? '').slice(0, 500), group: String(x.group ?? 'General').slice(0, 100), risk: ['STANDARD','SENSITIVE','RESTRICTED'].includes(x.risk) ? x.risk : 'STANDARD' })) : [];
    const defaultScopes = (Array.isArray(input?.defaultScopes) ? input.defaultScopes : []).map(String).filter((value: string) => scopeDefinitions.some((x: any) => x.value === value)).slice(0, 100);
    let oauthClientId: string | null = null;
    let oauthClientSecret: string | null = null;
    if (authType === ConnectionAuthType.OAUTH2) {
      const authUrl = String(input?.oauthAuthUrl ?? '').trim();
      const tokenUrl = String(input?.oauthTokenUrl ?? '').trim();
      if (!/^https:\/\//i.test(authUrl) || !/^https:\/\//i.test(tokenUrl)) throw new BadRequestException('OAuth Authorization URL and Token URL must use HTTPS');
      if (!String(input?.oauthClientId ?? '').trim() || !String(input?.oauthClientSecret ?? '').trim()) throw new BadRequestException('OAuth Client ID and Client Secret are required for a custom OAuth service');
      oauthClientId = this.crypto.encrypt(String(input.oauthClientId).trim());
      oauthClientSecret = this.crypto.encrypt(String(input.oauthClientSecret).trim());
    }
    try {
      const row = await this.prisma.connectionCustomService.create({ data: { id: randomUUID(), orgId: user.org_id, ownerId: user.sub, name, linkName, authType, parameterKey: input?.parameterKey ? String(input.parameterKey).slice(0, 120) : null, parameterLabel: input?.parameterLabel ? String(input.parameterLabel).slice(0, 160) : null, parameterType: input?.parameterType ? String(input.parameterType).slice(0, 40) : null, baseUrl, oauthAuthUrl: authType === ConnectionAuthType.OAUTH2 ? String(input.oauthAuthUrl).trim() : null, oauthTokenUrl: authType === ConnectionAuthType.OAUTH2 ? String(input.oauthTokenUrl).trim() : null, oauthRevokeUrl: authType === ConnectionAuthType.OAUTH2 && input?.oauthRevokeUrl ? String(input.oauthRevokeUrl).trim() : null, oauthClientId, oauthClientSecret, scopes: scopeDefinitions as Prisma.InputJsonValue, defaultScopes: defaultScopes as Prisma.InputJsonValue, metadata: ({ ...(input?.metadata ?? {}), ...(accountUrl ? { accountUrl } : {}) }) as Prisma.InputJsonValue } });
      await this.audit(user, 'connection.custom_service.created', row.id, { name: row.name, linkName: row.linkName, authType: row.authType });
      return this.serializeCustomService(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('A custom service with this Link Name already exists');
      throw error;
    }
  }

  async deleteCustomService(user: AccessTokenPayload, id: string) {
    this.assertAdmin(user);
    const row = await this.prisma.connectionCustomService.findFirst({ where: { id, orgId: user.org_id, ownerId: user.sub } });
    if (!row) throw new NotFoundException('Custom service not found');
    const connectionCount = await this.prisma.connection.count({ where: { orgId: user.org_id, provider: `custom:${id}` } });
    if (connectionCount) throw new ConflictException('Delete the connections using this custom service before deleting the service');
    await this.prisma.connectionCustomService.delete({ where: { id } });
    await this.audit(user, 'connection.custom_service.deleted', id, { name: row.name });
    return { id, deleted: true };
  }

  private serializeCustomService(row: any) {
    const scopes = Array.isArray(row.scopes) ? row.scopes : [];
    const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata as Record<string, unknown> : {};
    return { id: row.id, name: row.name, linkName: row.linkName, provider: `custom:${row.id}`, authType: row.authType, parameterKey: row.parameterKey, parameterLabel: row.parameterLabel, parameterType: row.parameterType, baseUrl: row.baseUrl, oauth: row.authType === ConnectionAuthType.OAUTH2, configured: row.authType !== ConnectionAuthType.OAUTH2 || Boolean(row.oauthClientId && row.oauthClientSecret), oauthCallbackUrl: row.authType === ConnectionAuthType.OAUTH2 ? `${this.config.get<string>('PUBLIC_API_URL') ?? 'http://localhost:3001'}/connections/oauth/custom:${row.id}/callback` : null, accountUrl: typeof metadata.accountUrl === 'string' ? metadata.accountUrl : null, scopes, defaultScopes: Array.isArray(row.defaultScopes) ? row.defaultScopes : [], scopeGroups: [...new Set(scopes.map((x: any) => x.group ?? 'General'))], createdAt: row.createdAt, updatedAt: row.updatedAt };
  }

  private async resolveProviderDefinition(provider: string, orgId?: string): Promise<ResolvedProviderDefinition> {
    if (!provider.startsWith('custom:')) return this.registry.get(provider);
    const id = provider.slice('custom:'.length);
    if (!orgId) throw new BadRequestException('Custom service organization is required');
    const row = await this.prisma.connectionCustomService.findFirst({ where: { id, orgId, status: 'ACTIVE' } });
    if (!row) throw new NotFoundException('Custom service not found');
    const scopes = Array.isArray(row.scopes) ? row.scopes as ConnectionScopeDefinition[] : [];
    const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata as Record<string, unknown> : {};
    const accountUrl = typeof metadata.accountUrl === 'string' && /^https:\/\//i.test(metadata.accountUrl) ? metadata.accountUrl : undefined;
    return { key: provider, name: row.name, category: 'Other', authTypes: [row.authType], oauth: row.authType === ConnectionAuthType.OAUTH2, capabilities: row.baseUrl ? ['request', ...(row.authType === ConnectionAuthType.OAUTH2 ? ['oauth'] : [])] : (row.authType === ConnectionAuthType.OAUTH2 ? ['oauth'] : []), baseUrl: row.baseUrl ?? undefined, probeUrl: accountUrl, scopes, defaultScopes: Array.isArray(row.defaultScopes) ? row.defaultScopes.map(String) : [], scopeGroups: [...new Set(scopes.map((x: any) => x.group ?? 'General'))], credentialHeader: row.parameterType === 'HEADER' ? (row.parameterKey ?? 'X-API-Key') : undefined, credentialPrefix: '', credentialQueryKey: row.parameterType === 'QUERY' ? (row.parameterKey ?? undefined) : undefined, oauthAuthUrl: row.oauthAuthUrl ?? undefined, oauthTokenUrl: row.oauthTokenUrl ?? undefined, oauthRevokeUrl: row.oauthRevokeUrl ?? undefined, oauthClientId: row.oauthClientId ? this.crypto.decrypt(row.oauthClientId) : undefined, oauthClientSecret: row.oauthClientSecret ? this.crypto.decrypt(row.oauthClientSecret) : undefined };
  }

  private visibleWhere(user: AccessTokenPayload, id?: string): Prisma.ConnectionWhereInput {
    return { ...(id ? { id } : {}), orgId: user.org_id, OR: [{ ownerId: user.sub }, { visibility: ConnectionVisibility.ORGANIZATION }, { shares: { some: { userId: user.sub } } }] };
  }

  private async findVisible(user: AccessTokenPayload, id: string) {
    const row = await this.prisma.connection.findFirst({ where: this.visibleWhere(user, id) });
    if (!row) throw new NotFoundException('Connection not found');
    return row;
  }

  private async assertProvider(provider: string, authType: ConnectionAuthType, orgId?: string) {
    if (provider.startsWith('custom:')) {
      const definition = await this.resolveProviderDefinition(provider, orgId);
      if (!definition.authTypes.includes(String(authType))) throw new BadRequestException('Unsupported authentication type for custom service');
      return;
    }
    if (!this.registry.supports(provider, String(authType))) throw new BadRequestException('Unsupported provider/authentication type');
  }

  private async uniqueLinkName(orgId: string, seed: string, excludeId?: string) {
    const base = String(seed ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'connection';
    for (let i = 0; i < 100; i++) {
      const candidate = i === 0 ? base : `${base}_${i + 1}`;
      const found = await this.prisma.connection.findFirst({ where: { orgId, linkName: candidate, ...(excludeId ? { NOT: { id: excludeId } } : {}) }, select: { id: true } });
      if (!found) return candidate;
    }
    throw new ConflictException('Unable to allocate a unique connection link name');
  }

  private async findExecutionVisible(user: AccessTokenPayload, id: string, workflowId?: string) {
    if (!workflowId) return this.findVisible(user, id);
    const workflow = await this.prisma.workflow.findFirst({ where: { id: workflowId, orgId: user.org_id }, select: { ownerId: true } });
    if (!workflow) throw new NotFoundException('Workflow not found');
    const row = await this.prisma.connection.findFirst({ where: { id, orgId: user.org_id, OR: [
      { ownerId: workflow.ownerId },
      { ownerId: user.sub },
      { visibility: ConnectionVisibility.ORGANIZATION },
      { shares: { some: { userId: workflow.ownerId } } },
      { shares: { some: { userId: user.sub } } },
    ] } });
    if (!row) throw new NotFoundException('Workflow connection not found');
    return row;
  }

  private serialize(row: any, userId?: string) {
    const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata as Record<string, unknown> : {};
    const capabilities = buildConnectionCapabilitySummary({ provider: row.provider, authType: row.authType, scope: row.scope, errorCode: row.errorCode });
    return { canManage: userId ? row.ownerId === userId : false, id: row.id, orgId: row.orgId, ownerId: row.ownerId, name: row.name, linkName: row.linkName, connectionType: row.connectionType, provider: row.provider, authType: row.authType, visibility: row.visibility, status: row.status, baseUrl: row.baseUrl, metadata, authorizedAccount: metadata.authorizedAccount ?? null, expiresAt: row.expiresAt, scope: row.scope, capabilities, lastTestedAt: row.lastTestedAt, lastUsedAt: row.lastUsedAt, errorCode: row.errorCode, errorMessage: row.errorMessage, createdAt: row.createdAt, updatedAt: row.updatedAt };
  }

  async list(user: AccessTokenPayload, query?: { provider?: string; status?: string; search?: string }) {
    const rows = await this.prisma.connection.findMany({ where: { ...this.visibleWhere(user), ...(query?.provider ? { provider: query.provider } : {}), ...(query?.status ? { status: query.status as ConnectionStatus } : {}), ...(query?.search ? { name: { contains: query.search } } : {}) }, orderBy: { updatedAt: 'desc' } });
    return rows.map((row) => this.serialize(row, user.sub));
  }

  async get(user: AccessTokenPayload, id: string) { return this.serialize(await this.findVisible(user, id), user.sub); }

  async references(user: AccessTokenPayload, id: string) {
    const connection = await this.findVisible(user, id);
    const references: Array<{
      type: 'WORKFLOW_STEP' | 'WORKFLOW_VERSION' | 'WORKFLOW_FUNCTION';
      id: string;
      name: string;
      workflowId?: string;
      workflowName?: string;
      version?: number;
      path?: string;
      status?: string;
    }> = [];

    const collect = (value: unknown, path: string, target: (ref: { path: string }) => void) => {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) { value.forEach((item, index) => collect(item, `${path}[${index}]`, target)); return; }
      const record = value as Record<string, unknown>;
      if (record.connectionId === id) target({ path: `${path}.connectionId` });
      for (const [key, child] of Object.entries(record)) collect(child, `${path}.${key}`, target);
    };

    const steps = await this.prisma.workflowStep.findMany({
      where: { workflow: { orgId: user.org_id } },
      select: { id: true, config: true, kind: true, workflow: { select: { id: true, name: true, status: true } } },
    });
    for (const step of steps) {
      collect(step.config, 'config', ({ path }) => references.push({ type: 'WORKFLOW_STEP', id: step.id, name: step.workflow.name, workflowId: step.workflow.id, workflowName: step.workflow.name, path, status: step.workflow.status }));
    }

    const versions = await this.prisma.workflowVersion.findMany({
      where: { workflow: { orgId: user.org_id } },
      select: { id: true, version: true, snapshot: true, status: true, workflow: { select: { id: true, name: true, status: true } } },
    });
    for (const version of versions) {
      collect(version.snapshot, 'snapshot', ({ path }) => references.push({ type: 'WORKFLOW_VERSION', id: version.id, name: version.workflow.name, workflowId: version.workflow.id, workflowName: version.workflow.name, version: version.version, path, status: version.status }));
    }

    const functionVersions = await this.prisma.workflowFunctionVersion.findMany({
      where: { orgId: user.org_id },
      select: { id: true, version: true, definition: true, status: true, function: { select: { id: true, name: true, key: true } } },
    });
    for (const version of functionVersions) {
      collect(version.definition, 'definition', ({ path }) => references.push({ type: 'WORKFLOW_FUNCTION', id: version.function.id, name: version.function.name, version: version.version, path, status: version.status }));
    }

    const unique = new Map<string, typeof references[number]>();
    for (const reference of references) unique.set(`${reference.type}:${reference.id}:${reference.path ?? ''}`, reference);
    return { connection: this.serialize(connection, user.sub), count: unique.size, references: [...unique.values()] };
  }

  private async assertNotReferenced(user: AccessTokenPayload, id: string) {
    const result = await this.references(user, id);
    if (result.count) {
      const first = result.references[0];
      throw new ConflictException({
        code: 'CONNECTION_IN_USE',
        message: 'Connection is referenced by a workflow or workflow function and cannot be deleted.',
        connectionId: id,
        referenceCount: result.count,
        firstReference: first,
      });
    }
  }

  async create(user: AccessTokenPayload, input: { name: string; provider: string; authType: ConnectionAuthType; visibility?: ConnectionVisibility; baseUrl?: string; scope?: string | string[]; metadata?: Record<string, unknown>; secrets?: SecretInput }) {
    const name = String(input.name ?? '').trim();
    if (!name || name.length > 120) throw new BadRequestException('Connection name is required');
    await this.assertProvider(input.provider, input.authType, user.org_id);
    const providerDefinition = await this.resolveProviderDefinition(input.provider, user.org_id);
    this.validateSecretInput(input.authType, input.secrets ?? {});
    const baseUrl = input.baseUrl?.trim() || providerDefinition.baseUrl || undefined;
    if (baseUrl && !/^https:\/\//i.test(baseUrl)) throw new BadRequestException('Connection base URL must use HTTPS');
    if (input.authType === ConnectionAuthType.OAUTH2 && !providerDefinition.oauth) throw new BadRequestException('OAuth is not supported for this service');
    if (input.authType === ConnectionAuthType.OAUTH2 && input.secrets && Object.keys(input.secrets).length) throw new BadRequestException('OAuth credentials must be connected through the provider authorization flow');
    const requestedScopes = Array.isArray(input.scope) ? input.scope : typeof input.scope === 'string' ? input.scope.split(/\s+/).filter(Boolean) : providerDefinition.defaultScopes;
    const scopeValue = requestedScopes.slice(0, 100).join(' ').slice(0, 4000) || null;
    const secretData = this.encryptSecrets(input.secrets ?? {});
    const initialStatus = input.authType === ConnectionAuthType.OAUTH2 ? ConnectionStatus.PENDING_AUTH : ConnectionStatus.ACTIVE;
    const requestedType = String((input as any).connectionType ?? ConnectionType.USER).toUpperCase();
    const connectionType = Object.values(ConnectionType).includes(requestedType as ConnectionType) ? requestedType as ConnectionType : ConnectionType.USER;
    if (connectionType !== ConnectionType.USER && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') throw new ForbiddenException('Only organization administrators can create system or admin connections');
    const linkName = await this.uniqueLinkName(user.org_id, String((input as any).linkName ?? `${input.provider}_${name}`));
    const row = await this.prisma.connection.create({ data: { id: randomUUID(), orgId: user.org_id, ownerId: user.sub, name, linkName, connectionType, provider: input.provider, authType: input.authType, visibility: connectionType === ConnectionType.USER ? (input.visibility ?? ConnectionVisibility.PRIVATE) : ConnectionVisibility.ORGANIZATION, status: initialStatus, baseUrl: baseUrl || null, scope: scopeValue, metadata: (input.metadata ?? {}) as Prisma.InputJsonValue, ...(Object.keys(secretData).length ? { secret: { create: { id: randomUUID(), ownerId: user.sub, ...secretData } } } : {}) } });
    if (Object.keys(secretData).length) await this.createSecretVersion(row.id, user.sub, secretData, 1);
    await this.audit(user, 'connection.created', row.id, { provider: row.provider, authType: row.authType, visibility: row.visibility });
    return this.serialize(row, user.sub);
  }

  async update(user: AccessTokenPayload, id: string, input: { name?: string; linkName?: string; connectionType?: ConnectionType; visibility?: ConnectionVisibility; baseUrl?: string; scope?: string | string[]; metadata?: Record<string, unknown>; secrets?: SecretInput; status?: ConnectionStatus }) {
    const current = await this.findVisible(user, id);
    const share = current.ownerId === user.sub ? null : await this.prisma.connectionShare.findFirst({ where: { connectionId: id, userId: user.sub } });
    if (current.ownerId !== user.sub && share?.role !== ConnectionShareRole.MANAGE) throw new ForbiddenException('You do not have permission to edit this connection');
    if (input.status && input.status !== ConnectionStatus.ACTIVE && input.status !== ConnectionStatus.DISABLED) throw new BadRequestException('Invalid connection status change');
    if (input.baseUrl !== undefined && input.baseUrl && !/^https:\/\//i.test(input.baseUrl)) throw new BadRequestException('REST base URL must use HTTPS');
    const requestedScopes = input.scope === undefined ? undefined : (Array.isArray(input.scope) ? input.scope : input.scope.split(/\s+/).filter(Boolean)).slice(0, 100).join(' ').slice(0, 4000);
    if (input.secrets) this.validateSecretInput(current.authType, input.secrets);
    const secretData = input.secrets ? this.encryptSecrets(input.secrets) : {};
    let versionSnapshot: Record<string, string> | null = null;
    if (Object.keys(secretData).length) {
      const existingSecret = await this.prisma.connectionSecret.findUnique({ where: { connectionId: id } });
      versionSnapshot = this.mergeSecretSnapshot(existingSecret, secretData);
    }
    if (input.connectionType && input.connectionType !== current.connectionType) { if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') throw new ForbiddenException('Only organization administrators can change connection type'); }
    const nextLinkName = input.linkName !== undefined ? await this.uniqueLinkName(user.org_id, input.linkName, id) : undefined;
    const row = await this.prisma.connection.update({ where: { id }, data: { ...(input.name !== undefined ? { name: String(input.name).trim().slice(0, 120) } : {}), ...(nextLinkName ? { linkName: nextLinkName } : {}), ...(input.connectionType ? { connectionType: input.connectionType } : {}), ...(input.visibility ? { visibility: input.visibility } : {}), ...(input.baseUrl !== undefined ? { baseUrl: input.baseUrl?.trim() || null } : {}), ...(requestedScopes !== undefined ? { scope: requestedScopes || null } : {}), ...(input.metadata !== undefined ? { metadata: input.metadata as Prisma.InputJsonValue } : {}), ...(input.status ? { status: input.status } : {}), ...(Object.keys(secretData).length ? { secret: { upsert: { create: { id: randomUUID(), ownerId: current.ownerId, ...secretData }, update: secretData } } } : {}) } });
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
    this.validateSecretInput(current.authType, secrets);
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
    try { if (token) await this.providerRevoke(current.provider, token, current.orgId); } catch { /* local revoke still proceeds */ }
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

  async transferOwnership(user: AccessTokenPayload, id: string, targetUserId: string) {
    const current = await this.findVisible(user, id);
    const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
    if (current.ownerId !== user.sub && !isAdmin) throw new ForbiddenException('Only the connection owner or organization administrator can transfer ownership');
    if (!targetUserId || targetUserId === current.ownerId) throw new BadRequestException('Choose a different organization member');
    const target = await this.prisma.user.findFirst({
      where: { id: targetUserId, memberships: { some: { organizationId: user.org_id } } },
      select: { id: true, name: true, email: true },
    });
    if (!target) throw new NotFoundException('Target user is not a member of this organization');
    if (current.connectionType !== ConnectionType.USER && !isAdmin) throw new ForbiddenException('Only organization administrators can transfer system or admin connections');

    const references = await this.references(user, id);
    const referencedActiveWorkflowIds = [...new Set(references.references.filter(r => r.workflowId && r.status === 'ACTIVE').map(r => r.workflowId!))];
    const activeWorkflows = referencedActiveWorkflowIds.length
      ? await this.prisma.workflow.findMany({ where: { orgId: user.org_id, id: { in: referencedActiveWorkflowIds }, status: 'ACTIVE' }, select: { id: true, ownerId: true, name: true } })
      : [];
    const impactedWorkflowIds = current.visibility === ConnectionVisibility.PRIVATE
      ? activeWorkflows.filter(w => w.ownerId !== target.id).map(w => w.id)
      : [];
    if (impactedWorkflowIds.length) {
      throw new ConflictException({
        code: 'OWNERSHIP_TRANSFER_BLOCKED',
        message: 'Transfer would invalidate an active workflow that relies on this private connection. Make the connection organization-visible or reconfigure the workflow before transferring ownership.',
        connectionId: id,
        workflowIds: impactedWorkflowIds,
      });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.connection.update({ where: { id }, data: { ownerId: target.id, visibility: current.connectionType === ConnectionType.USER ? current.visibility : ConnectionVisibility.ORGANIZATION } });
      await tx.connectionSecret.updateMany({ where: { connectionId: id }, data: { ownerId: target.id } });
      await tx.connectionShare.deleteMany({ where: { connectionId: id, userId: target.id } });
      return updated;
    });
    await this.audit(user, 'connection.ownership_transferred', id, { fromUserId: current.ownerId, toUserId: target.id, connectionType: current.connectionType });
    return { ...this.serialize(result, user.sub), previousOwnerId: current.ownerId, owner: target };
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
    if (current.ownerId !== user.sub) throw new ForbiddenException('Only the connection owner can delete this connection');
    await this.assertNotReferenced(user, id);
    if (current.ownerId !== user.sub) throw new ForbiddenException('Only the connection owner can delete it');
    await this.prisma.connection.delete({ where: { id } });
    await this.audit(user, 'connection.deleted', id, { provider: current.provider });
    return { id, deleted: true };
  }

  async automatedHealthScan(orgId: string) {
    const admin = await this.prisma.organizationMembership.findFirst({
      where: { organizationId: orgId, status: 'ACTIVE', role: { in: ['SUPER_ADMIN', 'ADMIN'] } },
      orderBy: { joinedAt: 'asc' },
      select: { userId: true, role: true },
    });
    if (!admin) return { orgId, skipped: true, reason: 'NO_ACTIVE_ADMIN', scanned: 0, results: [] };
    const user = { sub: admin.userId, org_id: orgId, role: admin.role } as AccessTokenPayload;
    const result = await this.scanHealth(user);
    const connectionIds = result.results.map((item) => item.id);
    for (const item of result.results) {
      const recent = await this.prisma.connectionHealthCheck.findMany({
        where: { orgId, connectionId: item.id },
        orderBy: { checkedAt: 'desc' },
        take: 3,
        select: { status: true, errorCode: true, message: true, latencyMs: true, checkedAt: true },
      });
      const failures = recent.filter((check) => check.status !== ConnectionStatus.ACTIVE);
      const degraded = item.ok && (item.latencyMs ?? 0) >= 5000;
      const healthState = !item.ok && failures.length >= 2 ? 'FAILED' : (degraded || !item.ok ? 'DEGRADED' : 'HEALTHY');
      if (healthState === 'HEALTHY') {
        await this.prisma.connectionHealthAlert.updateMany({ where: { orgId, connectionId: item.id, status: 'OPEN' }, data: { status: 'RESOLVED', resolvedAt: new Date(), lastSeenAt: new Date() } });
        continue;
      }
      const severity = healthState === 'FAILED' ? 'CRITICAL' : 'WARNING';
      const existing = await this.prisma.connectionHealthAlert.findFirst({ where: { orgId, connectionId: item.id, status: 'OPEN' }, orderBy: { openedAt: 'desc' } });
      if (existing) {
        await this.prisma.connectionHealthAlert.update({ where: { id: existing.id }, data: { severity, errorCode: item.errorCode ?? null, message: item.message ?? null, failureCount: { increment: 1 }, lastSeenAt: new Date() } });
      } else {
        await this.prisma.connectionHealthAlert.create({ data: { id: randomUUID(), orgId, connectionId: item.id, severity, status: 'OPEN', errorCode: item.errorCode ?? null, message: item.message ?? null, failureCount: failures.length || 1 } });
      }
    }
    return { ...result, orgId, skipped: false, connectionIds };
  }

  async healthAlerts(user: AccessTokenPayload, status = 'OPEN') {
    const normalized = status === 'ALL' ? undefined : (status === 'RESOLVED' ? 'RESOLVED' : 'OPEN');
    return this.prisma.connectionHealthAlert.findMany({
      where: { orgId: user.org_id, ...(normalized ? { status: normalized } : {}), connection: { OR: [{ ownerId: user.sub }, { visibility: ConnectionVisibility.ORGANIZATION }, { shares: { some: { userId: user.sub } } }] } },
      orderBy: { lastSeenAt: 'desc' }, take: 100,
      include: { connection: { select: { id: true, name: true, provider: true, status: true } } },
    });
  }

  async healthHistory(user: AccessTokenPayload, id: string, limit = 20) {
    await this.findVisible(user, id);
    const take = Math.min(Math.max(Number(limit) || 20, 1), 100);
    return this.prisma.connectionHealthCheck.findMany({
      where: { orgId: user.org_id, connectionId: id },
      orderBy: { checkedAt: 'desc' },
      take,
      select: { id: true, status: true, errorCode: true, message: true, latencyMs: true, source: true, checkedAt: true },
    });
  }

  async healthSummary(user: AccessTokenPayload) {
    const rows = await this.prisma.connection.findMany({
      where: { orgId: user.org_id, OR: [{ ownerId: user.sub }, { visibility: ConnectionVisibility.ORGANIZATION }, { shares: { some: { userId: user.sub } } }] },
      select: { id: true, name: true, provider: true, authType: true, status: true, errorCode: true, errorMessage: true, lastTestedAt: true, lastUsedAt: true, expiresAt: true },
      orderBy: { updatedAt: 'desc' },
    });
    const ids = rows.map(r => r.id);
    const latest = ids.length ? await this.prisma.connectionHealthCheck.findMany({ where: { orgId: user.org_id, connectionId: { in: ids } }, orderBy: { checkedAt: 'desc' }, select: { connectionId: true, status: true, errorCode: true, latencyMs: true, checkedAt: true } }) : [];
    const latestById = new Map<string, typeof latest[number]>();
    for (const item of latest) if (!latestById.has(item.connectionId)) latestById.set(item.connectionId, item);
    const counts = rows.reduce<Record<string, number>>((acc, row) => { acc[row.status] = (acc[row.status] ?? 0) + 1; return acc; }, {});
    return { checkedAt: new Date().toISOString(), total: rows.length, counts, connections: rows.map(row => ({ ...row, latestHealth: latestById.get(row.id) ?? null })) };
  }

  async scanHealth(user: AccessTokenPayload) {
    const visible = await this.prisma.connection.findMany({
      where: { orgId: user.org_id, status: { not: ConnectionStatus.DISABLED }, OR: [{ ownerId: user.sub }, { visibility: ConnectionVisibility.ORGANIZATION }, { shares: { some: { userId: user.sub } } }] },
      select: { id: true }, orderBy: { updatedAt: 'desc' }, take: 50,
    });
    const results = [];
    for (const row of visible) {
      const started = Date.now();
      try {
        const result = await this.test(user, row.id);
        const health = { status: result.status, errorCode: result.ok ? null : result.status === ConnectionStatus.REAUTH_REQUIRED ? 'REAUTH_REQUIRED' : 'TEST_FAILED', message: result.ok ? null : 'Connection health check failed', latencyMs: Date.now() - started };
        await this.prisma.connectionHealthCheck.create({ data: { id: randomUUID(), orgId: user.org_id, connectionId: row.id, ...health, source: 'SCAN' } });
        results.push({ id: row.id, ok: result.ok, ...health });
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 500) : 'Connection health check failed';
        const health = { status: 'ERROR', errorCode: 'HEALTH_CHECK_FAILED', message, latencyMs: Date.now() - started };
        await this.prisma.connectionHealthCheck.create({ data: { id: randomUUID(), orgId: user.org_id, connectionId: row.id, ...health, source: 'SCAN' } });
        results.push({ id: row.id, ok: false, ...health });
      }
    }
    return { checkedAt: new Date().toISOString(), scanned: results.length, results };
  }

  async test(user: AccessTokenPayload, id: string) {
    const row = await this.findVisible(user, id);
    if (row.status === ConnectionStatus.DISABLED) throw new ConflictException('Connection is disabled');
    try {
      if (row.authType === ConnectionAuthType.OAUTH2) {
        const token = await this.getAccessTokenById(row.id);
        if (!token) throw new Error('Missing OAuth access token');
        await this.providerProbe(row.provider, token, row.baseUrl, row.orgId);
      } else {
        const secret = await this.prisma.connectionSecret.findUnique({ where: { connectionId: id } });
        const missing = this.requiredSecretFields(row.authType).filter((key) => !secret?.[key as SecretKey]);
        if (missing.length) throw new Error(`Missing credential: ${missing.join(', ')}`);
      }
      await this.prisma.connection.update({ where: { id }, data: { lastTestedAt: new Date(), status: ConnectionStatus.ACTIVE, errorCode: null, errorMessage: null } });
      await this.audit(user, 'connection.tested', id, { ok: true });
      await this.prisma.connectionHealthCheck.create({ data: { id: randomUUID(), orgId: user.org_id, connectionId: id, status: ConnectionStatus.ACTIVE, source: 'TEST', checkedAt: new Date() } });
      return { id, ok: true, status: ConnectionStatus.ACTIVE, missing: [] as string[] };
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : 'Connection test failed';
      const reauth = row.authType === ConnectionAuthType.OAUTH2;
      await this.prisma.connection.update({ where: { id }, data: { lastTestedAt: new Date(), status: reauth ? ConnectionStatus.REAUTH_REQUIRED : ConnectionStatus.ERROR, errorCode: reauth ? 'REAUTH_REQUIRED' : 'TEST_FAILED', errorMessage: message } });
      await this.audit(user, 'connection.tested', id, { ok: false, errorCode: reauth ? 'REAUTH_REQUIRED' : 'TEST_FAILED' });
      await this.prisma.connectionHealthCheck.create({ data: { id: randomUUID(), orgId: user.org_id, connectionId: id, status: reauth ? ConnectionStatus.REAUTH_REQUIRED : ConnectionStatus.ERROR, errorCode: reauth ? 'REAUTH_REQUIRED' : 'TEST_FAILED', message, source: 'TEST', checkedAt: new Date() } });
      return { id, ok: false, status: reauth ? ConnectionStatus.REAUTH_REQUIRED : ConnectionStatus.ERROR, missing: [] as string[] };
    }
  }

  async governance(user: AccessTokenPayload, id: string) {
    const row = await this.findVisible(user, id);
    const definition = await this.resolveProviderDefinition(row.provider, row.orgId);
    const providerConfig = row.authType === ConnectionAuthType.OAUTH2
      ? await this.prisma.connectionProviderConfig.findUnique({
          where: { orgId_providerKey: { orgId: row.orgId, providerKey: row.provider } },
          select: { enabled: true, scopes: true, lastTestedAt: true, lastTestOk: true, lastTestMessage: true },
        })
      : null;
    const references = await this.references(user, id);
    const workflowReferences = references.references.filter((r) => r.type !== 'WORKFLOW_FUNCTION');
    const activeWorkflowIds = [...new Set(workflowReferences.filter((r) => r.status === 'ACTIVE').map((r) => r.workflowId).filter(Boolean) as string[])];
    const selectedScopes = (row.scope ?? '').split(/\s+/).filter(Boolean);
    const configuredScopes = Array.isArray(providerConfig?.scopes)
      ? providerConfig!.scopes.map((v: unknown) => String(v).trim()).filter(Boolean)
      : definition.defaultScopes;
    const missingConfiguredScopes = row.authType === ConnectionAuthType.OAUTH2
      ? selectedScopes.filter((scope) => !configuredScopes.includes(scope))
      : [];
    const usageSummary = await this.prisma.connectionUsage.groupBy({
      by: ['status'],
      where: { orgId: user.org_id, connectionId: id },
      _count: { _all: true },
    });
    const failures = usageSummary.filter((item) => item.status !== 'SUCCESS').reduce((sum, item) => sum + item._count._all, 0);
    const issues: Array<{ code: string; severity: 'BLOCKING' | 'WARNING'; message: string }> = [];
    if (row.status !== ConnectionStatus.ACTIVE) issues.push({ code: 'CONNECTION_NOT_ACTIVE', severity: 'BLOCKING', message: `Connection is ${String(row.status).toLowerCase()}` });
    if (row.authType === ConnectionAuthType.OAUTH2 && providerConfig?.enabled === false) issues.push({ code: 'PROVIDER_DISABLED', severity: 'BLOCKING', message: 'The organization OAuth provider is disabled.' });
    if (row.authType === ConnectionAuthType.OAUTH2 && providerConfig && providerConfig.lastTestOk === false) issues.push({ code: 'PROVIDER_CONFIG_FAILED', severity: 'WARNING', message: providerConfig.lastTestMessage || 'Provider configuration test failed.' });
    if (missingConfiguredScopes.length) issues.push({ code: 'SCOPE_CONFIGURATION_DRIFT', severity: 'BLOCKING', message: `Connection scopes are not enabled in provider configuration: ${missingConfiguredScopes.slice(0, 10).join(', ')}` });
    if (row.provider === 'google' && row.authType === ConnectionAuthType.OAUTH2 && !googleDriveScopeGranted(row.scope)) {
      issues.push({ code: 'INSUFFICIENT_SCOPE', severity: 'BLOCKING', message: 'Google Drive file access is not authorized for this connection.' });
    }
    if (activeWorkflowIds.length && row.visibility === ConnectionVisibility.PRIVATE && row.ownerId !== user.sub) issues.push({ code: 'PRIVATE_CONNECTION_RUNTIME', severity: 'BLOCKING', message: 'A private connection is referenced by an active workflow that may run outside the connection owner context.' });
    if (failures > 0) issues.push({ code: 'RECENT_USAGE_FAILURES', severity: 'WARNING', message: `${failures} recorded connection usage failure(s).` });
    return {
      id: row.id,
      name: row.name,
      connectionType: row.connectionType,
      visibility: row.visibility,
      status: row.status,
      authType: row.authType,
      ownerId: row.ownerId,
      workflowReferences: workflowReferences.length,
      functionReferences: references.references.filter((r) => r.type === 'WORKFLOW_FUNCTION').length,
      activeWorkflowIds,
      provider: row.provider,
      providerGovernance: row.authType === ConnectionAuthType.OAUTH2 ? {
        enabled: providerConfig?.enabled ?? true,
        configuredScopes: configuredScopes,
        selectedScopes,
        missingScopes: missingConfiguredScopes,
        lastTestedAt: providerConfig?.lastTestedAt ?? null,
        lastTestOk: providerConfig?.lastTestOk ?? null,
        lastTestMessage: providerConfig?.lastTestMessage ?? null,
      } : null,
      usage: { failures },
      issues,
      readyForWorkflow: issues.every((issue) => issue.severity !== 'BLOCKING'),
      checkedAt: new Date().toISOString(),
    };
  }

  async diagnostics(user: AccessTokenPayload, id: string) {
    const row = await this.findVisible(user, id);
    const secret = await this.prisma.connectionSecret.findUnique({ where: { connectionId: id }, select: { accessToken: true, refreshToken: true, apiKey: true, bearerToken: true, username: true, password: true, customHeaders: true } });
    const usage = await this.prisma.connectionUsage.aggregate({ where: { connectionId: id, orgId: user.org_id }, _count: { _all: true }, _avg: { durationMs: true } });
    const providerDefinition = await this.resolveProviderDefinition(row.provider, row.orgId);
    const checks = {
      organizationAccess: row.orgId === user.org_id,
      enabled: row.status === ConnectionStatus.ACTIVE,
      credentialsPresent: !!secret && Object.values(secret).some(Boolean),
      baseUrl: !providerDefinition.capabilities.includes('request') || !!row.baseUrl || !!providerDefinition.baseUrl,
      oauthExpiry: row.authType !== ConnectionAuthType.OAUTH2 || !row.expiresAt || row.expiresAt.getTime() > Date.now(),
    };
    return { id: row.id, provider: row.provider, authType: row.authType, status: row.status, checks, lastTestedAt: row.lastTestedAt, lastUsedAt: row.lastUsedAt, errorCode: row.errorCode, errorMessage: row.errorMessage, usageCount: usage._count._all, averageDurationMs: usage._avg.durationMs };
  }

  async usage(user: AccessTokenPayload, id: string) {
    await this.findVisible(user, id);
    const where = { connectionId: id, orgId: user.org_id };
    const [count, recent, byStatus, byAction] = await this.prisma.$transaction([
      this.prisma.connectionUsage.count({ where }),
      this.prisma.connectionUsage.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, userId: true, workflowId: true, runId: true, actionType: true, status: true, errorCode: true, httpStatus: true, attempts: true, durationMs: true, createdAt: true } }),
      this.prisma.connectionUsage.groupBy({ by: ['status'], where, _count: { _all: true }, _avg: { durationMs: true }, orderBy: { _count: { status: 'desc' } } }),
      this.prisma.connectionUsage.groupBy({ by: ['actionType'], where, _count: { _all: true }, _avg: { durationMs: true }, orderBy: { _count: { actionType: 'desc' } }, take: 10 }),
    ]);
    return { count, recent, summary: { byStatus, byAction } };
  }

  async beginOAuth(user: AccessTokenPayload, provider: OAuthProvider, folderId: string | null = null, connectionId: string | null = null, returnPath: string | null = null, requiredScopes: string[] = []) {
    const definition = await this.resolveProviderDefinition(provider, user.org_id);
    this.assertOAuthProvider(provider, definition);
    const cfg = await this.oauthConfig(provider, definition, user?.org_id);
    if (!cfg.clientId || !cfg.clientSecret) throw new BadRequestException(`${provider} OAuth integration is not configured. Ask an organization administrator to configure this provider in Connections → Provider Configuration.`);
    let connection: any = null;
    if (connectionId) {
      connection = await this.prisma.connection.findFirst({ where: { id: connectionId, orgId: user.org_id, ownerId: user.sub, provider, authType: ConnectionAuthType.OAUTH2 } });
      if (!connection) throw new NotFoundException('OAuth connection not found');
      if (connection.status === ConnectionStatus.DISABLED) throw new ConflictException('Connection is disabled');
      await this.prisma.connection.update({ where: { id: connection.id }, data: { status: ConnectionStatus.PENDING_AUTH, errorCode: null, errorMessage: null } });
      connection.status = ConnectionStatus.PENDING_AUTH;
    }
    const safeReturnPath = normalizeOAuthReturnPath(returnPath);
    const state = randomBytes(32).toString('base64url');
    const codeVerifier = definition.oauthPkce ? randomBytes(48).toString('base64url') : null;
    const codeChallenge = codeVerifier ? createHash('sha256').update(codeVerifier).digest('base64url') : null;
    await this.prisma.connectionOAuthState.create({ data: { id: randomUUID(), stateHash: this.hash(state), orgId: user.org_id, userId: user.sub, provider, connectionId: connection?.id ?? null, folderId, returnPath: safeReturnPath, ...(codeVerifier ? { codeVerifier: this.crypto.encrypt(codeVerifier) } : {}), expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS) } });
    this.oauthLog('START', { provider, connectionId: connection?.id ?? null, orgId: user.org_id, userId: user.sub, redirectUri: cfg.callbackUrl });
    this.oauthLog('STATE_CREATED', { provider, connectionId: connection?.id ?? null, orgId: user.org_id, userId: user.sub });
    const configuredScopes = await this.configuredProviderScopes(provider, user.org_id, definition);
    const existingScopes = connection?.scope?.trim() ? connection.scope.split(/\s+/).filter(Boolean) : [];
    const mergedScopes = [...new Set([...definition.defaultScopes, ...configuredScopes, ...existingScopes, ...requiredScopes.filter(Boolean)])];
    const selectedScopes = mergedScopes.join(' ');
    const params = new URLSearchParams({ client_id: cfg.clientId, redirect_uri: cfg.callbackUrl, response_type: 'code', state });
    if (codeChallenge) { params.set('code_challenge', codeChallenge); params.set('code_challenge_method', 'S256'); }
    if (selectedScopes) params.set('scope', selectedScopes);
    if (provider === 'google') { params.set('access_type', 'offline'); params.set('include_granted_scopes', 'true'); params.set('prompt', 'consent'); }
    if (provider === 'dropbox') params.set('token_access_type', 'offline');
    if (provider === 'microsoft') params.set('response_mode', 'query');
    if (provider === 'github') params.set('allow_signup', 'false');
    return { url: `${cfg.authBase}?${params.toString()}`, provider, connectionId: connection?.id ?? null, scopes: selectedScopes.split(/\s+/).filter(Boolean) };
  }

  async completeOAuth(provider: OAuthProvider, code: string, state: string) {
    this.oauthLog('PROVIDER_CALLBACK', { provider });
    const statePreview = await this.prisma.connectionOAuthState.findFirst({ where: { stateHash: this.hash(state), provider }, select: { orgId: true } });
    const definition = statePreview ? await this.resolveProviderDefinition(provider, statePreview.orgId) : (provider.startsWith('custom:') ? null : this.registry.get(provider));
    if (!definition) throw new BadRequestException('Custom service not found');
    this.assertOAuthProvider(provider, definition);
    if (!code || !state) throw new BadRequestException('Missing OAuth callback parameters');
    const row = await this.prisma.connectionOAuthState.findFirst({ where: { stateHash: this.hash(state), provider, usedAt: null, expiresAt: { gt: new Date() } } });
    if (!row) {
      this.oauthLog('STATE_INVALID', { provider });
      throw new BadRequestException('OAuth state is invalid or expired');
    }
    this.oauthLog('STATE_VALID', { provider, connectionId: row.connectionId, orgId: row.orgId, userId: row.userId });
    await this.prisma.connectionOAuthState.update({ where: { id: row.id }, data: { usedAt: new Date() } });
    const cfg = await this.oauthConfig(provider, definition, row.orgId);
    if (!cfg.clientId || !cfg.clientSecret) throw new BadRequestException(`${provider} OAuth integration is not configured`);
    let payload: any;
    try {
      payload = await this.providerAdapter.exchangeCode(
        { clientId: cfg.clientId, clientSecret: cfg.clientSecret, callbackUrl: cfg.callbackUrl, authBase: cfg.authBase, tokenUrl: cfg.tokenUrl },
        code,
        row.codeVerifier ? this.crypto.decrypt(row.codeVerifier) : null,
      );
      this.oauthLog('TOKEN_EXCHANGE_SUCCESS', { provider, connectionId: row.connectionId, orgId: row.orgId, userId: row.userId, redirectUri: cfg.callbackUrl });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : 'OAuth authorization failed';
      this.oauthLog('TOKEN_EXCHANGE_FAILED', { provider, connectionId: row.connectionId, orgId: row.orgId, userId: row.userId, redirectUri: cfg.callbackUrl, error: safeOAuthErrorCode(message) });
      if (row.connectionId) await this.prisma.connection.update({ where: { id: row.connectionId }, data: { status: ConnectionStatus.REAUTH_REQUIRED, errorCode: 'TOKEN_EXCHANGE_FAILED', errorMessage: message } }).catch(() => undefined);
      throw new BadRequestException(message);
    }
    const expiresIn = typeof payload.expires_in === 'number' ? payload.expires_in : (typeof payload.expires_in === 'string' && /^\d+$/.test(payload.expires_in) ? Number(payload.expires_in) : null);
    const expiresAt = expiresIn !== null ? new Date(Date.now() + expiresIn * 1000) : null;
    const stateConnection = row.connectionId ? await this.prisma.connection.findFirst({ where: { id: row.connectionId, orgId: row.orgId, ownerId: row.userId, provider, authType: ConnectionAuthType.OAUTH2 } }) : null;
    const existing = stateConnection ?? await this.prisma.connection.findFirst({ where: { orgId: row.orgId, ownerId: row.userId, provider, authType: ConnectionAuthType.OAUTH2 }, orderBy: { updatedAt: 'desc' } });
    const name = existing?.name ?? `${definition.name} connection`;
    const providerPayloadBaseUrl = typeof payload.api_endpoint === 'string' ? payload.api_endpoint.replace(/\/$/, '') : typeof payload.instance_url === 'string' ? payload.instance_url.replace(/\/$/, '') : undefined;
    let authorizedAccount: Record<string, unknown> | null = null;
    try {
      authorizedAccount = await this.providerAdapter.probe(definition, provider, payload.access_token, existing?.baseUrl ?? null);
      this.oauthLog('PROVIDER_PROBE_SUCCESS', { provider, connectionId: existing?.id ?? row.connectionId, orgId: row.orgId, userId: row.userId });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : 'Provider authorization probe failed';
      this.oauthLog('PROVIDER_PROBE_FAILED', { provider, connectionId: existing?.id ?? row.connectionId, orgId: row.orgId, userId: row.userId, error: safeOAuthErrorCode(message) });
      if (existing) await this.prisma.connection.update({ where: { id: existing.id }, data: { status: ConnectionStatus.REAUTH_REQUIRED, errorCode: 'PROVIDER_PROBE_FAILED', errorMessage: message } }).catch(() => undefined);
      throw new BadRequestException(`OAuth authorization succeeded but provider verification failed: ${message}`);
    }
    const metadata: Record<string, unknown> = {
      ...(existing?.metadata && typeof existing.metadata === 'object' ? existing.metadata as Record<string, unknown> : {}),
      oauthProvider: provider,
      oauthConnectedAt: new Date().toISOString(),
      ...(authorizedAccount ? { authorizedAccount } : {}),
    };
    const grantedScope = typeof payload.scope === 'string' ? payload.scope.slice(0, 4000) : (existing?.scope ?? null);
    const capabilitySummary = buildConnectionCapabilitySummary({ provider, authType: ConnectionAuthType.OAUTH2, scope: grantedScope, errorCode: null });
    if (provider === 'google') {
      metadata.capabilities = Object.fromEntries(capabilitySummary.items.map((item) => [item.key, item.state]));
    }
    const driveActivationError = provider === 'google' ? googleDriveActivationError(grantedScope) : null;
    const accessToken = this.crypto.encrypt(payload.access_token);
    const newRefreshToken = typeof payload.refresh_token === 'string' ? this.crypto.encrypt(payload.refresh_token) : undefined;
    let connection: { id: string };
    try {
      connection = existing
        ? await this.prisma.connection.update({ where: { id: existing.id }, data: { status: ConnectionStatus.ACTIVE, metadata: metadata as Prisma.InputJsonValue, expiresAt, ...(providerPayloadBaseUrl ? { baseUrl: providerPayloadBaseUrl } : {}), scope: grantedScope, errorCode: driveActivationError?.errorCode ?? null, errorMessage: driveActivationError?.errorMessage ?? null, secret: { upsert: { create: { id: randomUUID(), ownerId: row.userId, accessToken, ...(newRefreshToken ? { refreshToken: newRefreshToken } : {}) }, update: { accessToken, ...(newRefreshToken ? { refreshToken: newRefreshToken } : {}) } } } } })
        : await this.prisma.connection.create({ data: { id: randomUUID(), orgId: row.orgId, ownerId: row.userId, name, linkName: await this.uniqueLinkName(row.orgId, `${provider}_${name}`), connectionType: ConnectionType.USER, provider, authType: ConnectionAuthType.OAUTH2, visibility: ConnectionVisibility.PRIVATE, status: ConnectionStatus.ACTIVE, metadata: metadata as Prisma.InputJsonValue, expiresAt, ...(providerPayloadBaseUrl ? { baseUrl: providerPayloadBaseUrl } : {}), scope: grantedScope, errorCode: driveActivationError?.errorCode ?? null, errorMessage: driveActivationError?.errorMessage ?? null, secret: { create: { id: randomUUID(), ownerId: row.userId, accessToken, ...(newRefreshToken ? { refreshToken: newRefreshToken } : {}) } } } });
    } catch (error) {
      this.oauthLog('DATABASE_UPDATE_FAILED', { provider, connectionId: existing?.id ?? row.connectionId, orgId: row.orgId, userId: row.userId, error: safeOAuthErrorCode(error instanceof Error ? error.message : 'database') });
      throw error;
    }
    this.oauthLog('CONNECTION_ACTIVATED', { provider, connectionId: connection.id, orgId: row.orgId, userId: row.userId, status: ConnectionStatus.ACTIVE });
    const oauthSecret = await this.prisma.connectionSecret.findUnique({ where: { connectionId: connection.id } });
    if (oauthSecret) {
      const version = await this.nextSecretVersion(connection.id);
      const snapshot = this.mergeSecretSnapshot(oauthSecret, {});
      await this.createSecretVersion(connection.id, row.userId, snapshot, version);
      await this.prisma.connectionSecret.update({ where: { connectionId: connection.id }, data: { keyVersion: version } });
    }
    await this.prisma.auditLog.create({ data: { id: randomUUID(), orgId: row.orgId, actorId: row.userId, action: 'connection.reconnected', resourceType: 'CONNECTION', resourceId: connection.id, metadata: { provider, oauth: true } as Prisma.InputJsonValue } }).catch(() => undefined);
    const frontend = this.frontendUrl();
    const resumeToken = await this.resumeCodeFor(row.userId);
    this.oauthLog('REDIRECT', { provider, connectionId: connection.id, orgId: row.orgId, userId: row.userId, status: ConnectionStatus.ACTIVE, targetOrigin: safeOrigin(frontend) });
    return { connectionId: connection.id, frontend, folderId: row.folderId, returnPath: row.returnPath, orgId: row.orgId, userId: row.userId, resumeToken };
  }

  private async resumeCodeFor(userId: string | null | undefined) {
    if (!userId) return null;
    try { return await this.auth.issueOAuthResumeCode(userId); } catch (error) {
      this.oauthLog('SESSION_RESUME_FAILED', { error: safeOAuthErrorCode(error instanceof Error ? error.message : 'session') });
      return null;
    }
  }

  async handleOAuthCallbackError(provider: OAuthProvider, state?: string, error?: string, description?: string) {
    const frontend = this.frontendUrl();
    if (state) {
      const row = await this.prisma.connectionOAuthState.findFirst({ where: { stateHash: this.hash(state), provider }, select: { id: true, usedAt: true, connectionId: true, returnPath: true, userId: true } });
      if (row && !row.usedAt) {
        await this.prisma.connectionOAuthState.update({ where: { id: row.id }, data: { usedAt: new Date() } });
      }
      if (row?.connectionId) {
        const current = await this.prisma.connection.findUnique({ where: { id: row.connectionId }, select: { status: true } }).catch(() => null);
        if (oauthFailurePreservesActive(current?.status)) {
          this.oauthLog('REDIRECT', { provider, connectionId: row.connectionId, status: ConnectionStatus.ACTIVE, targetOrigin: safeOrigin(frontend) });
          return { frontend, error: error || 'oauth_cancelled', description: description || 'OAuth authorization was cancelled.', returnPath: row.returnPath ?? null, alreadyActive: true, connectionId: row.connectionId, resumeToken: await this.resumeCodeFor(row.userId) };
        }
        const nextStatus = current?.status === ConnectionStatus.PENDING_AUTH ? ConnectionStatus.PENDING_AUTH : ConnectionStatus.REAUTH_REQUIRED;
        await this.prisma.connection.update({ where: { id: row.connectionId }, data: { status: nextStatus, errorCode: error || 'OAUTH_CANCELLED', errorMessage: (description || 'OAuth authorization was cancelled.').slice(0, 500) } }).catch(() => undefined);
      }
      this.oauthLog('REDIRECT_FAILED', { provider, connectionId: row?.connectionId, error: safeOAuthErrorCode(error || description || 'oauth_cancelled'), targetOrigin: safeOrigin(frontend) });
      return { frontend, error: error || 'oauth_cancelled', description: description || 'OAuth authorization was cancelled.', returnPath: row?.returnPath ?? null, alreadyActive: false, connectionId: row?.connectionId ?? null, resumeToken: await this.resumeCodeFor(row?.userId) };
    }
    this.oauthLog('REDIRECT_FAILED', { provider, error: safeOAuthErrorCode(error || description || 'oauth_cancelled'), targetOrigin: safeOrigin(frontend) });
    return { frontend, error: error || 'oauth_cancelled', description: description || 'OAuth authorization was cancelled.', returnPath: null, alreadyActive: false, connectionId: null, resumeToken: null };
  }

  async reconnect(user: AccessTokenPayload, id: string, returnPath: string | null = null) {
    const row = await this.findVisible(user, id);
    if (row.ownerId !== user.sub) throw new ForbiddenException('Only the connection owner can reconnect it');
    if (row.authType !== ConnectionAuthType.OAUTH2) throw new BadRequestException('Only OAuth connections can be reconnected');
    return this.beginOAuth(user, row.provider as OAuthProvider, null, row.id, returnPath);
  }

  async browseResources(user: AccessTokenPayload, id: string, parent?: string | null, pageToken?: string | null) {
    const row = await this.findVisible(user, id);
    const parentId = String(parent ?? '').trim();
    try {
      if (row.provider === 'google') return { connectionId: row.id, provider: row.provider, parent: parentId || null, ...(await this.googleChildren(row.id, parentId, pageToken)) };
      const token = await this.resolveBrowseToken(row);
      if (row.provider === 'dropbox') return { connectionId: row.id, provider: row.provider, parent: parentId || null, ...(await this.dropboxChildren(token, parentId, pageToken)) };
      if (row.provider === 'microsoft') return { connectionId: row.id, provider: row.provider, parent: parentId || null, ...(await this.microsoftChildren(token, parentId, pageToken)) };
    } catch (error) {
      throw new BadRequestException(this.providerBrowseError(error, row.provider));
    }
    throw new BadRequestException('This connection does not support browsing files.');
  }

  async readResource(user: AccessTokenPayload, id: string, resourceId: string) {
    const row = await this.findVisible(user, id);
    const target = resourceId.trim();
    if (!target) throw new BadRequestException('Choose a file first.');
    try {
      if (row.provider === 'google') {
        const response = await this.googleDriveRequest(row.id, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(target)}?fields=id,name,mimeType,size`);
        const payload = await this.readJson(response);
        if (!response.ok) throw new Error(`${mapGoogleDriveApiError(response.status, payload).code}: ${mapGoogleDriveApiError(response.status, payload).message}`);
        return { connectionId: row.id, provider: row.provider, id: String(payload.id), name: String(payload.name ?? 'File'), kind: payload.mimeType === 'application/vnd.google-apps.folder' ? 'folder' : 'file', mimeType: payload.mimeType ?? null };
      }
      const token = await this.resolveBrowseToken(row);
      if (row.provider === 'dropbox') {
        const response = await fetch('https://api.dropboxapi.com/2/files/get_metadata', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ path: target }) });
        const payload = await this.readJson(response);
        if (!response.ok) throw new Error(String(payload?.error_summary ?? response.status));
        return { connectionId: row.id, provider: row.provider, id: String(payload.id ?? target), name: String(payload.name ?? 'File'), kind: payload['.tag'] === 'folder' ? 'folder' : 'file', mimeType: null };
      }
      if (row.provider === 'microsoft') {
        const response = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(target)}?$select=id,name,folder,file`, { headers: { authorization: `Bearer ${token}` } });
        const payload = await this.readJson(response);
        if (!response.ok) throw new Error(String(payload?.error?.message ?? response.status));
        return { connectionId: row.id, provider: row.provider, id: String(payload.id), name: String(payload.name ?? 'File'), kind: payload.folder ? 'folder' : 'file', mimeType: payload.file?.mimeType ?? null };
      }
    } catch (error) {
      throw new BadRequestException(this.providerBrowseError(error, row.provider));
    }
    throw new BadRequestException('This connection does not support reading files.');
  }

  async uploadResource(user: AccessTokenPayload, id: string, input: { parentId?: string | null; name?: string; contentBase64?: string }) {
    const name = String(input.name ?? '').trim();
    const bytes = Buffer.from(String(input.contentBase64 ?? ''), 'base64');
    if (!name || !bytes.length || bytes.length > 8_000_000) throw new BadRequestException('Choose a file smaller than 8 MB.');
    const row = await this.findVisible(user, id);
    const token = await this.resolveBrowseToken(row);
    const parentId = String(input.parentId ?? '').trim();
    try {
      if (row.provider === 'google') return { ...(await this.googleUpload(token, parentId, name, bytes)), provider: row.provider };
      if (row.provider === 'dropbox') return { ...(await this.dropboxUpload(token, parentId, name, bytes)), provider: row.provider };
      if (row.provider === 'microsoft') return { ...(await this.microsoftUpload(token, parentId, name, bytes)), provider: row.provider };
    } catch (error) {
      throw new BadRequestException(this.providerBrowseError(error, row.provider));
    }
    throw new BadRequestException('This connection does not support upload.');
  }

  private async googleUpload(token: string, parentId: string, name: string, bytes: Buffer) {
    const boundary = `imkan${Date.now()}`;
    const meta = JSON.stringify({ name, ...(parentId ? { parents: [parentId] } : {}) });
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`),
      bytes,
      Buffer.from(`\r\n--${boundary}--`),
    ]);
    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': `multipart/related; boundary=${boundary}` }, body: new Uint8Array(body) });
    const payload = await this.readJson(response);
    if (!response.ok) throw new Error(String(payload?.error?.message ?? response.status));
    return { id: String(payload.id), name: String(payload.name ?? name), kind: 'file' as const };
  }

  private async dropboxUpload(token: string, parentId: string, name: string, bytes: Buffer) {
    const path = `${parentId && parentId !== 'root' ? parentId.replace(/\/$/, '') : ''}/${name}`;
    const response = await fetch('https://content.dropboxapi.com/2/files/upload', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream', 'dropbox-api-arg': JSON.stringify({ path, mode: 'add', autorename: true }) }, body: new Uint8Array(bytes) });
    const payload = await this.readJson(response);
    if (!response.ok) throw new Error(String(payload?.error_summary ?? response.status));
    return { id: String(payload.id ?? path), name: String(payload.name ?? name), kind: 'file' as const };
  }

  private async microsoftUpload(token: string, parentId: string, name: string, bytes: Buffer) {
    const url = parentId
      ? `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(parentId)}:/${encodeURIComponent(name)}:/content`
      : `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURIComponent(name)}:/content`;
    const response = await fetch(url, { method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream' }, body: new Uint8Array(bytes) });
    const payload = await this.readJson(response);
    if (!response.ok) throw new Error(String(payload?.error?.message ?? response.status));
    return { id: String(payload.id), name: String(payload.name ?? name), kind: 'file' as const };
  }

  private async resolveBrowseToken(row: { id: string; provider: string; status: ConnectionStatus; authType: ConnectionAuthType; scope: string | null }) {
    if (row.status === ConnectionStatus.DISABLED) throw new ForbiddenException('Connection is disabled.');
    if (row.status === ConnectionStatus.REAUTH_REQUIRED) throw new ForbiddenException('Connection requires re-authentication.');
    if (row.provider === 'google' && row.authType === ConnectionAuthType.OAUTH2 && !googleDriveScopeGranted(row.scope)) {
      throw new ForbiddenException('INSUFFICIENT_SCOPE: Google Drive file access is not authorized for this connection.');
    }
    if (row.status !== ConnectionStatus.ACTIVE) throw new ForbiddenException('Your connection expired. Reconnect to continue.');
    const token = await this.getAccessTokenById(row.id);
    if (!token) throw new ForbiddenException('Your connection expired. Reconnect to continue.');
    return token;
  }

  private providerBrowseError(error: unknown, provider?: string) {
    const mapped = providerBrowseErrorCode(error, provider);
    return `${mapped.code}: ${mapped.message}`;
  }

  private async googleChildren(connectionId: string, parentId: string, pageToken?: string | null) {
    const q = parentId ? `'${parentId.replace(/'/g, '')}' in parents and trashed=false` : `'root' in parents and trashed=false`;
    const params = new URLSearchParams({ pageSize: '100', q, fields: 'files(id,name,mimeType,size,modifiedTime),nextPageToken', orderBy: 'folder,name' });
    if (pageToken) params.set('pageToken', pageToken);
    const response = await this.googleDriveRequest(connectionId, `https://www.googleapis.com/drive/v3/files?${params.toString()}`);
    const payload = await this.readJson(response);
    if (!response.ok) {
      const mapped = mapGoogleDriveApiError(response.status, payload);
      throw new Error(`${mapped.code}: ${mapped.message}`);
    }
    return { ...this.splitDriveItems(Array.isArray(payload.files) ? payload.files : [], (item) => item.mimeType === 'application/vnd.google-apps.folder'), nextPageToken: typeof payload.nextPageToken === 'string' ? payload.nextPageToken : null };
  }

  private async googleDriveRequest(connectionId: string, url: string, init?: RequestInit, retried = false): Promise<Response> {
    await this.resolveBrowseToken(await this.prisma.connection.findUniqueOrThrow({ where: { id: connectionId } }));
    const token = await this.getAccessTokenById(connectionId);
    if (!token) throw new Error('TOKEN_EXPIRED: Your connection expired. Reconnect to continue.');
    const response = await fetch(url, { ...init, headers: { ...(init?.headers ?? {}), authorization: `Bearer ${token}` } });
    if (response.status === 401 && !retried) {
      const row = await this.prisma.connection.findUnique({ where: { id: connectionId }, include: { secret: true } });
      if (row?.secret?.refreshToken) {
        await this.refreshOAuthToken(row.provider as OAuthProvider, connectionId, this.crypto.decrypt(row.secret.refreshToken), row.orgId);
        return this.googleDriveRequest(connectionId, url, init, true);
      }
    }
    return response;
  }

  private async dropboxChildren(token: string, parentId: string, pageToken?: string | null) {
    const endpoint = pageToken ? 'https://api.dropboxapi.com/2/files/list_folder/continue' : 'https://api.dropboxapi.com/2/files/list_folder';
    const body = pageToken ? { cursor: pageToken } : { path: parentId || '', recursive: false, limit: 100 };
    const response = await fetch(endpoint, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const payload = await this.readJson(response);
    if (!response.ok) throw new Error(String(payload?.error_summary ?? response.status));
    const entries = Array.isArray(payload.entries) ? payload.entries : [];
    return { ...this.splitDriveItems(entries.map((item: any) => ({ id: String(item.path_lower ?? item.id), name: item.name, mimeType: item['.tag'] === 'folder' ? 'folder' : null, size: item.size })), (item) => item.mimeType === 'folder'), nextPageToken: payload.has_more && typeof payload.cursor === 'string' ? payload.cursor : null };
  }

  private async microsoftChildren(token: string, parentId: string, pageToken?: string | null) {
    const url = pageToken && pageToken.startsWith('https://graph.microsoft.com/')
      ? pageToken
      : (parentId
        ? `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(parentId)}/children?$top=100&$select=id,name,size,folder,file`
        : 'https://graph.microsoft.com/v1.0/me/drive/root/children?$top=100&$select=id,name,size,folder,file');
    const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    const payload = await this.readJson(response);
    if (!response.ok) throw new Error(String(payload?.error?.message ?? response.status));
    return { ...this.splitDriveItems(Array.isArray(payload.value) ? payload.value : [], (item) => Boolean(item.folder)), nextPageToken: typeof payload['@odata.nextLink'] === 'string' ? payload['@odata.nextLink'] : null };
  }

  private splitDriveItems(items: any[], isFolder: (item: any) => boolean) {
    const folders = items.filter(isFolder).map((item) => ({ id: String(item.id), name: String(item.name ?? 'Folder'), kind: 'folder' as const }));
    const files = items.filter((item) => !isFolder(item)).map((item) => ({ id: String(item.id), name: String(item.name ?? 'File'), kind: 'file' as const, mimeType: item.mimeType ?? item.file?.mimeType ?? null }));
    return { folders, files };
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
    const row = await this.findExecutionVisible(user, id, options.workflowId);
    const providerDefinition = await this.resolveProviderDefinition(row.provider, row.orgId);
    if (row.status !== ConnectionStatus.ACTIVE) throw new ForbiddenException('Connection is not active');
    const effectiveBaseUrl = row.baseUrl || providerDefinition.baseUrl;
    const requestCapable = providerDefinition.capabilities.includes('request') || (row.authType === ConnectionAuthType.OAUTH2 && Boolean(effectiveBaseUrl));
    if (!requestCapable) throw new BadRequestException('HTTP_REQUEST is not supported for this connection service');
    if (!effectiveBaseUrl) throw new BadRequestException('Connection base URL is missing');
    const base = new URL(effectiveBaseUrl); if (base.protocol !== 'https:') throw new BadRequestException('REST connection must use HTTPS');
    const target = new URL(path, base); if (target.origin !== base.origin) throw new BadRequestException('HTTP_REQUEST target must remain on the connection origin');
    const { secrets } = await this.getSecretsForExecution(user, id, options.workflowId); const headers = new Headers();
    if (row.authType === ConnectionAuthType.API_KEY && secrets.apiKey) { if (providerDefinition.credentialQueryKey) target.searchParams.set(providerDefinition.credentialQueryKey, secrets.apiKey); else headers.set(providerDefinition.credentialHeader ?? 'X-API-Key', `${providerDefinition.credentialPrefix ?? ''}${secrets.apiKey}`); }
    if (row.authType === ConnectionAuthType.OAUTH2 && secrets.accessToken) headers.set('Authorization', `Bearer ${secrets.accessToken}`);
    if (row.authType === ConnectionAuthType.BEARER && secrets.bearerToken) headers.set(providerDefinition.credentialHeader ?? 'Authorization', `${providerDefinition.credentialPrefix ?? 'Bearer '}${secrets.bearerToken}`);
    if (row.authType === ConnectionAuthType.BASIC && secrets.username) headers.set('Authorization', `Basic ${Buffer.from(`${secrets.username}:${secrets.password ?? ''}`).toString('base64')}`);
    if (row.authType === ConnectionAuthType.CUSTOM_HEADER && secrets.customHeaders) { const h=JSON.parse(secrets.customHeaders); if (h && typeof h==='object') for (const [k,v] of Object.entries(h)) if (!/^(authorization|cookie|proxy-authorization)$/i.test(k) && typeof v==='string') headers.set(k,v); }
    if (rawHeaders && typeof rawHeaders==='object') for (const [k,v] of Object.entries(rawHeaders as Record<string,unknown>)) if (!/^(authorization|cookie|proxy-authorization)$/i.test(k) && typeof v==='string') headers.set(k,v);
    let body: string|undefined; if (rawBody !== undefined && rawBody !== null) { body=typeof rawBody==='string'?rawBody:JSON.stringify(rawBody); if (!headers.has('content-type')) headers.set('content-type','application/json'); }
    const started=Date.now(); let status='FAILED'; let errorCode: string | null = null; let httpStatus: number | null = null; let attemptsMade=0; const maxRetries=Math.min(Math.max(Number(options.retries ?? 0),0),3);
    const retryable = method === 'GET' || method === 'HEAD' || (Boolean(options.idempotencyKey) && ['PUT','PATCH','DELETE'].includes(method));
    if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey);
    try {
      let response: Response | null = null; let lastError: unknown = null;
      for (let attempt=0; attempt<=maxRetries; attempt++) {
        attemptsMade = attempt + 1;
        try {
          response=await fetch(target,{method,headers,body,redirect:'error',signal:AbortSignal.timeout(15000)});
          httpStatus=response.status;
          // A provider may reject an otherwise fresh access token. Refresh once and replay the same request.
          if (response.status === 401 && row.authType === ConnectionAuthType.OAUTH2) {
            const currentSecret = await this.prisma.connectionSecret.findUnique({ where: { connectionId: id }, select: { refreshToken: true } });
            if (currentSecret?.refreshToken) {
              try {
                const refreshed = await this.refreshOAuthToken(row.provider as OAuthProvider, id, this.crypto.decrypt(currentSecret.refreshToken), row.orgId);
                headers.set('Authorization', `Bearer ${refreshed}`);
                attemptsMade += 1;
                response = await fetch(target,{method,headers,body,redirect:'error',signal:AbortSignal.timeout(15000)});
                httpStatus=response.status;
              } catch {
                errorCode='TOKEN_REFRESH_FAILED';
                throw new ForbiddenException('Connection requires re-authentication');
              }
            } else {
              errorCode='REAUTH_REQUIRED';
            }
          }
          if (response.ok || !retryable || ![408,429,500,502,503,504].includes(response.status) || attempt===maxRetries) break;
        } catch (e) { lastError=e; if (!retryable || attempt===maxRetries) throw e; }
        const retryAfter = response?.headers.get('retry-after');
        const retryAfterMs = retryAfter && /^\d+(?:\.\d+)?$/.test(retryAfter) ? Math.min(5000, Math.max(0, Number(retryAfter)*1000)) : 0;
        await new Promise(r=>setTimeout(r, retryAfterMs || Math.min(250 * 2**attempt, 1500)));
      }
      if (!response) throw (lastError instanceof Error ? lastError : new Error('HTTP request failed'));
      const text=await response.text(); status=response.ok?'SUCCESS':'FAILED'; httpStatus=response.status;
      if (!response.ok && !errorCode) errorCode=`HTTP_${response.status}`;
      const maxBytes = Number.isFinite(Number(options.maxResponseBytes)) ? Math.min(20000, Math.max(256, Math.floor(Number(options.maxResponseBytes)))) : 20000;
      if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new BadRequestException(`HTTP response exceeds the ${maxBytes} byte limit`);
      const clipped=text.slice(0,maxBytes); const mode=String(options.responseMode ?? 'TEXT').toUpperCase();
      let parsed: unknown = clipped;
      if (mode === 'NONE') parsed = undefined;
      else if (mode === 'HEADERS') parsed = Object.fromEntries(response.headers.entries());
      else if (mode === 'JSON') { try { parsed=JSON.parse(clipped); } catch { parsed=clipped; } }
      if (options.jsonPath && parsed && typeof parsed === 'object') { for (const part of options.jsonPath.split('.').filter(Boolean)) { if (parsed && typeof parsed === 'object') parsed=(parsed as any)[part]; else { parsed=undefined; break; } } }
      return { status:response.status, ok:response.ok, headers:Object.fromEntries(response.headers.entries()), body: parsed };
    } catch (error) {
      if (error instanceof ForbiddenException && !errorCode) errorCode='REAUTH_REQUIRED';
      if (error instanceof BadRequestException && !errorCode) errorCode='CONNECTION_REQUEST_FAILED';
      throw error;
    } finally { await this.prisma.connectionUsage.create({data:{id:randomUUID(),orgId:user.org_id,connectionId:id,userId:user.sub,actionType: options.actionType ?? 'function:http_request', workflowId: options.workflowId, runId: options.runId,status,errorCode,httpStatus,attempts: Math.max(1,attemptsMade),durationMs:Date.now()-started}}).catch(()=>undefined); }
  }

  decryptSecret(value: string) { return this.crypto.decrypt(value); }

  async getAccessTokenById(id: string, workflowId?: string): Promise<string | null> {
    const row = await this.prisma.connection.findUnique({ where: { id }, include: { secret: true } });
    if (!row || row.authType !== ConnectionAuthType.OAUTH2 || row.status === ConnectionStatus.DISABLED) return null;
    const secret = row.secret;
    if (!secret?.accessToken) return null;
    const accessToken = this.crypto.decrypt(secret.accessToken);
    if (!row.expiresAt || row.expiresAt.getTime() > Date.now() + 60_000) return accessToken;
    if (!secret.refreshToken) return accessToken;
    return this.refreshOAuthToken(row.provider as OAuthProvider, id, this.crypto.decrypt(secret.refreshToken), row.orgId);
  }

  async getSecretsForExecution(user: AccessTokenPayload, id: string, workflowId?: string) {
    const row = await this.findExecutionVisible(user, id, workflowId);
    if (row.status === ConnectionStatus.DISABLED) throw new ForbiddenException('Connection is disabled');
    if (row.status === ConnectionStatus.REAUTH_REQUIRED) throw new ForbiddenException('Connection requires re-authentication');
    const secret = await this.prisma.connectionSecret.findUnique({ where: { connectionId: id } });
    if (!secret) throw new BadRequestException('Connection credentials are missing');
    const out: DecryptedSecrets = {};
    for (const key of SECRET_FIELDS) if (secret[key]) out[key] = this.crypto.decrypt(secret[key]!);
    if (row.authType === ConnectionAuthType.OAUTH2) { const token = await this.getAccessTokenById(id, workflowId); if (token) out.accessToken = token; }
    await this.prisma.connection.update({ where: { id }, data: { lastUsedAt: new Date() } });
    return { row, secrets: out };
  }

  private async refreshOAuthToken(provider: OAuthProvider, id: string, currentRefreshToken: string, orgId?: string) {
    const definition = await this.resolveProviderDefinition(provider, orgId);
    const cfg = await this.oauthConfig(provider, definition, orgId);
    if (!cfg.clientId || !cfg.clientSecret) throw new BadRequestException('OAuth provider is not configured');
    let payload: any;
    try {
      payload = await this.providerAdapter.refresh({ clientId: cfg.clientId, clientSecret: cfg.clientSecret, callbackUrl: cfg.callbackUrl, authBase: cfg.authBase, tokenUrl: cfg.tokenUrl }, currentRefreshToken);
    } catch {
      await this.prisma.connection.update({ where: { id }, data: { status: ConnectionStatus.REAUTH_REQUIRED, errorCode: 'TOKEN_REFRESH_FAILED', errorMessage: 'OAuth token refresh failed' } }).catch(() => undefined);
      throw new ForbiddenException('Connection requires re-authentication');
    }
    const accessToken = this.crypto.encrypt(payload.access_token);
    const newRefreshToken = typeof payload.refresh_token === 'string' ? this.crypto.encrypt(payload.refresh_token) : undefined;
    const row = await this.prisma.connection.findUnique({ where: { id }, select: { provider: true, authType: true, scope: true } });
    const nextScope = typeof payload.scope === 'string' ? payload.scope.slice(0, 4000) : row?.scope ?? null;
    const driveActivationError = row?.provider === 'google' ? googleDriveActivationError(nextScope) : null;
    await this.prisma.connection.update({ where: { id }, data: { expiresAt: typeof payload.expires_in === 'number' ? new Date(Date.now() + payload.expires_in * 1000) : null, status: ConnectionStatus.ACTIVE, ...(typeof payload.scope === 'string' ? { scope: nextScope } : {}), errorCode: driveActivationError?.errorCode ?? null, errorMessage: driveActivationError?.errorMessage ?? null, secret: { update: { accessToken, ...(newRefreshToken ? { refreshToken: newRefreshToken } : {}) } } } });
    return payload.access_token as string;
  }

  private async providerRevoke(provider: string, token: string, orgId?: string) {
    const definition = await this.resolveProviderDefinition(provider, orgId);
    if (definition.oauthRevokeUrl) {
      const headers: Record<string,string> = { authorization: `Bearer ${token}` };
      await fetch(definition.oauthRevokeUrl, { method: 'POST', headers, redirect: 'error', signal: AbortSignal.timeout(10000) });
      return;
    }
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

  private async providerProbe(provider: string, token: string, baseUrl?: string | null, orgId?: string) {
    const definition = await this.resolveProviderDefinition(provider, orgId);
    return this.providerAdapter.probe(definition, provider, token, baseUrl);
  }

  private async configuredProviderScopes(provider: string, orgId: string, definition: ResolvedProviderDefinition) {
    if (provider.startsWith('custom:') || definition.oauthClientId) return definition.defaultScopes;
    const row = await this.prisma.connectionProviderConfig.findUnique({ where: { orgId_providerKey: { orgId, providerKey: provider } }, select: { enabled: true, scopes: true } });
    if (!row || !row.enabled || !Array.isArray(row.scopes)) return definition.defaultScopes;
    const allowed = new Set(definition.scopes.map((item) => item.value));
    const scopes = row.scopes.map((v) => String(v)).filter((v) => allowed.has(v));
    return scopes.length ? scopes : definition.defaultScopes;
  }

  private assertOAuthProvider(provider: string, definition: ResolvedProviderDefinition) {
    if (!definition.oauth || !definition.oauthAuthUrl || !definition.oauthTokenUrl) throw new BadRequestException('Unsupported OAuth provider');
    if (provider.startsWith('custom:') && (!definition.oauthClientId || !definition.oauthClientSecret)) throw new BadRequestException('Custom OAuth service is missing Client ID or Client Secret');
  }

  private oauthConfigFromEnv(provider: OAuthProvider, definition: ResolvedProviderDefinition) {
    const prefix = definition.oauthEnvPrefix ?? provider.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    const clientIdEnv = `${prefix}_CLIENT_ID`;
    const clientSecretEnv = `${prefix}_CLIENT_SECRET`;
    const clientId = definition.oauthClientId ?? ((this.config.get<string>(clientIdEnv) ?? (provider === 'google' ? this.config.get<string>('GOOGLE_ID') : undefined) ?? this.config.get<string>(`${prefix}_OAUTH_CLIENT_ID`))?.trim());
    const clientSecret = definition.oauthClientSecret ?? ((this.config.get<string>(clientSecretEnv) ?? (provider === 'google' ? this.config.get<string>('GOOGLE_SECRET') : undefined) ?? this.config.get<string>(`${prefix}_OAUTH_CLIENT_SECRET`))?.trim());
    const callbackUrl = (this.config.get<string>(`${prefix}_CONNECTION_CALLBACK_URL`) ?? `${this.config.get<string>('PUBLIC_API_URL') ?? 'http://localhost:3001'}/connections/oauth/${provider}/callback`).trim();
    return { clientId, clientSecret, clientIdEnv, clientSecretEnv, callbackUrl, authBase: definition.oauthAuthUrl!, tokenUrl: definition.oauthTokenUrl! };
  }

  private async oauthConfig(provider: OAuthProvider, definition: ResolvedProviderDefinition, orgId?: string) {
    const envCfg = this.oauthConfigFromEnv(provider, definition);
    if (!orgId || provider.startsWith('custom:') || definition.oauthClientId) return { frontend: this.frontendUrl(), ...envCfg };
    const row = await this.prisma.connectionProviderConfig.findUnique({ where: { orgId_providerKey: { orgId, providerKey: provider } } });
    if (row && !row.enabled) throw new BadRequestException(`${definition.name} provider is disabled by the organization administrator`);
    if (!row) return { frontend: this.frontendUrl(), ...envCfg };
    const tenant = row.tenantId?.trim();
    const authBase = row.authUrl ?? definition.oauthAuthUrl!;
    const tokenUrl = row.tokenUrl ?? definition.oauthTokenUrl!;
    const microsoftAuthBase = provider === 'microsoft' && tenant ? authBase.replace('/common/', `/${encodeURIComponent(tenant)}/`) : authBase;
    const microsoftTokenUrl = provider === 'microsoft' && tenant ? tokenUrl.replace('/common/', `/${encodeURIComponent(tenant)}/`) : tokenUrl;
    return {
      frontend: this.frontendUrl(),
      clientId: row.clientId ?? envCfg.clientId,
      clientSecret: row.clientSecret ? this.crypto.decrypt(row.clientSecret) : envCfg.clientSecret,
      clientIdEnv: envCfg.clientIdEnv,
      clientSecretEnv: envCfg.clientSecretEnv,
      callbackUrl: row.callbackUrl ?? envCfg.callbackUrl,
      authBase: microsoftAuthBase,
      tokenUrl: microsoftTokenUrl,
    };
  }

  /**
   * Browser origin to which an OAuth callback is redirected.
   *
   * Connections OAuth is a backend callback, but the IMKAN login session lives
   * on the Next.js origin.  Redirecting to the Render origin therefore loses
   * the browser's IMKAN token/localStorage and AuthGate sends the user back to
   * /auth/login.  FRONTEND_URL must always be the deployed frontend origin,
   * never PUBLIC_API_URL.
   */
  private frontendUrl() {
    return resolveOAuthFrontendOrigin(this.config.get<string>('FRONTEND_URL'), this.config.get<string>('PUBLIC_API_URL'), process.env.NODE_ENV);
  }

  browserReturnUrl(frontend: string, pathAndQuery: string) {
    return buildOAuthBrowserUrl(frontend, pathAndQuery);
  }
  private hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
  private async readJson(response: Response): Promise<any> { const text = await response.text(); try { return JSON.parse(text); } catch { return { raw: text.slice(0, 1000) }; } }
  private validateSecretInput(authType: ConnectionAuthType | string, input: SecretInput) {
    const normalized = String(authType);
    const keys = Object.keys(input ?? {});
    if (normalized === ConnectionAuthType.OAUTH2 && keys.length) throw new BadRequestException('OAuth credentials must be supplied by the OAuth authorization flow');
    const allowed: Record<string, string[]> = {
      [ConnectionAuthType.API_KEY]: ['apiKey'],
      [ConnectionAuthType.BEARER]: ['bearerToken'],
      [ConnectionAuthType.BASIC]: ['username', 'password'],
      [ConnectionAuthType.CUSTOM_HEADER]: ['customHeaders'],
      [ConnectionAuthType.NONE]: [],
    };
    if (normalized !== ConnectionAuthType.OAUTH2 && normalized !== ConnectionAuthType.NONE) {
      const permitted = allowed[normalized] ?? [];
      const invalid = keys.filter((key) => !permitted.includes(key));
      if (invalid.length) throw new BadRequestException(`Unsupported credential field: ${invalid[0]}`);
    }
    if (normalized === ConnectionAuthType.CUSTOM_HEADER && input.customHeaders) {
      let parsed: unknown;
      try { parsed = JSON.parse(input.customHeaders); } catch { throw new BadRequestException('Custom headers must be valid JSON'); }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new BadRequestException('Custom headers must be a JSON object');
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(key)) throw new BadRequestException(`Invalid custom header name: ${key}`);
        if (/^(authorization|cookie|proxy-authorization)$/i.test(key)) throw new BadRequestException(`Header is not allowed for CUSTOM_HEADER: ${key}`);
        if (typeof value !== 'string' || !value.trim()) throw new BadRequestException(`Invalid value for custom header: ${key}`);
      }
    }
  }

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
    if (host.includes(':')) {
      const h = host.toLowerCase();
      if (h.startsWith('::ffff:')) return this.isPrivateFunctionIp(h.slice(7));
      return h === '::1' || h === '::' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe8') || h.startsWith('fe9') || h.startsWith('fea') || h.startsWith('feb') || h.startsWith('2001:db8');
    }
    const p = host.split('.').map(Number);
    if (p.length !== 4 || p.some(Number.isNaN)) return true;
    return p[0] === 0 || p[0] === 10 || p[0] === 127 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168) || (p[0] === 169 && p[1] === 254) || (p[0] === 100 && p[1] >= 64 && p[1] <= 127) || (p[0] === 198 && p[1] >= 18 && p[1] <= 19);
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
