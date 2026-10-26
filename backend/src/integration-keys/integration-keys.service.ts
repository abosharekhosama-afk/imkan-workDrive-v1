import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { MembershipStatus, OrgRole } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import type { AccessTokenPayload } from '../auth/jwt.types';
import type { IntegrationKeyAccessRule } from './integration-key-access.decorator';
import {
  INTEGRATION_KEY_SCOPES,
  IntegrationKeyScope,
  generateIntegrationKey,
  normalizeScopes,
  parseIntegrationKeyPrefix,
  verifyIntegrationKeyHash,
} from './integration-key.crypto';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_FOLDER_DEPTH = 64;

export type IntegrationKeyView = {
  id: string;
  name: string;
  prefix: string;
  scopes: IntegrationKeyScope[];
  rootFolder: { id: string; name: string } | null;
  createdBy: { id: string; name: string | null; email: string } | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date | null;
  status: 'active' | 'revoked' | 'expired';
};

export type CreateIntegrationKeyInput = {
  name: string;
  scopes: IntegrationKeyScope[];
  rootFolderId: string | null;
  expiresAt: Date | null;
};

export function parseCreateIntegrationKey(body: unknown, now = new Date()): CreateIntegrationKeyInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Invalid payload');
  const r = body as Record<string, unknown>;
  const name = typeof r.name === 'string' ? r.name.trim() : '';
  if (name.length < 1 || name.length > 120) throw new BadRequestException('Name must be between 1 and 120 characters');
  if (!Array.isArray(r.scopes) || r.scopes.some((s) => typeof s !== 'string' || !(INTEGRATION_KEY_SCOPES as readonly string[]).includes(s))) {
    throw new BadRequestException(`scopes must be a subset of ${INTEGRATION_KEY_SCOPES.join(', ')}`);
  }
  const scopes = normalizeScopes(r.scopes);
  if (scopes.length === 0) throw new BadRequestException('At least one scope is required');
  const rawRoot = r.rootFolderId ?? r.root_folder_id ?? null;
  if (rawRoot !== null && rawRoot !== '' && (typeof rawRoot !== 'string' || !UUID_RE.test(rawRoot))) throw new BadRequestException('Invalid rootFolderId');
  const rawExpires = r.expiresAt ?? r.expires_at ?? null;
  let expiresAt: Date | null = null;
  if (rawExpires !== null && rawExpires !== '') {
    expiresAt = new Date(String(rawExpires));
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()) throw new BadRequestException('expiresAt must be a future date');
  }
  return { name, scopes, rootFolderId: rawRoot ? String(rawRoot) : null, expiresAt };
}

type KeyRow = {
  id: string;
  orgId: string;
  name: string;
  prefix: string;
  secretHash: string;
  scopes: unknown;
  rootFolderId: string | null;
  createdById: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date | null;
};

@Injectable()
export class IntegrationKeysService {
  private readonly buckets = new Map<string, number[]>();

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------- admin

  private assertAdmin(user: AccessTokenPayload) {
    if (user.integrationKey) throw new ForbiddenException('Integration keys cannot manage integration keys');
    if (user.role !== OrgRole.ADMIN && user.role !== OrgRole.SUPER_ADMIN) throw new ForbiddenException('Admin access required');
  }

