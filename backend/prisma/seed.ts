import { PrismaClient, OrgRole, TeamFolderRole } from '@prisma/client';
import { createHash } from 'node:crypto';
import {
  SEED_FILE,
  SEED_FILE_VERSIONS,
  SEED_ORGANIZATION,
  SEED_PERSONAL_FOLDER,
  SEED_TEAM_FOLDER,
  SEED_TEAM_FOLDER_MEMBER_USER_ID,
  SEED_TAG_NAME,
  SEED_USERS,
} from '../src/auth/seed-data';

const prisma = new PrismaClient();

const ORG_ID = SEED_ORGANIZATION.id;
const ADMIN_ID = SEED_USERS[0].id;
const MEMBER_ID = SEED_USERS[1].id;

const STORAGE_OBJECT_ID = '00000000-0000-4000-8000-000000000071';
const VERSION_IDS = [
  '00000000-0000-4000-8000-000000000031',
  '00000000-0000-4000-8000-000000000032',
];
const TEAM_ROOT_FOLDER_ID = '00000000-0000-4000-8000-000000000042';
const SHARE_ID = '00000000-0000-4000-8000-000000000051';
const NOTIFICATION_ID = '00000000-0000-4000-8000-000000000081';
const COMMENT_ID = '00000000-0000-4000-8000-000000000091';
const REPLY_ID = '00000000-0000-4000-8000-000000000092';
const FAVORITE_ID = '00000000-0000-4000-8000-0000000000a1';
const TAG_ID = '00000000-0000-4000-8000-0000000000b1';
const FILE_METADATA_ID = '00000000-0000-4000-8000-0000000000c1';
const SHARE_LINK_TOKEN =
  'seed000000000000000000000000000000000000000000000000000000000share';

async function seedOrganization(): Promise<void> {
  await prisma.organization.upsert({
    where: { id: ORG_ID },
    update: { name: SEED_ORGANIZATION.name },
    create: { id: ORG_ID, name: SEED_ORGANIZATION.name },
  });
}

async function seedUsers(): Promise<void> {
  for (const user of SEED_USERS) {
    await prisma.user.upsert({
      where: { orgId_email: { orgId: ORG_ID, email: user.email } },
      update: { role: user.role as OrgRole },
      create: {
        id: user.id,
        orgId: ORG_ID,
        email: user.email,
        role: user.role as OrgRole,
      },
    });
  }
}

async function seedTeamFolder(): Promise<void> {
  await prisma.teamFolder.upsert({
    where: { id: SEED_TEAM_FOLDER.id },
    update: { name: SEED_TEAM_FOLDER.name },
    create: {
      id: SEED_TEAM_FOLDER.id,
      orgId: ORG_ID,
      name: SEED_TEAM_FOLDER.name,
      isPublicToOrg: false,
    },
  });
  await prisma.teamFolderMember.upsert({
    where: {
      teamFolderId_userId: {
        teamFolderId: SEED_TEAM_FOLDER.id,
        userId: SEED_TEAM_FOLDER_MEMBER_USER_ID,
      },
    },
    update: {},
    create: {
      teamFolderId: SEED_TEAM_FOLDER.id,
      userId: SEED_TEAM_FOLDER_MEMBER_USER_ID,
      orgId: ORG_ID,
      role: TeamFolderRole.ORGANIZER,
    },
  });
  await prisma.folder.upsert({
    where: { id: TEAM_ROOT_FOLDER_ID },
    update: {},
    create: {
      id: TEAM_ROOT_FOLDER_ID,
      orgId: ORG_ID,
      teamFolderId: SEED_TEAM_FOLDER.id,
      parentId: null,
      name: `${SEED_TEAM_FOLDER.name} Root`,
      ownerId: ADMIN_ID,
    },
  });
}

