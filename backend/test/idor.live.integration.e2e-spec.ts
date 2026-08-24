import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OrgRole, PrismaClient } from '@prisma/client';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

const JWT_SECRET =
  process.env.JWT_SECRET ??
  'dev_jwt_secret_must_change_in_production_min32chars';

type TenantUser = {
  id: string;
  orgId: string;
  email: string;
  role: OrgRole;
};

type TenantFixture = {
  orgId: string;
  admin: TenantUser;
};

function sign(user: TenantUser): string {
  return jwt.sign(
    { sub: user.id, org_id: user.orgId, email: user.email, role: user.role },
    JWT_SECRET,
  );
}

function objectPathFromSignedUrl(signedUrl: string): string {
  const url = new URL(signedUrl);
  return `/storage/objects${url.search}`;
}

describe('IDOR live integration (cross-tenant, MySQL)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let storageRoot: string;
  let tenantA: TenantFixture;
  let tenantB: TenantFixture;
  let folderAId: string;
  let fileAId: string;
  let uploadAId: string;
  let trashedFileAId: string;
  let shareLinkToken: string;
  const runTag = `idor-live-${Date.now()}`;

  jest.setTimeout(90_000);

  beforeAll(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'workdrive-idor-live-'));
    process.env.STORAGE_DRIVER = 'local';
    process.env.STORAGE_LOCAL_ROOT = storageRoot;
    process.env.STORAGE_PUBLIC_BASE_URL = 'http://127.0.0.1:3001';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.enableCors({ origin: true });
    await app.init();

    prisma = new PrismaClient();

    tenantA = await createTenant(`${runTag}-A`);
    tenantB = await createTenant(`${runTag}-B`);

    const tokenA = sign(tenantA.admin);
    const folderRes = await request(app.getHttpServer())
      .post('/folders')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: `${runTag}-folder` })
      .expect(201);
    folderAId = folderRes.body.id as string;

    const payload = Buffer.from(`${runTag}-bytes`);
    const sha256 = createHash('sha256').update(payload).digest('hex');
    const uploadRequest = await request(app.getHttpServer())
      .post('/files/upload-request')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: `${runTag}.txt`,
        folder_id: folderAId,
        size: payload.length,
        mime_type: 'text/plain',
        sha256,
      })
      .expect(201);

    fileAId = uploadRequest.body.file_id as string;
    uploadAId = uploadRequest.body.upload_id as string;

    await request(app.getHttpServer())
      .put(objectPathFromSignedUrl(uploadRequest.body.upload_url as string))
      .send(payload)
      .expect(204);

    await request(app.getHttpServer())
      .post('/files/upload-complete')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ upload_id: uploadAId })
      .expect(201);

    const trashPayload = Buffer.from(`${runTag}-trash`);
    const trashSha = createHash('sha256').update(trashPayload).digest('hex');
    const trashUpload = await request(app.getHttpServer())
      .post('/files/upload-request')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: `${runTag}-trash.txt`,
        folder_id: folderAId,
        size: trashPayload.length,
        mime_type: 'text/plain',
        sha256: trashSha,
      })
      .expect(201);

    trashedFileAId = trashUpload.body.file_id as string;
    await request(app.getHttpServer())
      .put(objectPathFromSignedUrl(trashUpload.body.upload_url as string))
      .send(trashPayload)
      .expect(204);
    await request(app.getHttpServer())
      .post('/files/upload-complete')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ upload_id: trashUpload.body.upload_id })
      .expect(201);
    await request(app.getHttpServer())
      .delete(`/files/${trashedFileAId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    const shareRes = await request(app.getHttpServer())
      .post('/shares')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        resource_type: 'FILE',
        resource_id: fileAId,
        can_download: true,
      })
      .expect(201);

    shareLinkToken = String(shareRes.body.link_url).split('/').pop() ?? '';
    expect(shareLinkToken.length).toBeGreaterThan(8);
  });

  afterAll(async () => {
    await cleanupTenant(tenantA.orgId);
    await cleanupTenant(tenantB.orgId);
    await prisma.$disconnect();
    await app.close();
    await rm(storageRoot, { recursive: true, force: true });
  });

  async function createTenant(label: string): Promise<TenantFixture> {
    const orgId = randomUUID();
    const adminId = randomUUID();
    await prisma.organization.create({
      data: { id: orgId, name: label },
    });
    await prisma.user.create({
      data: {
        id: adminId,
        orgId,
        email: `${label}@example.imkan`,
        role: OrgRole.ADMIN,
      },
    });
    return {
      orgId,
      admin: {
        id: adminId,
        orgId,
        email: `${label}@example.imkan`,
        role: OrgRole.ADMIN,
      },
    };
  }

  async function cleanupTenant(orgId: string): Promise<void> {
    const files = await prisma.file.findMany({
      where: { orgId },
      select: { id: true },
    });
    const fileIds = files.map((file) => file.id);
    const folders = await prisma.folder.findMany({
      where: { orgId },
      select: { id: true },
    });
    const folderIds = folders.map((folder) => folder.id);

    if (fileIds.length > 0) {
      await prisma.share.deleteMany({
        where: { orgId, resourceId: { in: fileIds } },
      });
      await prisma.fileVersion.deleteMany({
        where: { orgId, fileId: { in: fileIds } },
      });
      await prisma.auditLog.deleteMany({
        where: { orgId, resourceId: { in: fileIds } },
      });
      await prisma.file.deleteMany({ where: { orgId, id: { in: fileIds } } });
    }
    if (folderIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { orgId, resourceId: { in: folderIds } },
      });
      await prisma.folder.deleteMany({
        where: { orgId, id: { in: folderIds } },
      });
    }
    await prisma.share.deleteMany({ where: { orgId } });
    await prisma.auditLog.deleteMany({ where: { orgId } });
    await prisma.user.deleteMany({ where: { orgId } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
  }

  describe('Tenant B is denied cross-tenant access to Tenant A resources', () => {
    const tokenB = () => sign(tenantB.admin);

    it('cannot read Tenant A folder by id', async () => {
      await request(app.getHttpServer())
        .get(`/folders/${folderAId}`)
        .set('Authorization', `Bearer ${tokenB()}`)
        .expect(404);
    });

    it('cannot rename Tenant A folder', async () => {
      await request(app.getHttpServer())
        .patch(`/folders/${folderAId}`)
        .set('Authorization', `Bearer ${tokenB()}`)
        .send({ name: 'hijacked-folder' })
        .expect(404);
    });

    it('cannot delete Tenant A folder', async () => {
      await request(app.getHttpServer())
        .delete(`/folders/${folderAId}`)
        .set('Authorization', `Bearer ${tokenB()}`)
        .expect(404);
    });

    it('cannot download Tenant A file', async () => {
      await request(app.getHttpServer())
        .get(`/files/${fileAId}/download`)
        .set('Authorization', `Bearer ${tokenB()}`)
        .expect(404);
    });

    it('cannot rename Tenant A file', async () => {
      await request(app.getHttpServer())
        .patch(`/files/${fileAId}`)
        .set('Authorization', `Bearer ${tokenB()}`)
        .send({ name: 'hijacked.txt' })
        .expect(404);
    });

    it('cannot trash Tenant A file', async () => {
      await request(app.getHttpServer())
        .delete(`/files/${fileAId}`)
        .set('Authorization', `Bearer ${tokenB()}`)
        .expect(404);
    });

    it('cannot restore Tenant A trashed file', async () => {
      await request(app.getHttpServer())
        .post(`/files/${trashedFileAId}/restore`)
        .set('Authorization', `Bearer ${tokenB()}`)
        .expect(404);
    });

    it('cannot upload into Tenant A folder', async () => {
      await request(app.getHttpServer())
        .post('/files/upload-request')
        .set('Authorization', `Bearer ${tokenB()}`)
        .send({
          name: 'evil.txt',
          folder_id: folderAId,
          size: 4,
          mime_type: 'text/plain',
          sha256: createHash('sha256').update('evil').digest('hex'),
        })
        .expect(404);
    });

    it('cannot complete Tenant A upload', async () => {
      await request(app.getHttpServer())
        .post('/files/upload-complete')
        .set('Authorization', `Bearer ${tokenB()}`)
        .send({ upload_id: uploadAId })
        .expect(404);
    });

    it('cannot create a share for Tenant A file', async () => {
      await request(app.getHttpServer())
        .post('/shares')
        .set('Authorization', `Bearer ${tokenB()}`)
        .send({
          resource_type: 'FILE',
          resource_id: fileAId,
          can_download: true,
        })
        .expect(404);
    });

    it('does not list Tenant A folder in root listing', async () => {
      const response = await request(app.getHttpServer())
        .get('/folders')
        .set('Authorization', `Bearer ${tokenB()}`)
        .expect(200);
      const folderIds = (response.body.folders as Array<{ id: string }>).map(
        (folder) => folder.id,
      );
      expect(folderIds).not.toContain(folderAId);
    });

    it('does not find Tenant A file via search', async () => {
      const response = await request(app.getHttpServer())
        .get('/search')
        .query({ q: runTag })
        .set('Authorization', `Bearer ${tokenB()}`)
        .expect(200);
      const fileIds = (
        response.body.files as Array<{ id: string }> | undefined
      )?.map((file) => file.id);
      expect(fileIds ?? []).not.toContain(fileAId);
    });
  });

  describe('Tenant A retains legitimate same-tenant access', () => {
    const tokenA = () => sign(tenantA.admin);

    it('reads its own folder by id', async () => {
      const response = await request(app.getHttpServer())
        .get(`/folders/${folderAId}`)
        .set('Authorization', `Bearer ${tokenA()}`)
        .expect(200);
      expect(response.body.id).toBe(folderAId);
    });

    it('downloads its own file', async () => {
      const response = await request(app.getHttpServer())
        .get(`/files/${fileAId}/download`)
        .set('Authorization', `Bearer ${tokenA()}`)
        .expect(200);
      expect(response.body.download_url).toMatch(/\/storage\/objects\?token=/);
    });

    it('renames its own file', async () => {
      await request(app.getHttpServer())
        .patch(`/files/${fileAId}`)
        .set('Authorization', `Bearer ${tokenA()}`)
        .send({ name: `${runTag}-renamed.txt` })
        .expect(200);
    });

    it('verifies its own public share link', async () => {
      const response = await request(app.getHttpServer())
        .post('/share/public')
        .send({ token: shareLinkToken })
        .expect(201);
      expect(response.body.resource_id).toBe(fileAId);
      expect(response.body.can_download).toBe(true);
    });
  });

  describe('Client cannot override tenant context with orgId', () => {
    const tokenA = () => sign(tenantA.admin);

    it('rejects orgId on upload-request', async () => {
      await request(app.getHttpServer())
        .post('/files/upload-request')
        .set('Authorization', `Bearer ${tokenA()}`)
        .send({
          name: 'blocked.txt',
          folder_id: folderAId,
          size: 4,
          mime_type: 'text/plain',
          sha256: createHash('sha256').update('noop').digest('hex'),
          orgId: tenantB.orgId,
        })
        .expect(403);
    });

    it('rejects org_id on upload-complete', async () => {
      await request(app.getHttpServer())
        .post('/files/upload-complete')
        .set('Authorization', `Bearer ${tokenA()}`)
        .send({ upload_id: uploadAId, org_id: tenantB.orgId })
        .expect(403);
    });
  });
});
