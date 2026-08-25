import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  AccessAction,
  AuditAction,
  NotificationType,
  OrgRole,
  PrismaClient,
  ResourceType,
  SharePermission,
  ShareStatus,
  TrashReason,
  VersionStatus,
} from '@prisma/client';

/**
 * Database V2 integration suite.
 *
 * Exercises the full V2 data lifecycle directly against MySQL through
 * PrismaClient using a dedicated throwaway tenant. Covers the 20 required
 * scenarios from the Database V2 specification. No physical S3 objects are
 * created; StorageObject rows are database records only.
 */

function loadDotEnv(): void {
  if (process.env.DATABASE_URL) return;
  const envPath = path.resolve(__dirname, '..', '..', 'backend', '.env');
  const fallback = path.resolve(__dirname, '..', '.env');
  const target = [envPath, fallback].find((candidate) => fs.existsSync(candidate));
  if (!target) return;
  for (const line of fs.readFileSync(target, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

loadDotEnv();

const prisma = new PrismaClient();

const ORG_ID = 'v2it0000-0000-4000-8000-000000000001';
const ADMIN_ID = 'v2it0000-0000-4000-8000-000000000011';
const MEMBER_ID = 'v2it0000-0000-4000-8000-000000000012';

describe('Database V2 lifecycle', () => {
  let fileId: string;
  let folderId: string;
  let shareId: string;
  let tagId: string;
  let commentId: string;

  beforeAll(async () => {
    await cleanup();
    await prisma.organization.create({
      data: { id: ORG_ID, name: 'V2 Integration Org' },
    });
    await prisma.user.create({
      data: { id: ADMIN_ID, orgId: ORG_ID, email: 'v2-admin@test.imkan', role: OrgRole.ADMIN },
    });
    await prisma.user.create({
      data: { id: MEMBER_ID, orgId: ORG_ID, email: 'v2-member@test.imkan', role: OrgRole.MEMBER },
    });
    await prisma.storageQuota.create({
      data: { orgId: ORG_ID, quotaBytes: 10737418240n, usedBytes: 0n },
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  async function cleanup(): Promise<void> {
    await prisma.fileActivity.deleteMany({ where: { orgId: ORG_ID } }).catch(() => undefined);
    await prisma.fileTag.deleteMany({ where: { tag: { orgId: ORG_ID } } }).catch(() => undefined);
    await prisma.tag.deleteMany({ where: { orgId: ORG_ID } }).catch(() => undefined);
    await prisma.comment.deleteMany({ where: { orgId: ORG_ID } }).catch(() => undefined);
    await prisma.favorite.deleteMany({ where: { orgId: ORG_ID } }).catch(() => undefined);
    await prisma.notification.deleteMany({ where: { orgId: ORG_ID } }).catch(() => undefined);
    await prisma.accessEvent.deleteMany({ where: { orgId: ORG_ID } }).catch(() => undefined);
    await prisma.auditLog.deleteMany({ where: { orgId: ORG_ID } }).catch(() => undefined);
    await prisma.trashEntry.deleteMany({ where: { orgId: ORG_ID } }).catch(() => undefined);
    await prisma.fileShareRecipient.deleteMany({ where: { orgId: ORG_ID } }).catch(() => undefined);
    await prisma.fileShare.deleteMany({ where: { orgId: ORG_ID } }).catch(() => undefined);
    await prisma.fileMetadata.deleteMany({ where: { file: { orgId: ORG_ID } } }).catch(() => undefined);
    await prisma.fileVersion.deleteMany({ where: { orgId: ORG_ID } }).catch(() => undefined);
    await prisma.storageObject.deleteMany({ where: { orgId: ORG_ID } }).catch(() => undefined);
    await prisma.file.deleteMany({ where: { orgId: ORG_ID } }).catch(() => undefined);
    await prisma.folder.deleteMany({ where: { orgId: ORG_ID } }).catch(() => undefined);
    await prisma.teamFolderMember.deleteMany({ where: { orgId: ORG_ID } }).catch(() => undefined);
    await prisma.teamFolder.deleteMany({ where: { orgId: ORG_ID } }).catch(() => undefined);
    await prisma.storageQuota.deleteMany({ where: { orgId: ORG_ID } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { orgId: ORG_ID } }).catch(() => undefined);
    await prisma.organization.deleteMany({ where: { id: ORG_ID } }).catch(() => undefined);
  }

  test('1. creates a file with a storage object and first version', async () => {
    folderId = randomUUID();
    await prisma.folder.create({
      data: { id: folderId, orgId: ORG_ID, name: 'V2 Folder', ownerId: ADMIN_ID },
    });

    fileId = randomUUID();
    const storageObjectId = randomUUID();
    const versionId = randomUUID();
    const size = 1024n;
    const sha256 = 'a'.repeat(64);

    await prisma.file.create({
      data: {
        id: fileId,
        orgId: ORG_ID,
        folderId,
        name: 'report.docx',
        originalName: 'report.docx',
        extension: 'docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        fileType: 'DOCUMENT',
        size,
        sha256Hash: sha256,
        status: 'ACTIVE',
        visibility: 'PRIVATE',
        ownerId: ADMIN_ID,
      },
    });
    await prisma.storageObject.create({
      data: {
        id: storageObjectId,
        orgId: ORG_ID,
        fileId,
        storageKey: `tenant_${ORG_ID}/files/${fileId}/${versionId}`,
        bucket: 'imkan-workdrive-dev',
        region: 'us-east-1',
        size,
        checksum: sha256,
      },
    });
    await prisma.fileVersion.create({
      data: {
        id: versionId,
        orgId: ORG_ID,
        fileId,
        versionNumber: 1,
        storageObjectId,
        size,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        extension: 'docx',
        sha256Hash: sha256,
        uploadedById: ADMIN_ID,
        status: VersionStatus.ACTIVE,
      },
    });

    const file = await prisma.file.findUniqueOrThrow({
      where: { id: fileId },
      include: { versions: true, storageObjects: true },
    });
    expect(file.status).toBe('ACTIVE');
    expect(file.versions).toHaveLength(1);
    expect(file.storageObjects).toHaveLength(1);
  });

  test('2. uploads a new version and supersedes the previous one', async () => {
    const storageObjectId = randomUUID();
    const versionId = randomUUID();
    const size = 2048n;
    const sha256 = 'b'.repeat(64);

    await prisma.storageObject.create({
      data: {
        id: storageObjectId,
        orgId: ORG_ID,
        fileId,
        storageKey: `tenant_${ORG_ID}/files/${fileId}/${versionId}`,
        bucket: 'imkan-workdrive-dev',
        region: 'us-east-1',
        size,
        checksum: sha256,
      },
    });
    await prisma.fileVersion.create({
      data: {
        id: versionId,
        orgId: ORG_ID,
        fileId,
        versionNumber: 2,
        storageObjectId,
        size,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        extension: 'docx',
        sha256Hash: sha256,
        uploadedById: MEMBER_ID,
        status: VersionStatus.ACTIVE,
      },
    });
    await prisma.fileVersion.updateMany({
      where: { fileId, versionNumber: { lt: 2 }, status: VersionStatus.ACTIVE },
      data: { status: VersionStatus.SUPERSEDED },
    });

    const versions = await prisma.fileVersion.findMany({
      where: { fileId },
      orderBy: { versionNumber: 'asc' },
    });
    expect(versions).toHaveLength(2);
    expect(versions[0].status).toBe(VersionStatus.SUPERSEDED);
    expect(versions[1].status).toBe(VersionStatus.ACTIVE);
  });

  test('3. creates a third version', async () => {
    const storageObjectId = randomUUID();
    const versionId = randomUUID();
    const size = 4096n;
    const sha256 = 'c'.repeat(64);

    await prisma.storageObject.create({
      data: {
        id: storageObjectId,
        orgId: ORG_ID,
        fileId,
        storageKey: `tenant_${ORG_ID}/files/${fileId}/${versionId}`,
        bucket: 'imkan-workdrive-dev',
        region: 'us-east-1',
        size,
        checksum: sha256,
      },
    });
    await prisma.fileVersion.create({
      data: {
        id: versionId,
        orgId: ORG_ID,
        fileId,
        versionNumber: 3,
        storageObjectId,
        size,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        extension: 'docx',
        sha256Hash: sha256,
        uploadedById: ADMIN_ID,
        status: VersionStatus.ACTIVE,
      },
    });
    await prisma.fileVersion.updateMany({
      where: { fileId, versionNumber: { lt: 3 }, status: VersionStatus.ACTIVE },
      data: { status: VersionStatus.SUPERSEDED },
    });

    const current = await prisma.fileVersion.findFirstOrThrow({
      where: { fileId, status: VersionStatus.ACTIVE },
      orderBy: { versionNumber: 'desc' },
    });
    expect(current.versionNumber).toBe(3);
    expect(current.uploadedById).toBe(ADMIN_ID);
  });

  test('4. restores version 1 as a new copy-forward version', async () => {
    const source = await prisma.fileVersion.findFirstOrThrow({
      where: { fileId, versionNumber: 1 },
    });
    const max = await prisma.fileVersion.findFirstOrThrow({
      where: { fileId },
      orderBy: { versionNumber: 'desc' },
    });
    const newVersionNumber = max.versionNumber + 1;

    await prisma.$transaction(async (tx) => {
      await tx.fileVersion.create({
        data: {
          id: randomUUID(),
          orgId: ORG_ID,
          fileId,
          versionNumber: newVersionNumber,
          storageObjectId: source.storageObjectId,
          size: source.size,
          mimeType: source.mimeType,
          extension: source.extension,
          sha256Hash: source.sha256Hash,
          uploadedById: ADMIN_ID,
          status: VersionStatus.RESTORED,
        },
      });
      await tx.fileVersion.updateMany({
        where: { fileId, versionNumber: { lt: newVersionNumber }, status: VersionStatus.ACTIVE },
        data: { status: VersionStatus.SUPERSEDED },
      });
      await tx.file.update({
        where: { id: fileId },
        data: {
          size: source.size,
          mimeType: source.mimeType,
          sha256Hash: source.sha256Hash,
        },
      });
    });

    const restored = await prisma.fileVersion.findFirstOrThrow({
      where: { fileId, versionNumber: newVersionNumber },
    });
    expect(restored.status).toBe(VersionStatus.RESTORED);
    expect(restored.sha256Hash).toBe(source.sha256Hash);
    expect(await prisma.fileVersion.count({ where: { fileId } })).toBe(4);
  });

  test('5. shares the file with a member', async () => {
    shareId = randomUUID();
    await prisma.fileShare.create({
      data: {
        id: shareId,
        orgId: ORG_ID,
        fileId,
        createdById: ADMIN_ID,
        permission: SharePermission.VIEW,
        status: ShareStatus.ACTIVE,
        linkToken: randomUUID(),
        canDownload: true,
        recipients: { create: [{ orgId: ORG_ID, userId: MEMBER_ID }] },
      },
    });

    const share = await prisma.fileShare.findUniqueOrThrow({
      where: { id: shareId },
      include: { recipients: true },
    });
    expect(share.permission).toBe(SharePermission.VIEW);
    expect(share.recipients).toHaveLength(1);
    expect(share.recipients[0].userId).toBe(MEMBER_ID);
  });

  test('6. changes the share permission', async () => {
    await prisma.fileShare.update({
      where: { id: shareId },
      data: { permission: SharePermission.EDIT },
    });
    const share = await prisma.fileShare.findUniqueOrThrow({ where: { id: shareId } });
    expect(share.permission).toBe(SharePermission.EDIT);
  });

  test('7. revokes the share', async () => {
    await prisma.fileShare.update({
      where: { id: shareId },
      data: { status: ShareStatus.REVOKED, revokedAt: new Date() },
    });
    const share = await prisma.fileShare.findUniqueOrThrow({ where: { id: shareId } });
    expect(share.status).toBe(ShareStatus.REVOKED);
    expect(share.revokedAt).not.toBeNull();
  });

  test('8. deletes (trashes) the file', async () => {
    const now = new Date();
    await prisma.file.update({
      where: { id: fileId },
      data: { deletedAt: now, status: 'TRASHED' },
    });
    await prisma.trashEntry.create({
      data: {
        orgId: ORG_ID,
        fileId,
        deletedById: MEMBER_ID,
        reason: TrashReason.USER_DELETED,
        deletedAt: now,
        expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    const file = await prisma.file.findUniqueOrThrow({ where: { id: fileId } });
    expect(file.status).toBe('TRASHED');
    expect(file.deletedAt).not.toBeNull();
  });

  test('9. verifies the trash entry records who/when/why/expiry', async () => {
    const entry = await prisma.trashEntry.findFirstOrThrow({ where: { fileId } });
    expect(entry.deletedById).toBe(MEMBER_ID);
    expect(entry.reason).toBe(TrashReason.USER_DELETED);
    expect(entry.restoredAt).toBeNull();
    expect(entry.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  test('10. restores the file from trash', async () => {
    const now = new Date();
    await prisma.file.update({
      where: { id: fileId },
      data: { deletedAt: null, status: 'ACTIVE' },
    });
    await prisma.trashEntry.updateMany({
      where: { fileId, restoredAt: null },
      data: { restoredAt: now, restoredById: ADMIN_ID },
    });

    const entry = await prisma.trashEntry.findFirstOrThrow({ where: { fileId } });
    expect(entry.restoredAt).not.toBeNull();
    expect(entry.restoredById).toBe(ADMIN_ID);
    const file = await prisma.file.findUniqueOrThrow({ where: { id: fileId } });
    expect(file.status).toBe('ACTIVE');
  });

  test('11. adds a comment', async () => {
    commentId = randomUUID();
    const comment = await prisma.comment.create({
      data: {
        id: commentId,
        orgId: ORG_ID,
        fileId,
        userId: MEMBER_ID,
        body: 'Looks good overall.',
      },
    });
    expect(comment.body).toBe('Looks good overall.');
    expect(comment.editedAt).toBeNull();
    expect(comment.deletedAt).toBeNull();
  });

  test('12. replies to the comment (threading)', async () => {
    const reply = await prisma.comment.create({
      data: {
        id: randomUUID(),
        orgId: ORG_ID,
        fileId,
        userId: ADMIN_ID,
        parentId: commentId,
        body: 'Thanks for reviewing!',
      },
    });
    const parent = await prisma.comment.findUniqueOrThrow({
      where: { id: commentId },
      include: { replies: true },
    });
    expect(parent.replies.map((row) => row.id)).toContain(reply.id);
  });

  test('13. adds a notification', async () => {
    const notification = await prisma.notification.create({
      data: {
        orgId: ORG_ID,
        userId: MEMBER_ID,
        type: NotificationType.COMMENT,
        priority: 'HIGH',
        title: 'New comment',
        body: 'ADMIN commented on report.docx',
        resourceType: ResourceType.FILE,
        resourceId: fileId,
      },
    });
    expect(notification.type).toBe(NotificationType.COMMENT);
    expect(notification.priority).toBe('HIGH');
    expect(notification.readAt).toBeNull();
  });

  test('14. marks the notification read', async () => {
    const updated = await prisma.notification.updateMany({
      where: { orgId: ORG_ID, userId: MEMBER_ID, readAt: null },
      data: { readAt: new Date() },
    });
    expect(updated.count).toBeGreaterThan(0);
    const unread = await prisma.notification.count({
      where: { orgId: ORG_ID, userId: MEMBER_ID, readAt: null },
    });
    expect(unread).toBe(0);
  });

  test('15. adds a tag and attaches it', async () => {
    tagId = randomUUID();
    await prisma.tag.create({
      data: { id: tagId, orgId: ORG_ID, name: 'confidential' },
    });
    await prisma.fileTag.create({ data: { fileId, tagId } });

    const tags = await prisma.fileTag.findMany({
      where: { fileId },
      include: { tag: true },
    });
    expect(tags).toHaveLength(1);
    expect(tags[0].tag.name).toBe('confidential');

    await expect(
      prisma.tag.create({ data: { orgId: ORG_ID, name: 'confidential' } }),
    ).rejects.toThrow();
  });

  test('16. removes the tag', async () => {
    await prisma.fileTag.delete({ where: { fileId_tagId: { fileId, tagId } } });
    expect(await prisma.fileTag.count({ where: { fileId } })).toBe(0);
  });

  test('17. records file activity', async () => {
    await prisma.fileActivity.create({
      data: {
        orgId: ORG_ID,
        fileId,
        userId: ADMIN_ID,
        action: AuditAction.DOWNLOAD,
        metadata: { versionNumber: 4 },
      },
    });
    const activities = await prisma.fileActivity.findMany({
      where: { fileId },
      orderBy: { createdAt: 'asc' },
    });
    expect(activities.length).toBeGreaterThan(0);
    expect(activities.some((row) => row.action === AuditAction.DOWNLOAD)).toBe(true);
  });

  test('18. records an access event', async () => {
    await prisma.accessEvent.create({
      data: {
        orgId: ORG_ID,
        userId: MEMBER_ID,
        resourceType: ResourceType.FILE,
        resourceId: fileId,
        action: AccessAction.PREVIEW,
      },
    });
    const events = await prisma.accessEvent.findMany({
      where: { orgId: ORG_ID, userId: MEMBER_ID },
    });
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe(AccessAction.PREVIEW);
  });

  test('19. records an audit log entry', async () => {
    await prisma.auditLog.create({
      data: {
        orgId: ORG_ID,
        actorId: ADMIN_ID,
        action: 'FILE_RESTORED',
        resourceType: 'FILE',
        resourceId: fileId,
        ipAddress: '127.0.0.1',
        metadata: { source: 'integration-test' },
      },
    });
    const logs = await prisma.auditLog.findMany({ where: { orgId: ORG_ID } });
    expect(logs).toHaveLength(1);
    expect(logs[0].actorId).toBe(ADMIN_ID);
    expect(logs[0].ipAddress).toBe('127.0.0.1');
  });

  test('20. verifies the quota tracks usage', async () => {
    await prisma.storageQuota.update({
      where: { orgId: ORG_ID },
      data: { usedBytes: { increment: 4096n } },
    });
    const quota = await prisma.storageQuota.findUniqueOrThrow({
      where: { orgId: ORG_ID },
    });
    expect(quota.usedBytes).toBe(4096n);
    expect(quota.quotaBytes).toBe(10737418240n);
  });
});
