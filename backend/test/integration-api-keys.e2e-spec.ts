/**
 * Live MySQL e2e coverage for inbound integration API keys (wdk_ tokens).
 * Requires DATABASE_URL pointing at a migrated MySQL database.
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { App } from 'supertest/types';
import { MembershipStatus, OrgRole, PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev_jwt_secret_must_change_in_production_min32chars';

describe('Integration API keys (live MySQL e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let storageRoot: string;
  const ORG_A = randomUUID();
  const ORG_B = randomUUID();
  const ADMIN_A = randomUUID();
  const MEMBER_A = randomUUID();
  const ADMIN_B = randomUUID();
  const tokens = new Map<string, string>();
  let rootA: string;
  let childA: string;
  let outsideA: string;
  let folderB: string;
  let fileOutsideA: string;
  let fileB: string;

  jest.setTimeout(120_000);
  const http = () => request(app.getHttpServer());
  const asUser = (id: string) => `Bearer ${tokens.get(id)}`;
  const asKey = (secret: string) => `Bearer ${secret}`;

  async function seedUser(id: string, orgId: string, role: OrgRole) {
    const email = `${id}@e2e.imkan`;
    await prisma.user.create({ data: { id, email, status: 'ACTIVE' } });
    await prisma.organizationMembership.create({ data: { userId: id, organizationId: orgId, role, status: MembershipStatus.ACTIVE, isPrimary: true } });
    const jti = randomUUID();
    const token = jwt.sign({ sub: id, org_id: orgId, email, role, jti }, JWT_SECRET);
    await prisma.session.create({ data: { id: jti, orgId, userId: id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 3_600_000) } });
    tokens.set(id, token);
  }

  async function uploadAs(auth: string, folderId: string, name: string, body = 'bytes') {
    const payload = Buffer.from(body);
    const req = await http()
      .post('/files/upload-request')
      .set('Authorization', auth)
      .send({ name, folder_id: folderId, size: payload.length, mime_type: 'text/plain', sha256: createHash('sha256').update(payload).digest('hex') });
    if (req.status !== 201) return { status: req.status, body: req.body };
    const url = new URL(req.body.upload_url);
    await http().put(`/storage/objects${url.search}`).send(payload).expect(204);
    const done = await http().post('/files/upload-complete').set('Authorization', auth).send({ upload_id: req.body.upload_id });
    return { status: done.status, body: { ...req.body, complete: done.body } };
  }

  async function createKey(adminId: string, body: Record<string, unknown>) {
    const res = await http().post('/admin/integration-keys').set('Authorization', asUser(adminId)).send(body).expect(201);
    return res.body as { key: { id: string; prefix: string; status: string }; secret: string };
  }

  beforeAll(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'wd-intkeys-'));
    process.env.STORAGE_DRIVER = 'local';
    process.env.STORAGE_LOCAL_ROOT = storageRoot;
    process.env.STORAGE_PUBLIC_BASE_URL = 'http://127.0.0.1:3001';
    process.env.JWT_SECRET = JWT_SECRET;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = new PrismaClient();
    await prisma.organization.create({ data: { id: ORG_A, name: 'Keys Org A' } });
    await prisma.organization.create({ data: { id: ORG_B, name: 'Keys Org B' } });
    await seedUser(ADMIN_A, ORG_A, OrgRole.ADMIN);
    await seedUser(MEMBER_A, ORG_A, OrgRole.MEMBER);
    await seedUser(ADMIN_B, ORG_B, OrgRole.ADMIN);
    rootA = (await prisma.folder.create({ data: { orgId: ORG_A, name: 'OMA', ownerId: ADMIN_A } })).id;
    childA = (await prisma.folder.create({ data: { orgId: ORG_A, name: 'posts', ownerId: ADMIN_A, parentId: rootA } })).id;
    outsideA = (await prisma.folder.create({ data: { orgId: ORG_A, name: 'Finance', ownerId: ADMIN_A } })).id;
    folderB = (await prisma.folder.create({ data: { orgId: ORG_B, name: 'B root', ownerId: ADMIN_B } })).id;
    const a = await uploadAs(asUser(ADMIN_A), outsideA, 'secret.txt');
    expect(a.status).toBe(201);
    fileOutsideA = a.body.file_id;
    const b = await uploadAs(asUser(ADMIN_B), folderB, 'b.txt');
    expect(b.status).toBe(201);
    fileB = b.body.file_id;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await app?.close();
    await rm(storageRoot, { recursive: true, force: true });
  });

  describe('key hashing and admin endpoints', () => {
    it('shows the secret once and stores only its SHA-256 hash', async () => {
      const { key, secret } = await createKey(ADMIN_A, { name: 'Hash check', scopes: ['files:read'] });
      expect(secret).toMatch(/^wdk_[0-9a-f]{12}_[A-Za-z0-9_-]{43}$/);
      expect(secret.startsWith(`${key.prefix}_`)).toBe(true);
      const row = await prisma.integrationApiKey.findUniqueOrThrow({ where: { id: key.id } });
      expect(row.secretHash).toBe(createHash('sha256').update(secret).digest('hex'));
      expect(JSON.stringify(row)).not.toContain(secret.slice(key.prefix.length + 1));
      const list = await http().get('/admin/integration-keys').set('Authorization', asUser(ADMIN_A)).expect(200);
      expect(JSON.stringify(list.body)).not.toContain(secret);
      expect(list.body.find((k: any) => k.id === key.id)).toMatchObject({ prefix: key.prefix, status: 'active', scopes: ['files:read'] });
    });

    it('rejects a valid prefix with a wrong secret', async () => {
      const { key } = await createKey(ADMIN_A, { name: 'Wrong secret', scopes: ['folders:read'] });
      await http().get('/integration/self').set('Authorization', asKey(`${key.prefix}_${'A'.repeat(43)}`)).expect(401);
    });

    it('only admins can manage keys, and keys cannot manage keys', async () => {
      await http().get('/admin/integration-keys').set('Authorization', asUser(MEMBER_A)).expect(403);
      await http().post('/admin/integration-keys').set('Authorization', asUser(MEMBER_A)).send({ name: 'x', scopes: ['files:read'] }).expect(403);
      const { secret } = await createKey(ADMIN_A, { name: 'Self manage', scopes: ['files:read', 'files:write', 'folders:read', 'folders:write'] });
      await http().get('/admin/integration-keys').set('Authorization', asKey(secret)).expect(403);
    });

    it('validates scopes, root folder and expiry on create', async () => {
      const auth = asUser(ADMIN_A);
      await http().post('/admin/integration-keys').set('Authorization', auth).send({ name: 'Bad', scopes: ['admin:all'] }).expect(400);
      await http().post('/admin/integration-keys').set('Authorization', auth).send({ name: 'Bad', scopes: [] }).expect(400);
      await http().post('/admin/integration-keys').set('Authorization', auth).send({ name: 'Bad', scopes: ['files:read'], rootFolderId: folderB }).expect(404);
      await http().post('/admin/integration-keys').set('Authorization', auth).send({ name: 'Bad', scopes: ['files:read'], expiresAt: '2000-01-01' }).expect(400);
    });
  });

  describe('scopes', () => {
    it('enforces the scope required by each route', async () => {
      const { secret } = await createKey(ADMIN_A, { name: 'Read only', scopes: ['folders:read', 'files:read'], rootFolderId: rootA });
      await http().get(`/folders/${rootA}`).set('Authorization', asKey(secret)).expect(200);
      await http().post('/folders/ensure-path').set('Authorization', asKey(secret)).send({ path: 'a/b' }).expect(403);
      const up = await uploadAs(asKey(secret), childA, 'nope.txt');
      expect(up.status).toBe(403);
      const { secret: writeOnly } = await createKey(ADMIN_A, { name: 'Files write only', scopes: ['files:write'], rootFolderId: rootA });
      await http().get(`/folders/${rootA}`).set('Authorization', asKey(writeOnly)).expect(403);
    });

    it('rejects routes that are not opened to integration keys', async () => {
      const { secret } = await createKey(ADMIN_A, { name: 'All scopes', scopes: ['files:read', 'files:write', 'folders:read', 'folders:write'] });
      await http().get('/files/trash').set('Authorization', asKey(secret)).expect(403);
      await http().get('/admin/overview').set('Authorization', asKey(secret)).expect(403);
      await http().get('/integration/self').set('Authorization', asKey(secret)).expect(200);
    });
  });

  describe('root folder confinement', () => {
    let secret: string;
    beforeAll(async () => {
      ({ secret } = await createKey(ADMIN_A, { name: 'OMA rooted', scopes: ['files:read', 'files:write', 'folders:read', 'folders:write'], rootFolderId: rootA }));
    });

    it('full upload, list, details, signed URLs and delete inside the root', async () => {
      const auth = asKey(secret);
      const up = await uploadAs(auth, childA, 'post.png', 'image-bytes');
      expect(up.status).toBe(201);
      const fileId = up.body.file_id;
      const listing = await http().get(`/folders/${childA}`).set('Authorization', auth).expect(200);
      expect(JSON.stringify(listing.body)).toContain(fileId);
      await http().get(`/files/${fileId}/details`).set('Authorization', auth).expect(200);
      const dl = await http().get(`/files/${fileId}/download`).set('Authorization', auth).expect(200);
      const obj = await http().get(`/storage/objects${new URL(dl.body.download_url).search}`).expect(200);
      expect(obj.text).toBe('image-bytes');
      const pv = await http().get(`/files/${fileId}/preview-url`).set('Authorization', auth).expect(200);
      expect(pv.body.preview_url).toContain('/storage/objects?');
      await http().delete(`/files/${fileId}`).set('Authorization', auth).expect(200);
      const self = await http().get('/integration/self').set('Authorization', auth).expect(200);
      expect(self.body).toMatchObject({ rootFolder: { id: rootA }, organization: { id: ORG_A } });
    });

    it('cannot reach folders or files outside the root', async () => {
      const auth = asKey(secret);
      await http().get(`/folders/${outsideA}`).set('Authorization', auth).expect(404);
      await http().get(`/files/${fileOutsideA}/details`).set('Authorization', auth).expect(404);
      await http().get(`/files/${fileOutsideA}/download`).set('Authorization', auth).expect(404);
      await http().delete(`/files/${fileOutsideA}`).set('Authorization', auth).expect(404);
      expect((await uploadAs(auth, outsideA, 'escape.txt')).status).toBe(404);
      await http().post('/folders').set('Authorization', auth).send({ name: 'escape', parentId: outsideA }).expect(404);
      await http().post('/folders').set('Authorization', auth).send({ name: 'top-level' }).expect(403);
      await http().get('/folders').set('Authorization', auth).expect(403);
      await http().delete(`/folders/${rootA}`).set('Authorization', auth).expect(403);
      await http().post('/folders/ensure-path').set('Authorization', auth).send({ path: 'x', parentId: outsideA }).expect(404);
      const noFolder = await http().post('/files/upload-request').set('Authorization', auth).send({ name: 'n.txt', size: 1, mime_type: 'text/plain', sha256: 'a'.repeat(64) });
      expect(noFolder.status).toBe(403);
    });

    it('records an audit entry and lastUsedAt when a key is used', async () => {
      const row = await prisma.integrationApiKey.findFirstOrThrow({ where: { orgId: ORG_A, name: 'OMA rooted' } });
      await new Promise((r) => setTimeout(r, 300));
      const fresh = await prisma.integrationApiKey.findUniqueOrThrow({ where: { id: row.id } });
      expect(fresh.lastUsedAt).not.toBeNull();
      const audits = await prisma.auditLog.count({ where: { orgId: ORG_A, action: 'INTEGRATION_KEY_USED', resourceId: row.id } });
      expect(audits).toBeGreaterThan(0);
    });
  });

  describe('revocation and expiry', () => {
    it('a revoked key stops working immediately', async () => {
      const { key, secret } = await createKey(ADMIN_A, { name: 'To revoke', scopes: ['folders:read'] });
      await http().get('/integration/self').set('Authorization', asKey(secret)).expect(200);
      const rv = await http().post(`/admin/integration-keys/${key.id}/revoke`).set('Authorization', asUser(ADMIN_A)).expect(201);
      expect(rv.body.status).toBe('revoked');
      await http().get('/integration/self').set('Authorization', asKey(secret)).expect(401);
    });

    it('an expired key is rejected', async () => {
      const { key, secret } = await createKey(ADMIN_A, { name: 'Expiring', scopes: ['folders:read'], expiresAt: new Date(Date.now() + 60_000).toISOString() });
      await http().get('/integration/self').set('Authorization', asKey(secret)).expect(200);
      await prisma.integrationApiKey.update({ where: { id: key.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      await http().get('/integration/self').set('Authorization', asKey(secret)).expect(401);
    });

    it('a key stops working when its creator leaves the organization', async () => {
      const { secret } = await createKey(ADMIN_A, { name: 'Creator check', scopes: ['folders:read'] });
      await prisma.organizationMembership.updateMany({ where: { userId: ADMIN_A, organizationId: ORG_A }, data: { status: MembershipStatus.SUSPENDED } });
      try {
        await http().get('/integration/self').set('Authorization', asKey(secret)).expect(401);
      } finally {
        await prisma.organizationMembership.updateMany({ where: { userId: ADMIN_A, organizationId: ORG_A }, data: { status: MembershipStatus.ACTIVE } });
      }
    });
  });

  describe('cross-organization isolation', () => {
    it('an org-wide key from org A cannot touch org B', async () => {
      const { secret } = await createKey(ADMIN_A, { name: 'Org wide', scopes: ['files:read', 'files:write', 'folders:read', 'folders:write'] });
      const auth = asKey(secret);
      await http().get(`/folders/${folderB}`).set('Authorization', auth).expect(404);
      await http().get(`/files/${fileB}/details`).set('Authorization', auth).expect(404);
      await http().get(`/files/${fileB}/download`).set('Authorization', auth).expect(404);
      await http().delete(`/files/${fileB}`).set('Authorization', auth).expect(404);
      expect((await uploadAs(auth, folderB, 'cross.txt')).status).toBe(404);
      await http().post('/folders/ensure-path').set('Authorization', auth).send({ path: 'x', parentId: folderB }).expect(404);
    });

    it('admins only see and revoke keys of their own organization', async () => {
      const { key } = await createKey(ADMIN_A, { name: 'A private', scopes: ['files:read'] });
      const listB = await http().get('/admin/integration-keys').set('Authorization', asUser(ADMIN_B)).expect(200);
      expect(listB.body.some((k: any) => k.id === key.id)).toBe(false);
      await http().post(`/admin/integration-keys/${key.id}/revoke`).set('Authorization', asUser(ADMIN_B)).expect(404);
    });
  });

  describe('POST /folders/ensure-path', () => {
    let secret: string;
    beforeAll(async () => {
      ({ secret } = await createKey(ADMIN_A, { name: 'Ensure path', scopes: ['folders:read', 'folders:write'], rootFolderId: rootA }));
    });

    it('creates the path once and returns the same folder id afterwards', async () => {
      const auth = asKey(secret);
      const first = await http().post('/folders/ensure-path').set('Authorization', auth).send({ path: 'tenant-1/brand-1/posts' }).expect(201);
      expect(first.body.created).toBe(true);
      expect(first.body.path).toHaveLength(3);
      const second = await http().post('/folders/ensure-path').set('Authorization', auth).send({ path: '/tenant-1//brand-1/posts/' }).expect(201);
      expect(second.body.folderId).toBe(first.body.folderId);
      expect(second.body.created).toBe(false);
      const top = await prisma.folder.findUniqueOrThrow({ where: { id: first.body.path[0].id } });
      expect(top.parentId).toBe(rootA);
    });

    it('stays idempotent under concurrent calls', async () => {
      const auth = asKey(secret);
      const results = await Promise.all(Array.from({ length: 6 }, () => http().post('/folders/ensure-path').set('Authorization', auth).send({ path: 'tenant-2/brand-x/videos' })));
      results.forEach((r) => expect(r.status).toBe(201));
      expect(new Set(results.map((r) => r.body.folderId)).size).toBe(1);
      const tenantFolders = await prisma.folder.count({ where: { orgId: ORG_A, parentId: rootA, name: 'tenant-2' } });
      expect(tenantFolders).toBe(1);
    });

    it('rejects traversal and invalid names', async () => {
      const auth = asKey(secret);
      await http().post('/folders/ensure-path').set('Authorization', auth).send({ path: '../escape' }).expect(400);
      await http().post('/folders/ensure-path').set('Authorization', auth).send({ path: 'a/<b>' }).expect(400);
      await http().post('/folders/ensure-path').set('Authorization', auth).send({ path: '' }).expect(400);
    });
  });

  describe('rate limiting', () => {
    it('returns 429 once the per-key limit is reached', async () => {
      const { secret } = await createKey(ADMIN_A, { name: 'Rate limited', scopes: ['folders:read'] });
      process.env.INTEGRATION_KEY_RATE_LIMIT_PER_MINUTE = '3';
      try {
        for (let i = 0; i < 3; i++) await http().get('/integration/self').set('Authorization', asKey(secret)).expect(200);
        await http().get('/integration/self').set('Authorization', asKey(secret)).expect(429);
      } finally {
        delete process.env.INTEGRATION_KEY_RATE_LIMIT_PER_MINUTE;
      }
    });
  });
});
