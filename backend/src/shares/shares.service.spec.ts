import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ResourceType } from '@prisma/client';
import { hashSecret } from '../crypto/secret-hash';
import { PermissionService } from '../permissions/permission.service';
import { SharesService } from './shares.service';

const ORG_A = '00000000-0000-4000-8000-000000000001';
const ORG_B = '00000000-0000-4000-8000-000000000002';
const FILE_A = '00000000-0000-4000-8000-000000000021';
const OWNER = '00000000-0000-4000-8000-000000000011';
const OTHER = '00000000-0000-4000-8000-000000000012';
const PERSONAL_FOLDER = { teamFolderId: null as string | null };
const TEAM_FOLDER_A = '00000000-0000-4000-8000-000000000061';
const TF_FOLDER = { teamFolderId: TEAM_FOLDER_A };

describe('SharesService', () => {
  const prisma = {
    file: { findFirst: jest.fn() },
    folder: { findFirst: jest.fn() },
    teamFolderMember: { findFirst: jest.fn() },
    fileShare: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
    fileShareRecipient: {
      findFirst: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
    },
    user: { findMany: jest.fn() },
    fileActivity: { create: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(async (arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg as unknown[]);
      return arg;
    }),
  };
  const storage = {
    buildObjectKey: jest.fn(),
    createUploadUrl: jest.fn(),
    createDownloadUrl: jest.fn(async () => ({
      url: 'http://127.0.0.1:3001/storage/objects?token=signed',
      method: 'GET' as const,
      objectKey: 'tenant_key',
      expiresInSeconds: 900,
    })),
    assertObjectExists: jest.fn(),
    deleteObject: jest.fn(),
    deleteStoredObject: jest.fn(),
  };
  const config = {
    get: () => 'https://workdrive.example',
  } as unknown as ConfigService;
  const service = new SharesService(
    prisma as never,
    new PermissionService(),
    config,
    storage,
  );

  const admin = {
    sub: OTHER,
    org_id: ORG_A,
    email: 'admin@example.imkan',
    role: 'ADMIN',
  };
  const viewer = {
    sub: OWNER,
    org_id: ORG_A,
    email: 'viewer@example.imkan',
    role: 'VIEWER',
  };
  const member = {
    sub: OTHER,
    org_id: ORG_A,
    email: 'member@example.imkan',
    role: 'MEMBER',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createShare', () => {
    it('creates a public link and audit event for an authorized admin', async () => {
      prisma.file.findFirst.mockResolvedValue({
        id: FILE_A,
        orgId: ORG_A,
        ownerId: OWNER,
        deletedAt: null,
        folder: PERSONAL_FOLDER,
      });

      const result = await service.createShare(admin, {
        resourceType: ResourceType.FILE,
        resourceId: FILE_A,
        expiresAt: new Date(Date.now() + 86_400_000),
        recipientUserIds: [],
        password: 's3cret-link',
        canDownload: false,
      });

      expect(prisma.file.findFirst).toHaveBeenCalledWith({
        where: { id: FILE_A, deletedAt: null },
        include: { folder: { select: { teamFolderId: true } } },
      });
      expect(result.link_url).toMatch(
        /^https:\/\/workdrive.example\/share\/public\//,
      );
      expect(prisma.fileShare.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orgId: ORG_A,
            fileId: FILE_A,
            createdById: OTHER,
            status: 'ACTIVE',
            canDownload: false,
          }),
        }),
      );
      const created = prisma.fileShare.create.mock.calls[0][0].data;
      expect(created.passwordHash).toBeTruthy();
      expect(created.passwordHash).not.toContain('s3cret-link');
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'SHARE_CREATED',
            orgId: ORG_A,
          }),
        }),
      );
      expect(prisma.fileActivity.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'SHARE', fileId: FILE_A }),
        }),
      );
    });

    it('returns 404 for a file in another tenant (IDOR)', async () => {
      prisma.file.findFirst.mockResolvedValue({
        id: FILE_A,
        orgId: ORG_B,
        ownerId: OWNER,
        deletedAt: null,
        folder: PERSONAL_FOLDER,
      });
      await expect(
        service.createShare(admin, {
          resourceType: ResourceType.FILE,
          resourceId: FILE_A,
          canDownload: true,
          recipientUserIds: [],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.fileShare.create).not.toHaveBeenCalled();
    });

    it('returns 403 when a viewer tries to create a share link', async () => {
      prisma.file.findFirst.mockResolvedValue({
        id: FILE_A,
        orgId: ORG_A,
        ownerId: OWNER,
        deletedAt: null,
        folder: PERSONAL_FOLDER,
      });
      await expect(
        service.createShare(viewer, {
          resourceType: ResourceType.FILE,
          resourceId: FILE_A,
          canDownload: true,
          recipientUserIds: [],
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns 404 when a same-org non-member creates a share for a Team Folder file', async () => {
      prisma.file.findFirst.mockResolvedValue({
        id: FILE_A,
        orgId: ORG_A,
        ownerId: OWNER,
        deletedAt: null,
        folder: TF_FOLDER,
      });
      prisma.teamFolderMember.findFirst.mockResolvedValue(null);
      await expect(
        service.createShare(member, {
          resourceType: ResourceType.FILE,
          resourceId: FILE_A,
          canDownload: true,
          recipientUserIds: [],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.fileShare.create).not.toHaveBeenCalled();
    });

    it('returns 403 when a Team Folder VIEWER can read but cannot create a share', async () => {
      prisma.file.findFirst.mockResolvedValue({
        id: FILE_A,
        orgId: ORG_A,
        ownerId: OWNER,
        deletedAt: null,
        folder: TF_FOLDER,
      });
      prisma.teamFolderMember.findFirst.mockResolvedValue({ role: 'VIEWER' });
      await expect(
        service.createShare(member, {
          resourceType: ResourceType.FILE,
          resourceId: FILE_A,
          canDownload: true,
          recipientUserIds: [],
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.fileShare.create).not.toHaveBeenCalled();
    });
  });

  describe('updateRecipient', () => {
    it('changes the share-level permission and records activity', async () => {
      prisma.fileShare.findFirst.mockResolvedValue({
        id: 'share-1',
        orgId: ORG_A,
        fileId: FILE_A,
        status: 'ACTIVE',
      });
      prisma.file.findFirst.mockResolvedValue({
        id: FILE_A,
        orgId: ORG_A,
        ownerId: OWNER,
        deletedAt: null,
        folder: PERSONAL_FOLDER,
      });
      prisma.fileShareRecipient.findFirst.mockResolvedValue({
        id: 'recipient-1',
        shareId: 'share-1',
        userId: OWNER,
        orgId: ORG_A,
      });

      const result = await service.updateRecipient(
        admin,
        'share-1',
        OWNER,
        'EDIT',
      );

      expect(result.permission).toBe('EDIT');
      expect(prisma.fileShare.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'share-1' },
          data: { permission: 'EDIT' },
        }),
      );
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'SHARE_PERMISSION_CHANGED' }),
        }),
      );
    });

    it('rejects an invalid permission value', async () => {
      await expect(
        service.updateRecipient(admin, 'share-1', OWNER, 'OWNER'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.fileShare.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('revokeShare', () => {
    it('marks the share REVOKED instead of deleting it', async () => {
      prisma.fileShare.findFirst.mockResolvedValue({
        id: 'share-1',
        orgId: ORG_A,
        fileId: FILE_A,
        status: 'ACTIVE',
      });
      prisma.file.findFirst.mockResolvedValue({
        id: FILE_A,
        orgId: ORG_A,
        ownerId: OTHER,
        deletedAt: null,
        folder: PERSONAL_FOLDER,
      });

      const result = await service.revokeShare(admin, 'share-1');

      expect(result.revoked).toBe(true);
      expect(prisma.fileShare.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'share-1' },
          data: expect.objectContaining({ status: 'REVOKED' }),
        }),
      );
    });

    it('returns 404 for an unknown share', async () => {
      prisma.fileShare.findFirst.mockResolvedValue(null);
      await expect(service.revokeShare(admin, 'missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('verifyPublicShare', () => {
    it('accepts the correct password on an active link', async () => {
      const passwordHash = await hashSecret('s3cret-link');
      prisma.fileShare.findFirst.mockResolvedValue({
        orgId: ORG_A,
        fileId: FILE_A,
        status: 'ACTIVE',
        passwordHash,
        expiresAt: new Date(Date.now() + 86_400_000),
        canDownload: true,
      });
      prisma.file.findFirst.mockResolvedValue({
        id: FILE_A,
        orgId: ORG_A,
        ownerId: OWNER,
        deletedAt: null,
        versions: [{ id: '00000000-0000-4000-8000-000000000031' }],
      });
      const result = await service.verifyPublicShare(
        'token-value-12345678',
        's3cret-link',
      );
      expect(result.resource_id).toBe(FILE_A);
      expect(result.resource_type).toBe(ResourceType.FILE);
      expect(result.can_download).toBe(true);
      expect(result.download_url).toBe(
        'http://127.0.0.1:3001/storage/objects?token=signed',
      );
    });

    it('rejects an incorrect password', async () => {
      const passwordHash = await hashSecret('s3cret-link');
      prisma.fileShare.findFirst.mockResolvedValue({
        fileId: FILE_A,
        status: 'ACTIVE',
        passwordHash,
        expiresAt: new Date(Date.now() + 86_400_000),
        canDownload: true,
      });
      await expect(
        service.verifyPublicShare('token-value-12345678', 'wrong-password'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('returns 404 and expires a lapsed link', async () => {
      prisma.fileShare.findFirst.mockResolvedValue({
        fileId: FILE_A,
        status: 'ACTIVE',
        passwordHash: null,
        expiresAt: new Date(Date.now() - 1000),
        canDownload: true,
      });
      await expect(
        service.verifyPublicShare('token-value-12345678'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.fileShare.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'EXPIRED' } }),
      );
    });

    it('returns 404 for a revoked link', async () => {
      prisma.fileShare.findFirst.mockResolvedValue({
        fileId: FILE_A,
        status: 'REVOKED',
        passwordHash: null,
        expiresAt: null,
        canDownload: true,
      });
      await expect(
        service.verifyPublicShare('token-value-12345678'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});


