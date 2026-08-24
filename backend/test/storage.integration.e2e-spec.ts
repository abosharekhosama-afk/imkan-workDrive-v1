import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { SEED_ORGANIZATION, SEED_USERS } from '../src/auth/seed-data';

const JWT_SECRET =
  process.env.JWT_SECRET ??
  'dev_jwt_secret_must_change_in_production_min32chars';
const ORG_A = SEED_ORGANIZATION.id;
const ADMIN = SEED_USERS[0];

function sign(user: (typeof SEED_USERS)[number]): string {
  return jwt.sign(
    { sub: user.id, org_id: ORG_A, email: user.email, role: user.role },
    JWT_SECRET,
  );
}

describe('Storage integration (local disk, e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let storageRoot: string;
  let folderId: string;

  jest.setTimeout(60_000);

  beforeAll(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'workdrive-e2e-storage-'));
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
    const folder = await prisma.folder.create({
      data: {
        orgId: ORG_A,
        name: `storage-e2e-${Date.now()}`,
        ownerId: ADMIN.id,
      },
    });
    folderId = folder.id;
  });

  afterAll(async () => {
    const files = await prisma.file.findMany({
      where: { folderId },
      select: { id: true },
    });
    const fileIds = files.map((file) => file.id);
    if (fileIds.length > 0) {
      await prisma.share.deleteMany({ where: { resourceId: { in: fileIds } } });
      await prisma.fileVersion.deleteMany({
        where: { fileId: { in: fileIds } },
      });
      await prisma.auditLog.deleteMany({
        where: { resourceId: { in: fileIds } },
      });
      await prisma.file.deleteMany({ where: { id: { in: fileIds } } });
    }
    await prisma.folder.deleteMany({ where: { id: folderId } });
    await prisma.$disconnect();
    await app.close();
    await rm(storageRoot, { recursive: true, force: true });
  });

  function objectPathFromSignedUrl(signedUrl: string): string {
    const url = new URL(signedUrl);
    return `/storage/objects${url.search}`;
  }

  it('uploads bytes to local disk and downloads them back', async () => {
    const token = sign(ADMIN);
    const payload = Buffer.from('integration-bytes');
    const sha256 = createHash('sha256').update(payload).digest('hex');

    const uploadRequest = await request(app.getHttpServer())
      .post('/files/upload-request')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'integration.txt',
        folder_id: folderId,
        size: payload.length,
        mime_type: 'text/plain',
        sha256,
      })
      .expect(201);

    const uploadUrl = uploadRequest.body.upload_url as string;
    const uploadId = uploadRequest.body.upload_id as string;
    const fileId = uploadRequest.body.file_id as string;

    await request(app.getHttpServer())
      .put(objectPathFromSignedUrl(uploadUrl))
      .send(payload)
      .expect(204);

    await request(app.getHttpServer())
      .post('/files/upload-complete')
      .set('Authorization', `Bearer ${token}`)
      .send({ upload_id: uploadId })
      .expect(201);

    const download = await request(app.getHttpServer())
      .get(`/files/${fileId}/download`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const object = await request(app.getHttpServer())
      .get(objectPathFromSignedUrl(download.body.download_url as string))
      .expect(200);
    expect(object.text).toBe('integration-bytes');
  });

  it('rejects upload-complete when bytes were never stored', async () => {
    const token = sign(ADMIN);
    const payload = Buffer.from('missing-bytes');
    const sha256 = createHash('sha256').update(payload).digest('hex');

    const uploadRequest = await request(app.getHttpServer())
      .post('/files/upload-request')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'missing.txt',
        folder_id: folderId,
        size: payload.length,
        mime_type: 'text/plain',
        sha256,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/files/upload-complete')
      .set('Authorization', `Bearer ${token}`)
      .send({ upload_id: uploadRequest.body.upload_id })
      .expect(400);
  });

  it('returns a public download URL after share verification', async () => {
    const token = sign(ADMIN);
    const payload = Buffer.from('shared-bytes');
    const sha256 = createHash('sha256').update(payload).digest('hex');

    const uploadRequest = await request(app.getHttpServer())
      .post('/files/upload-request')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'shared.txt',
        folder_id: folderId,
        size: payload.length,
        mime_type: 'text/plain',
        sha256,
      })
      .expect(201);

    await request(app.getHttpServer())
      .put(objectPathFromSignedUrl(uploadRequest.body.upload_url as string))
      .send(payload)
      .expect(204);
    await request(app.getHttpServer())
      .post('/files/upload-complete')
      .set('Authorization', `Bearer ${token}`)
      .send({ upload_id: uploadRequest.body.upload_id })
      .expect(201);

    const share = await request(app.getHttpServer())
      .post('/shares')
      .set('Authorization', `Bearer ${token}`)
      .send({
        resource_type: 'FILE',
        resource_id: uploadRequest.body.file_id,
        can_download: true,
      })
      .expect(201);

    const linkToken = String(share.body.link_url).split('/').pop();
    expect(linkToken).toBeTruthy();

    const verified = await request(app.getHttpServer())
      .post('/share/public')
      .send({ token: linkToken })
      .expect(201);

    expect(verified.body.download_url).toMatch(
      /^http:\/\/127\.0\.0\.1:3001\/storage\/objects\?token=/,
    );
    const object = await request(app.getHttpServer())
      .get(objectPathFromSignedUrl(verified.body.download_url as string))
      .expect(200);
    expect(object.text).toBe('shared-bytes');
  });
});