async function seedFileWithVersions(): Promise<void> {
  await prisma.folder.upsert({
    where: { id: SEED_PERSONAL_FOLDER.id },
    update: {},
    create: {
      id: SEED_PERSONAL_FOLDER.id,
      orgId: ORG_ID,
      teamFolderId: null,
      parentId: null,
      name: SEED_PERSONAL_FOLDER.name,
      ownerId: SEED_PERSONAL_FOLDER.ownerId,
    },
  });

  await prisma.file.upsert({
    where: { id: SEED_FILE.id },
    update: {
      size: BigInt(SEED_FILE.size),
      mimeType: SEED_FILE.mimeType,
      sha256Hash: SEED_FILE.sha256Hash,
    },
    create: {
      id: SEED_FILE.id,
      orgId: ORG_ID,
      folderId: SEED_PERSONAL_FOLDER.id,
      name: SEED_FILE.name,
      originalName: SEED_FILE.originalName,
      extension: SEED_FILE.extension,
      mimeType: SEED_FILE.mimeType,
      fileType: 'PDF',
      size: BigInt(SEED_FILE.size),
      sha256Hash: SEED_FILE.sha256Hash,
      status: 'ACTIVE',
      visibility: 'PRIVATE',
      ownerId: SEED_PERSONAL_FOLDER.ownerId,
    },
  });

  await prisma.storageObject.upsert({
    where: { id: STORAGE_OBJECT_ID },
    update: {},
    create: {
      id: STORAGE_OBJECT_ID,
      orgId: ORG_ID,
      fileId: SEED_FILE.id,
      storageKey: `tenant_${ORG_ID}/files/${SEED_FILE.id}/${VERSION_IDS[1]}`,
      bucket: process.env.S3_BUCKET ?? 'imkan-workdrive-dev',
      region: process.env.S3_REGION ?? 'us-east-1',
      size: BigInt(SEED_FILE.size),
      checksum: SEED_FILE.sha256Hash,
    },
  });

  for (let index = 0; index < SEED_FILE_VERSIONS.length; index += 1) {
    const version = SEED_FILE_VERSIONS[index];
    const isLatest = index === SEED_FILE_VERSIONS.length - 1;
    await prisma.fileVersion.upsert({
      where: {
        fileId_versionNumber: { fileId: SEED_FILE.id, versionNumber: version.versionNumber },
      },
      update: { status: isLatest ? 'ACTIVE' : 'SUPERSEDED' },
      create: {
        id: VERSION_IDS[index],
        orgId: ORG_ID,
        fileId: SEED_FILE.id,
        versionNumber: version.versionNumber,
        storageObjectId: STORAGE_OBJECT_ID,
        size: BigInt(version.size),
        mimeType: SEED_FILE.mimeType,
        extension: SEED_FILE.extension,
        sha256Hash: SEED_FILE.sha256Hash,
        uploadedById: SEED_PERSONAL_FOLDER.ownerId,
        status: isLatest ? 'ACTIVE' : 'SUPERSEDED',
      },
    });
  }

  await prisma.fileMetadata.upsert({
    where: { fileId: SEED_FILE.id },
    update: {},
    create: {
      id: FILE_METADATA_ID,
      fileId: SEED_FILE.id,
      pageCount: 12,
      language: 'en',
      title: 'Quarterly Report',
    },
  });

  await prisma.fileActivity.createMany({
    data: [
      {
        orgId: ORG_ID,
        fileId: SEED_FILE.id,
        userId: SEED_PERSONAL_FOLDER.ownerId,
        action: 'CREATE',
        metadata: { versionNumber: 1 },
      },
      {
        orgId: ORG_ID,
        fileId: SEED_FILE.id,
        userId: ADMIN_ID,
        action: 'UPLOAD_VERSION',
        metadata: { versionNumber: 2 },
      },
    ],
    skipDuplicates: true,
  }).catch(() => undefined);
}