  private async toView(rows: KeyRow[], now = new Date()): Promise<IntegrationKeyView[]> {
    const folderIds = [...new Set(rows.map((r) => r.rootFolderId).filter((v): v is string => Boolean(v)))];
    const userIds = [...new Set(rows.map((r) => r.createdById))];
    const [folders, users] = await Promise.all([
      folderIds.length ? this.prisma.folder.findMany({ where: { id: { in: folderIds } }, select: { id: true, name: true } }) : [],
      userIds.length ? this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }) : [],
    ]);
    const folderMap = new Map(folders.map((f) => [f.id, f]));
    const userMap = new Map(users.map((u) => [u.id, u]));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      prefix: r.prefix,
      scopes: normalizeScopes(r.scopes),
      rootFolder: r.rootFolderId ? folderMap.get(r.rootFolderId) ?? { id: r.rootFolderId, name: '' } : null,
      createdBy: userMap.get(r.createdById) ?? null,
      createdAt: r.createdAt,
      lastUsedAt: r.lastUsedAt,
      revokedAt: r.revokedAt,
      expiresAt: r.expiresAt,
      status: r.revokedAt ? 'revoked' : r.expiresAt && r.expiresAt.getTime() <= now.getTime() ? 'expired' : 'active',
    }));
  }

  async list(user: AccessTokenPayload): Promise<IntegrationKeyView[]> {
    this.assertAdmin(user);
    const rows = await this.prisma.integrationApiKey.findMany({ where: { orgId: user.org_id }, orderBy: { createdAt: 'desc' } });
    return this.toView(rows);
  }

  async create(user: AccessTokenPayload, body: unknown): Promise<{ key: IntegrationKeyView; secret: string }> {
    this.assertAdmin(user);
    const input = parseCreateIntegrationKey(body);
    if (input.rootFolderId) {
      const folder = await this.prisma.folder.findFirst({ where: { id: input.rootFolderId, orgId: user.org_id }, select: { id: true } });
      if (!folder) throw new NotFoundException('Folder not found');
    }
    const generated = generateIntegrationKey();
    const row = await this.prisma.integrationApiKey.create({
      data: {
        orgId: user.org_id,
        name: input.name,
        prefix: generated.prefix,
        secretHash: generated.secretHash,
        scopes: input.scopes,
        rootFolderId: input.rootFolderId,
        expiresAt: input.expiresAt,
        createdById: user.sub,
      },
    });
    await this.prisma.auditLog.create({
      data: { orgId: user.org_id, actorId: user.sub, action: 'INTEGRATION_KEY_CREATED', resourceType: 'INTEGRATION_API_KEY', resourceId: row.id, metadata: { name: row.name, prefix: row.prefix, scopes: input.scopes, rootFolderId: input.rootFolderId } },
    });
    const [key] = await this.toView([row]);
    return { key, secret: generated.token };
  }

  async revoke(user: AccessTokenPayload, id: string): Promise<IntegrationKeyView> {
    this.assertAdmin(user);
    const row = await this.prisma.integrationApiKey.findFirst({ where: { id, orgId: user.org_id } });
    if (!row) throw new NotFoundException('Key not found');
    const updated = row.revokedAt ? row : await this.prisma.integrationApiKey.update({ where: { id }, data: { revokedAt: new Date() } });
    if (!row.revokedAt) {
      await this.prisma.auditLog.create({
        data: { orgId: user.org_id, actorId: user.sub, action: 'INTEGRATION_KEY_REVOKED', resourceType: 'INTEGRATION_API_KEY', resourceId: row.id, metadata: { prefix: row.prefix } },
      });
    }
    const [key] = await this.toView([updated]);
    return key;
  }

  async describeSelf(user: AccessTokenPayload) {
    const ctx = user.integrationKey;
    if (!ctx) throw new ForbiddenException('This endpoint requires an integration key');
    const root = ctx.rootFolderId ? await this.prisma.folder.findFirst({ where: { id: ctx.rootFolderId }, select: { id: true, name: true } }) : null;
    const org = await this.prisma.organization.findUnique({ where: { id: user.org_id }, select: { id: true, name: true } });
    return { keyId: ctx.id, prefix: ctx.prefix, organization: org, scopes: ctx.scopes, rootFolder: root };
  }

  // --------------------------------------------------------- authentication

  private rateLimit(keyId: string, now = Date.now()) {
    const limit = Math.max(1, Number(process.env.INTEGRATION_KEY_RATE_LIMIT_PER_MINUTE ?? 600) || 600);
    const windowStart = now - 60_000;
    const hits = (this.buckets.get(keyId) ?? []).filter((t) => t > windowStart);
    if (hits.length >= limit) {
      this.buckets.set(keyId, hits);
      throw new HttpException('Integration key rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }
    hits.push(now);
    this.buckets.set(keyId, hits);
    if (this.buckets.size > 10_000) {
      for (const [k, v] of this.buckets) if (!v.some((t) => t > windowStart)) this.buckets.delete(k);
    }
  }

  /**
   * Authenticates a `wdk_` token for a route, enforces the route's scope,
   * confines the target resource to the key's root folder subtree and returns
   * the service principal to attach to the request.
   */
  async authenticate(token: string, rule: IntegrationKeyAccessRule | undefined, request: Request): Promise<AccessTokenPayload> {
    const prefix = parseIntegrationKeyPrefix(token);
    if (!prefix) throw new UnauthorizedException('Invalid integration key');
    const key = await this.prisma.integrationApiKey.findUnique({ where: { prefix } });
    if (!key || !verifyIntegrationKeyHash(token, key.secretHash)) throw new UnauthorizedException('Invalid integration key');
    if (key.revokedAt) throw new UnauthorizedException('Integration key has been revoked');
    if (key.expiresAt && key.expiresAt.getTime() <= Date.now()) throw new UnauthorizedException('Integration key has expired');

    if (!rule) throw new ForbiddenException('This endpoint is not available to integration keys');
    const scopes = normalizeScopes(key.scopes);
    if (rule.scope && !scopes.includes(rule.scope)) throw new ForbiddenException(`Integration key is missing the ${rule.scope} scope`);

    this.rateLimit(key.id);

    const membership = await this.prisma.organizationMembership.findFirst({
      where: { userId: key.createdById, organizationId: key.orgId, status: MembershipStatus.ACTIVE },
      select: { id: true, role: true, status: true, isTemplateAdmin: true },
    });
    if (!membership) throw new UnauthorizedException('The member who created this integration key is no longer active');
    const creator = await this.prisma.user.findUnique({ where: { id: key.createdById }, select: { email: true } });

    if (key.rootFolderId) {
      const root = await this.prisma.folder.findFirst({ where: { id: key.rootFolderId, orgId: key.orgId }, select: { id: true } });
      if (!root) throw new ForbiddenException('The root folder of this integration key no longer exists');
    }
    await this.assertTargetAllowed(key, rule, request);

    const principal: AccessTokenPayload = {
      sub: key.createdById,
      org_id: key.orgId,
      email: creator?.email ?? '',
      role: membership.role,
      membershipId: membership.id,
      membershipStatus: membership.status,
      templateAdmin: false,
      integrationKey: { id: key.id, prefix: key.prefix, scopes, rootFolderId: key.rootFolderId },
    };

    const now = new Date();
    void this.prisma.integrationApiKey.update({ where: { id: key.id }, data: { lastUsedAt: now } }).catch(() => undefined);
    void this.prisma.auditLog
      .create({
        data: {
          orgId: key.orgId,
          actorId: key.createdById,
          action: 'INTEGRATION_KEY_USED',
          resourceType: 'INTEGRATION_API_KEY',
          resourceId: key.id,
          ipAddress: request.ip ?? null,
          metadata: { prefix: key.prefix, method: request.method, path: (request.originalUrl ?? request.url ?? '').split('?')[0].slice(0, 300), scope: rule.scope },
        },
      })
      .catch(() => undefined);
    return principal;
  }

  // ----------------------------------------------------------- confinement

  /** True when `folderId` is `rootId` or one of its descendants, inside `orgId`. */
  async isFolderWithinRoot(orgId: string, folderId: string, rootId: string | null): Promise<boolean> {
    let current: string | null = folderId;
    for (let depth = 0; current && depth <= MAX_FOLDER_DEPTH; depth++) {
      const folder: { id: string; orgId: string; parentId: string | null } | null = await this.prisma.folder.findUnique({
        where: { id: current },
        select: { id: true, orgId: true, parentId: true },
      });
      if (!folder || folder.orgId !== orgId) return false;
      if (!rootId || folder.id === rootId) return true;
      current = folder.parentId;
    }
    return false;
  }

  private async assertFolder(key: KeyRow, folderId: string | null | undefined) {
    if (!folderId) {
      if (key.rootFolderId) throw new ForbiddenException('A folder inside the integration key root folder is required');
      return;
    }
    if (!(await this.isFolderWithinRoot(key.orgId, folderId, key.rootFolderId))) throw new NotFoundException('Folder not found');
  }

  private async assertFile(key: KeyRow, fileId: string | null | undefined) {
    if (!fileId) throw new NotFoundException('File not found');
    const file = await this.prisma.file.findUnique({ where: { id: fileId }, select: { orgId: true, folderId: true } });
    if (!file || file.orgId !== key.orgId) throw new NotFoundException('File not found');
    if (key.rootFolderId && (!file.folderId || !(await this.isFolderWithinRoot(key.orgId, file.folderId, key.rootFolderId)))) {
      throw new NotFoundException('File not found');
    }
  }

  async assertTargetAllowed(key: KeyRow, rule: IntegrationKeyAccessRule, request: Pick<Request, 'params' | 'body'>) {
    const params = (request.params ?? {}) as Record<string, string>;
    const body = (request.body && typeof request.body === 'object' ? request.body : {}) as Record<string, unknown>;
    const t = rule.target;
    switch (t.kind) {
      case 'none':
        return;
      case 'unrootedOnly':
        if (key.rootFolderId) throw new ForbiddenException('This integration key is limited to its root folder; list it with GET /folders/{rootFolderId}');
        return;
      case 'folderParam':
        if (t.excludeRoot && key.rootFolderId && params[t.param] === key.rootFolderId) {
          throw new ForbiddenException('An integration key cannot modify its own root folder');
        }
        return this.assertFolder(key, params[t.param]);
      case 'fileParam':
        return this.assertFile(key, params[t.param]);
      case 'bodyFolder': {
        const raw = t.fields.map((f) => body[f]).find((v) => v !== undefined && v !== null && v !== '');
        if (raw !== undefined && typeof raw !== 'string') throw new BadRequestException('Invalid folder id');
        return this.assertFolder(key, raw as string | undefined);
      }
      case 'uploadVersionBody': {
        const id = body[t.field];
        if (typeof id !== 'string' || !UUID_RE.test(id)) throw new BadRequestException(`Invalid ${t.field}`);
        const version = await this.prisma.fileVersion.findUnique({ where: { id }, select: { fileId: true } });
        return this.assertFile(key, version?.fileId);
      }
      case 'uploadSessionParam': {
        const id = params[t.param];
        if (typeof id !== 'string' || !UUID_RE.test(id)) throw new NotFoundException('Upload session not found');
        const session = await this.prisma.uploadSession.findUnique({ where: { id }, select: { fileId: true, orgId: true } });
        if (!session || session.orgId !== key.orgId) throw new NotFoundException('Upload session not found');
        return this.assertFile(key, session.fileId);
      }
    }
  }
}
