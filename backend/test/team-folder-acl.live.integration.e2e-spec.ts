import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OrgRole, PrismaClient, TeamFolderRole } from '@prisma/client';
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

function sign(user: TenantUser): string {
  return jwt.sign(
    { sub: user.id, org_id: user.orgId, email: user.email, role: user.role },
    JWT_SECRET,
  );
}

function auth(user: TenantUser): { Authorization: string } {
  return { Authorization: `Bearer ${sign(user)}` };
}

function objectPathFromSignedUrl(signedUrl: string): string {
  const url = new URL(signedUrl);
  return `/storage/objects${url.search}`;
}

function failIfTeamFolderRouteMissing(
  res: { status: number; body: { message?: string | string[] } },
  route: string,
): void {
  const raw = res.body?.message;
  const message = Array.isArray(raw) ? raw.join(' ') : String(raw ?? '');
  if (res.status === 404 && message.startsWith('Cannot ')) {
    throw new Error(
      `${route} is not registered (T010 Team Folder HTTP APIs are not implemented). ` +
        `This 404 is Nest's missing-route response, not ACL. Do not treat it as a passing non-member deny.`,
    );
  }
}

describe('Team Folder ACL live integration (same-org non-member, MySQL)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let storageRoot: string;
  let orgId: string;
  let admin: TenantUser;
  let member: TenantUser;
  let viewer: TenantUser;
  let editor: TenantUser;
  let organizer: TenantUser;
  let tfAdmin: TenantUser;
  let invitee: TenantUser;
  let soloAdmin: TenantUser;
  let adminB: TenantUser;
  let orgBId: string;
  let teamFolderId: string;
  let publicTfId: string;
  let soloTfId: string;
  let orgBTfId: string;
  let tfRootFolderId: string;
  let fileId: string;
  let trashedFileId: string;
  const runTag = `tfacl${Date.now()}`;

  jest.setTimeout(90_000);

  beforeAll(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'workdrive-tf-acl-live-'));
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
    orgId = randomUUID();
    admin = {
      id: randomUUID(),
      orgId,
      email: `admin-${runTag}@example.imkan`,
      role: OrgRole.ADMIN,
    };
    member = {
      id: randomUUID(),
      orgId,
      email: `member-${runTag}@example.imkan`,
      role: OrgRole.MEMBER,
    };

    await prisma.organization.create({ data: { id: orgId, name: runTag } });
    await prisma.user.create({
      data: { id: admin.id, orgId, email: admin.email, role: admin.role },
    });
    await prisma.user.create({
      data: { id: member.id, orgId, email: member.email, role: member.role },
    });

    viewer = {
      id: randomUUID(),
      orgId,
      email: `viewer-${runTag}@example.imkan`,
      role: OrgRole.MEMBER,
    };
    editor = {
      id: randomUUID(),
      orgId,
      email: `editor-${runTag}@example.imkan`,
      role: OrgRole.MEMBER,
    };
    organizer = {
      id: randomUUID(),
      orgId,
      email: `organizer-${runTag}@example.imkan`,
      role: OrgRole.MEMBER,
    };
    tfAdmin = {
      id: randomUUID(),
      orgId,
      email: `tfadmin-${runTag}@example.imkan`,
      role: OrgRole.MEMBER,
    };
    invitee = {
      id: randomUUID(),
      orgId,
      email: `invitee-${runTag}@example.imkan`,
      role: OrgRole.MEMBER,
    };
    soloAdmin = {
      id: randomUUID(),
      orgId,
      email: `soloadm-${runTag}@example.imkan`,
      role: OrgRole.MEMBER,
    };
    for (const row of [
      viewer,
      editor,
      organizer,
      tfAdmin,
      invitee,
      soloAdmin,
    ]) {
      await prisma.user.create({
        data: { id: row.id, orgId, email: row.email, role: row.role },
      });
    }

    orgBId = randomUUID();
    adminB = {
      id: randomUUID(),
      orgId: orgBId,
      email: `adminb-${runTag}@example.imkan`,
      role: OrgRole.ADMIN,
    };
    await prisma.organization.create({
      data: { id: orgBId, name: `${runTag}b` },
    });
    await prisma.user.create({
      data: {
        id: adminB.id,
        orgId: orgBId,
        email: adminB.email,
        role: adminB.role,
      },
    });

    teamFolderId = randomUUID();
    await prisma.teamFolder.create({
      data: { id: teamFolderId, orgId, name: `${runTag}tf` },
    });
    await prisma.teamFolderMember.createMany({
      data: [
        { teamFolderId, userId: viewer.id, orgId, role: TeamFolderRole.VIEWER },
        { teamFolderId, userId: editor.id, orgId, role: TeamFolderRole.EDITOR },
        {
          teamFolderId,
          userId: organizer.id,
          orgId,
          role: TeamFolderRole.ORGANIZER,
        },
        { teamFolderId, userId: tfAdmin.id, orgId, role: TeamFolderRole.ADMIN },
      ],
    });

    publicTfId = randomUUID();
    await prisma.teamFolder.create({
      data: {
        id: publicTfId,
        orgId,
        name: `${runTag}public`,
        isPublicToOrg: true,
      },
    });

    soloTfId = randomUUID();
    await prisma.teamFolder.create({
      data: { id: soloTfId, orgId, name: `${runTag}solo` },
    });
    await prisma.teamFolderMember.create({
      data: {
        teamFolderId: soloTfId,
        userId: soloAdmin.id,
        orgId,
        role: TeamFolderRole.ADMIN,
      },
    });

    orgBTfId = randomUUID();
    await prisma.teamFolder.create({
      data: { id: orgBTfId, orgId: orgBId, name: `${runTag}orgb` },
    });

    const folderRes = await request(app.getHttpServer())
      .post('/folders')
      .set(auth(admin))
      .send({ name: `${runTag}root`, teamFolderId })
      .expect(201);
    tfRootFolderId = folderRes.body.id as string;

    const livePayload = Buffer.from(`${runTag}-bytes`);
    const liveSha = createHash('sha256').update(livePayload).digest('hex');
    const uploadRequest = await request(app.getHttpServer())
      .post('/files/upload-request')
      .set(auth(admin))
      .send({
        name: `${runTag}.txt`,
        folder_id: tfRootFolderId,
        size: livePayload.length,
        mime_type: 'text/plain',
        sha256: liveSha,
      })
      .expect(201);
    fileId = uploadRequest.body.file_id as string;
    await request(app.getHttpServer())
      .put(objectPathFromSignedUrl(uploadRequest.body.upload_url as string))
      .send(livePayload)
      .expect(204);
    await request(app.getHttpServer())
      .post('/files/upload-complete')
      .set(auth(admin))
      .send({ upload_id: uploadRequest.body.upload_id })
      .expect(201);

    const trashPayload = Buffer.from(`${runTag}-trash`);
    const trashSha = createHash('sha256').update(trashPayload).digest('hex');
    const trashUpload = await request(app.getHttpServer())
      .post('/files/upload-request')
      .set(auth(admin))
      .send({
        name: `${runTag}trash.txt`,
        folder_id: tfRootFolderId,
        size: trashPayload.length,
        mime_type: 'text/plain',
        sha256: trashSha,
      })
      .expect(201);
    trashedFileId = trashUpload.body.file_id as string;
    await request(app.getHttpServer())
      .put(objectPathFromSignedUrl(trashUpload.body.upload_url as string))
      .send(trashPayload)
      .expect(204);
    await request(app.getHttpServer())
      .post('/files/upload-complete')
      .set(auth(admin))
      .send({ upload_id: trashUpload.body.upload_id })
      .expect(201);
    await request(app.getHttpServer())
      .delete(`/files/${trashedFileId}`)
      .set(auth(admin))
      .expect(200);
  });

  afterAll(async () => {
    async function cleanupOrg(targetOrgId: string) {
      const files = await prisma.file.findMany({
        where: { orgId: targetOrgId },
        select: { id: true },
      });
      const fileIds = files.map((file) => file.id);
      const folders = await prisma.folder.findMany({
        where: { orgId: targetOrgId },
        select: { id: true },
      });
      const folderIds = folders.map((folder) => folder.id);
      if (fileIds.length > 0) {
        await prisma.share.deleteMany({
          where: { orgId: targetOrgId, resourceId: { in: fileIds } },
        });
        await prisma.fileVersion.deleteMany({
          where: { orgId: targetOrgId, fileId: { in: fileIds } },
        });
        await prisma.auditLog.deleteMany({
          where: { orgId: targetOrgId, resourceId: { in: fileIds } },
        });
        await prisma.file.deleteMany({
          where: { orgId: targetOrgId, id: { in: fileIds } },
        });
      }
      if (folderIds.length > 0) {
        await prisma.auditLog.deleteMany({
          where: { orgId: targetOrgId, resourceId: { in: folderIds } },
        });
        await prisma.folder.deleteMany({
          where: { orgId: targetOrgId, id: { in: folderIds } },
        });
      }
      await prisma.share.deleteMany({ where: { orgId: targetOrgId } });
      await prisma.auditLog.deleteMany({ where: { orgId: targetOrgId } });
      await prisma.teamFolderMember.deleteMany({
        where: { orgId: targetOrgId },
      });
      await prisma.teamFolder.deleteMany({ where: { orgId: targetOrgId } });
      await prisma.user.deleteMany({ where: { orgId: targetOrgId } });
      await prisma.organization.deleteMany({ where: { id: targetOrgId } });
    }
    if (prisma) {
      if (orgId) {
        await cleanupOrg(orgId);
      }
      if (orgBId) {
        await cleanupOrg(orgBId);
      }
      await prisma.$disconnect();
    }
    if (app) {
      await app.close();
    }
    if (storageRoot) {
      await rm(storageRoot, { recursive: true, force: true });
    }
  });

  describe('Team Folder collection routes (require T010)', () => {
    it('does not list the Team Folder to a same-org non-member', async () => {
      const res = await request(app.getHttpServer())
        .get('/team-folders')
        .set(auth(member));
      failIfTeamFolderRouteMissing(res, 'GET /team-folders');
      expect(res.status).toBe(200);
      const ids =
        (res.body.teamFolders as Array<{ id: string }> | undefined)?.map(
          (row) => row.id,
        ) ?? [];
      expect(ids).not.toContain(teamFolderId);
    });

    it('returns 404 when a same-org non-member gets the Team Folder by id', async () => {
      const res = await request(app.getHttpServer())
        .get(`/team-folders/${teamFolderId}`)
        .set(auth(member));
      failIfTeamFolderRouteMissing(res, `GET /team-folders/${teamFolderId}`);
      expect(res.status).toBe(404);
    });
  });

  describe('Same-org non-member is denied Team Folder descendants', () => {
    it('does not list the Team Folder root among GET /folders', async () => {
      const res = await request(app.getHttpServer())
        .get('/folders')
        .set(auth(member))
        .expect(200);
      const ids = (res.body.folders as Array<{ id: string }>).map(
        (folder) => folder.id,
      );
      expect(ids).not.toContain(tfRootFolderId);
    });

    it('returns 404 when listing Team Folder children via GET /folders/:id', async () => {
      await request(app.getHttpServer())
        .get(`/folders/${tfRootFolderId}`)
        .set(auth(member))
        .expect(404);
    });

    it('returns 404 when downloading a Team Folder file', async () => {
      const res = await request(app.getHttpServer())
        .get(`/files/${fileId}/download`)
        .set(auth(member))
        .expect(404);
      expect(res.body.download_url).toBeUndefined();
    });

    it('returns 404 when uploading into the Team Folder', async () => {
      await request(app.getHttpServer())
        .post('/files/upload-request')
        .set(auth(member))
        .send({
          name: 'intruder.txt',
          folder_id: tfRootFolderId,
          size: 4,
          mime_type: 'text/plain',
          sha256: createHash('sha256').update('nope').digest('hex'),
        })
        .expect(404);
    });

    it('returns 404 when renaming the Team Folder root', async () => {
      await request(app.getHttpServer())
        .patch(`/folders/${tfRootFolderId}`)
        .set(auth(member))
        .send({ name: 'hijacked-root' })
        .expect(404);
    });

    it('returns 404 when renaming a Team Folder file', async () => {
      await request(app.getHttpServer())
        .patch(`/files/${fileId}`)
        .set(auth(member))
        .send({ name: 'hijacked.txt' })
        .expect(404);
    });

    it('returns 404 when trashing a Team Folder file', async () => {
      await request(app.getHttpServer())
        .delete(`/files/${fileId}`)
        .set(auth(member))
        .expect(404);
    });

    it('does not list a trashed Team Folder file', async () => {
      const res = await request(app.getHttpServer())
        .get('/files/trash')
        .set(auth(member))
        .expect(200);
      const ids = (res.body as Array<{ id: string }>).map((file) => file.id);
      expect(ids).not.toContain(trashedFileId);
    });

    it('returns 404 when restoring a trashed Team Folder file', async () => {
      await request(app.getHttpServer())
        .post(`/files/${trashedFileId}/restore`)
        .set(auth(member))
        .expect(404);
    });

    it('returns 404 when creating a share for a Team Folder file', async () => {
      await request(app.getHttpServer())
        .post('/shares')
        .set(auth(member))
        .send({
          resource_type: 'FILE',
          resource_id: fileId,
          can_download: true,
        })
        .expect(404);
    });

    it('does not leak Team Folder names or ids via search', async () => {
      const res = await request(app.getHttpServer())
        .get('/search')
        .query({ q: runTag })
        .set(auth(member))
        .expect(200);
      const folderIds = (
        res.body.folders as Array<{ id: string; name: string }> | undefined
      )?.map((folder) => folder.id);
      const fileIds = (
        res.body.files as Array<{ id: string; name: string }> | undefined
      )?.map((file) => file.id);
      const names = [
        ...((res.body.folders as Array<{ name: string }> | undefined)?.map(
          (folder) => folder.name,
        ) ?? []),
        ...((res.body.files as Array<{ name: string }> | undefined)?.map(
          (file) => file.name,
        ) ?? []),
      ];
      expect(folderIds ?? []).not.toContain(tfRootFolderId);
      expect(fileIds ?? []).not.toContain(fileId);
      expect(names.join(' ')).not.toContain(runTag);
    });
  });

  describe('US2 role matrix (T018)', () => {
    it('lets a VIEWER read Team Folder content', async () => {
      const listed = await request(app.getHttpServer())
        .get('/team-folders')
        .set(auth(viewer));
      failIfTeamFolderRouteMissing(listed, 'GET /team-folders');
      expect(listed.status).toBe(200);
      const ids = (listed.body.teamFolders as Array<{ id: string }>).map(
        (row) => row.id,
      );
      expect(ids).toContain(teamFolderId);

      const got = await request(app.getHttpServer())
        .get(`/team-folders/${teamFolderId}`)
        .set(auth(viewer));
      failIfTeamFolderRouteMissing(got, `GET /team-folders/${teamFolderId}`);
      expect(got.status).toBe(200);

      await request(app.getHttpServer())
        .get(`/folders/${tfRootFolderId}`)
        .set(auth(viewer))
        .expect(200);
      const download = await request(app.getHttpServer())
        .get(`/files/${fileId}/download`)
        .set(auth(viewer))
        .expect(200);
      expect(download.body.download_url).toBeDefined();
    });

    it('returns 403 when a VIEWER mutates or shares Team Folder content', async () => {
      await request(app.getHttpServer())
        .post('/files/upload-request')
        .set(auth(viewer))
        .send({
          name: 'viewer-write.txt',
          folder_id: tfRootFolderId,
          size: 4,
          mime_type: 'text/plain',
          sha256: createHash('sha256').update('nope').digest('hex'),
        })
        .expect(403);
      await request(app.getHttpServer())
        .patch(`/folders/${tfRootFolderId}`)
        .set(auth(viewer))
        .send({ name: 'viewer-rename' })
        .expect(403);
      await request(app.getHttpServer())
        .patch(`/files/${fileId}`)
        .set(auth(viewer))
        .send({ name: 'viewer.txt' })
        .expect(403);
      await request(app.getHttpServer())
        .delete(`/files/${fileId}`)
        .set(auth(viewer))
        .expect(403);
      await request(app.getHttpServer())
        .post(`/files/${trashedFileId}/restore`)
        .set(auth(viewer))
        .expect(403);
      await request(app.getHttpServer())
        .post('/shares')
        .set(auth(viewer))
        .send({
          resource_type: 'FILE',
          resource_id: fileId,
          can_download: true,
        })
        .expect(403);
    });

    it('returns 403 when a VIEWER manages members', async () => {
      const res = await request(app.getHttpServer())
        .post(`/team-folders/${teamFolderId}/members`)
        .set(auth(viewer))
        .send({ userId: invitee.id, role: 'VIEWER' });
      failIfTeamFolderRouteMissing(
        res,
        `POST /team-folders/${teamFolderId}/members`,
      );
      expect(res.status).toBe(403);
    });

    it('lets an EDITOR create, rename, trash, restore, and share content', async () => {
      const child = await request(app.getHttpServer())
        .post('/folders')
        .set(auth(editor))
        .send({ name: `${runTag}editor-child`, parentId: tfRootFolderId })
        .expect(201);

      const payload = Buffer.from(`${runTag}-editor`);
      const sha = createHash('sha256').update(payload).digest('hex');
      const upload = await request(app.getHttpServer())
        .post('/files/upload-request')
        .set(auth(editor))
        .send({
          name: `${runTag}editor.txt`,
          folder_id: tfRootFolderId,
          size: payload.length,
          mime_type: 'text/plain',
          sha256: sha,
        })
        .expect(201);
      await request(app.getHttpServer())
        .put(objectPathFromSignedUrl(upload.body.upload_url as string))
        .send(payload)
        .expect(204);
      await request(app.getHttpServer())
        .post('/files/upload-complete')
        .set(auth(editor))
        .send({ upload_id: upload.body.upload_id })
        .expect(201);
      const editorFileId = upload.body.file_id as string;

      await request(app.getHttpServer())
        .patch(`/files/${editorFileId}`)
        .set(auth(editor))
        .send({ name: `${runTag}editor-renamed.txt` })
        .expect(200);
      await request(app.getHttpServer())
        .delete(`/files/${editorFileId}`)
        .set(auth(editor))
        .expect(200);
      await request(app.getHttpServer())
        .post(`/files/${editorFileId}/restore`)
        .set(auth(editor))
        .expect(201);
      await request(app.getHttpServer())
        .post('/shares')
        .set(auth(editor))
        .send({
          resource_type: 'FILE',
          resource_id: editorFileId,
          can_download: true,
        })
        .expect(201);

      expect(child.body.id).toBeDefined();
    });

    it('returns 403 when an EDITOR manages members or the Team Folder record', async () => {
      const add = await request(app.getHttpServer())
        .post(`/team-folders/${teamFolderId}/members`)
        .set(auth(editor))
        .send({ userId: invitee.id, role: 'VIEWER' });
      failIfTeamFolderRouteMissing(
        add,
        `POST /team-folders/${teamFolderId}/members`,
      );
      expect(add.status).toBe(403);

      const renameTf = await request(app.getHttpServer())
        .patch(`/team-folders/${teamFolderId}`)
        .set(auth(editor))
        .send({ name: 'editor-hijack' });
      failIfTeamFolderRouteMissing(
        renameTf,
        `PATCH /team-folders/${teamFolderId}`,
      );
      expect(renameTf.status).toBe(403);
    });

    it('lets an ORGANIZER share and add EDITOR or VIEWER members only', async () => {
      await request(app.getHttpServer())
        .post('/shares')
        .set(auth(organizer))
        .send({
          resource_type: 'FILE',
          resource_id: fileId,
          can_download: true,
        })
        .expect(201);

      const addViewer = await request(app.getHttpServer())
        .post(`/team-folders/${teamFolderId}/members`)
        .set(auth(organizer))
        .send({ userId: invitee.id, role: 'VIEWER' });
      failIfTeamFolderRouteMissing(
        addViewer,
        `POST /team-folders/${teamFolderId}/members`,
      );
      expect(addViewer.status).toBe(201);

      const addAdmin = await request(app.getHttpServer())
        .post(`/team-folders/${teamFolderId}/members`)
        .set(auth(organizer))
        .send({ userId: invitee.id, role: 'ADMIN' });
      failIfTeamFolderRouteMissing(
        addAdmin,
        `POST /team-folders/${teamFolderId}/members`,
      );
      expect([400, 403]).toContain(addAdmin.status);

      const addOrganizer = await request(app.getHttpServer())
        .patch(`/team-folders/${teamFolderId}/members/${invitee.id}`)
        .set(auth(organizer))
        .send({ role: 'ORGANIZER' });
      failIfTeamFolderRouteMissing(
        addOrganizer,
        `PATCH /team-folders/${teamFolderId}/members/${invitee.id}`,
      );
      expect([400, 403]).toContain(addOrganizer.status);
    });

    it('returns 403 when an ORGANIZER renames or deletes the Team Folder', async () => {
      const renameTf = await request(app.getHttpServer())
        .patch(`/team-folders/${teamFolderId}`)
        .set(auth(organizer))
        .send({ name: 'organizer-hijack' });
      failIfTeamFolderRouteMissing(
        renameTf,
        `PATCH /team-folders/${teamFolderId}`,
      );
      expect(renameTf.status).toBe(403);

      const removeTf = await request(app.getHttpServer())
        .delete(`/team-folders/${teamFolderId}`)
        .set(auth(organizer));
      failIfTeamFolderRouteMissing(
        removeTf,
        `DELETE /team-folders/${teamFolderId}`,
      );
      expect(removeTf.status).toBe(403);
    });

    it('lets a TF ADMIN rename the Team Folder and manage members', async () => {
      const renameTf = await request(app.getHttpServer())
        .patch(`/team-folders/${teamFolderId}`)
        .set(auth(tfAdmin))
        .send({ name: `${runTag}tf-renamed` });
      failIfTeamFolderRouteMissing(
        renameTf,
        `PATCH /team-folders/${teamFolderId}`,
      );
      expect(renameTf.status).toBe(200);

      const members = await request(app.getHttpServer())
        .get(`/team-folders/${teamFolderId}/members`)
        .set(auth(tfAdmin));
      failIfTeamFolderRouteMissing(
        members,
        `GET /team-folders/${teamFolderId}/members`,
      );
      expect(members.status).toBe(200);
    });

    it('returns 400 when deleting the last TF ADMIN', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/team-folders/${soloTfId}/members/${soloAdmin.id}`)
        .set(auth(soloAdmin));
      failIfTeamFolderRouteMissing(
        res,
        `DELETE /team-folders/${soloTfId}/members/${soloAdmin.id}`,
      );
      expect(res.status).toBe(400);
    });

    it('returns 400 when a TF ADMIN deletes a non-empty Team Folder', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/team-folders/${teamFolderId}`)
        .set(auth(tfAdmin));
      failIfTeamFolderRouteMissing(res, `DELETE /team-folders/${teamFolderId}`);
      expect(res.status).toBe(400);
    });

    it('lets an org ADMIN read and administer Team Folders in the same organization', async () => {
      const listed = await request(app.getHttpServer())
        .get('/team-folders')
        .set(auth(admin));
      failIfTeamFolderRouteMissing(listed, 'GET /team-folders');
      expect(listed.status).toBe(200);
      const ids = (listed.body.teamFolders as Array<{ id: string }>).map(
        (row) => row.id,
      );
      expect(ids).toContain(teamFolderId);

      await request(app.getHttpServer())
        .get(`/folders/${tfRootFolderId}`)
        .set(auth(admin))
        .expect(200);
      const members = await request(app.getHttpServer())
        .get(`/team-folders/${teamFolderId}/members`)
        .set(auth(admin));
      failIfTeamFolderRouteMissing(
        members,
        `GET /team-folders/${teamFolderId}/members`,
      );
      expect(members.status).toBe(200);
    });

    it('returns 404 for cross-tenant Team Folder and descendant ids', async () => {
      const tf = await request(app.getHttpServer())
        .get(`/team-folders/${teamFolderId}`)
        .set(auth(adminB));
      failIfTeamFolderRouteMissing(tf, `GET /team-folders/${teamFolderId}`);
      expect(tf.status).toBe(404);

      await request(app.getHttpServer())
        .get(`/folders/${tfRootFolderId}`)
        .set(auth(adminB))
        .expect(404);
      await request(app.getHttpServer())
        .get(`/files/${fileId}/download`)
        .set(auth(adminB))
        .expect(404);

      const listed = await request(app.getHttpServer())
        .get('/team-folders')
        .set(auth(adminB));
      failIfTeamFolderRouteMissing(listed, 'GET /team-folders');
      expect(listed.status).toBe(200);
      const ids =
        (listed.body.teamFolders as Array<{ id: string }> | undefined)?.map(
          (row) => row.id,
        ) ?? [];
      expect(ids).not.toContain(teamFolderId);
      expect(ids).toContain(orgBTfId);
    });

    it('does not grant access via isPublicToOrg without membership', async () => {
      const listed = await request(app.getHttpServer())
        .get('/team-folders')
        .set(auth(member));
      failIfTeamFolderRouteMissing(listed, 'GET /team-folders');
      expect(listed.status).toBe(200);
      const ids =
        (listed.body.teamFolders as Array<{ id: string }> | undefined)?.map(
          (row) => row.id,
        ) ?? [];
      expect(ids).not.toContain(publicTfId);

      const got = await request(app.getHttpServer())
        .get(`/team-folders/${publicTfId}`)
        .set(auth(member));
      failIfTeamFolderRouteMissing(got, `GET /team-folders/${publicTfId}`);
      expect(got.status).toBe(404);
    });
  });
});