async function seedShare(): Promise<void> {
  await prisma.fileShare.upsert({
    where: { id: SHARE_ID },
    update: {},
    create: {
      id: SHARE_ID,
      orgId: ORG_ID,
      fileId: SEED_FILE.id,
      createdById: SEED_PERSONAL_FOLDER.ownerId,
      permission: 'VIEW',
      status: 'ACTIVE',
      linkToken: SHARE_LINK_TOKEN,
      expiresAt: null,
      canDownload: true,
    },
  });
  await prisma.fileShareRecipient.upsert({
    where: { shareId_userId: { shareId: SHARE_ID, userId: MEMBER_ID } },
    update: {},
    create: {
      orgId: ORG_ID,
      shareId: SHARE_ID,
      userId: MEMBER_ID,
    },
  });
}

async function seedNotificationAndComment(): Promise<void> {
  await prisma.notification.upsert({
    where: { id: NOTIFICATION_ID },
    update: {},
    create: {
      id: NOTIFICATION_ID,
      orgId: ORG_ID,
      userId: MEMBER_ID,
      type: 'SHARE',
      priority: 'NORMAL',
      title: 'A file was shared with you',
      body: 'quarterly-report.pdf was shared with you by the organization admin.',
      resourceType: 'FILE',
      resourceId: SEED_FILE.id,
    },
  });

  await prisma.comment.upsert({
    where: { id: COMMENT_ID },
    update: {},
    create: {
      id: COMMENT_ID,
      orgId: ORG_ID,
      fileId: SEED_FILE.id,
      userId: MEMBER_ID,
      parentId: null,
      body: 'Please review section 2 before the board meeting.',
    },
  });
  await prisma.comment.upsert({
    where: { id: REPLY_ID },
    update: {},
    create: {
      id: REPLY_ID,
      orgId: ORG_ID,
      fileId: SEED_FILE.id,
      userId: ADMIN_ID,
      parentId: COMMENT_ID,
      body: 'On it - feedback by Friday.',
    },
  });
}

async function seedFavoriteAndTag(): Promise<void> {
  await prisma.favorite.upsert({
    where: {
      userId_resourceType_resourceId: {
        userId: MEMBER_ID,
        resourceType: 'FILE',
        resourceId: SEED_FILE.id,
      },
    },
    update: {},
    create: {
      id: FAVORITE_ID,
      orgId: ORG_ID,
      userId: MEMBER_ID,
      resourceType: 'FILE',
      resourceId: SEED_FILE.id,
    },
  });

  const tag = await prisma.tag.upsert({
    where: { orgId_name: { orgId: ORG_ID, name: SEED_TAG_NAME } },
    update: {},
    create: { id: TAG_ID, orgId: ORG_ID, name: SEED_TAG_NAME },
  });
  await prisma.fileTag.upsert({
    where: { fileId_tagId: { fileId: SEED_FILE.id, tagId: tag.id } },
    update: {},
    create: { fileId: SEED_FILE.id, tagId: tag.id },
  });
}

async function seedQuota(): Promise<void> {
  const usedBytes = SEED_FILE_VERSIONS.reduce(
    (total, version) => total + version.size,
    0,
  );
  await prisma.storageQuota.upsert({
    where: { orgId: ORG_ID },
    update: { usedBytes: BigInt(usedBytes) },
    create: {
      orgId: ORG_ID,
      quotaBytes: 10737418240n,
      usedBytes: BigInt(usedBytes),
    },
  });
}

async function main(): Promise<void> {
  await seedOrganization();
  await seedUsers();
  await seedTeamFolder();
  await seedFileWithVersions();
  await seedShare();
  await seedNotificationAndComment();
  await seedFavoriteAndTag();
  await seedQuota();
  console.log(`Seed complete for organization ${ORG_ID}`);
  console.log(`Share link token (raw): ${SHARE_LINK_TOKEN}`);
  console.log(`Share link token (sha256): ${createHash('sha256').update(SHARE_LINK_TOKEN).digest('hex')}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
