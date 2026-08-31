import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { PermissionService } from '../permissions/permission.service';
import { FilesService } from './files.service';
import type { StorageService } from '../storage/storage.types';

const ORG_A = '00000000-0000-4000-8000-000000000001';
const ORG_B = '00000000-0000-4000-8000-000000000002';
const FOLDER_A = '00000000-0000-4000-8000-000000000041';
const FILE_A = '00000000-0000-4000-8000-000000000021';
const VERSION_A = '00000000-0000-4000-8000-000000000031';
const USER_A = '00000000-0000-4000-8000-000000000011';
const MEMBER_A = '00000000-0000-4000-8000-000000000012';
const TEAM_FOLDER_A = '00000000-0000-4000-8000-000000000061';
const PERSONAL_FOLDER = { teamFolderId: null as string | null };
const TF_FOLDER = { teamFolderId: TEAM_FOLDER_A };
const FILE_TEAM_FOLDER_INCLUDE = {
  include: { folder: { select: { teamFolderId: true } } },
} as const;

describe('FilesService', () => {
  const storage: StorageService = {
    buildObjectKey: jest.fn(
      (fileId, versionId) => `tenant_${ORG_A}/files/${fileId}/${versionId}`,
    ),
    createUploadUrl: jest.fn(async () => ({
      url: 'https://signed.example/put',
      method: 'PUT' as const,
      objectKey: 'tenant_key',
      expiresInSeconds: 900,
    })),
    createDownloadUrl: jest.fn(async () => ({
      url: 'https://signed.example/get',
      method: 'GET' as const,
      objectKey: 'tenant_key',
      expiresInSeconds: 900,
    })),
    assertObjectExists: jest.fn(async () => undefined),
    deleteObject: jest.fn(async () => undefined),
    deleteStoredObject: jest.fn(async () => undefined),
    resolveObjectPath: jest.fn(),
  };

  const prisma = {
    folder: { findFirst: jest.fn() },
    file: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    fileVersion: {
      create: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    storageObject: { create: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn() },
    fileShare: { findFirst: jest.fn(async () => null) },
    teamFolder: { findFirst: jest.fn(async () => null) },
    fileActivity: { create: jest.fn() },
    trashEntry: { create: jest.fn(), updateMany: jest.fn() },
    storageQuota: { upsert: jest.fn() },
    teamFolderMember: { findFirst: jest.fn() },
    auditLog: { create: jest.fn() },
    $queryRawUnsafe: jest.fn(async () => []),
    $transaction: jest.fn(),
  };
  const quota = { assertAvailable: jest.fn(async () => undefined) };
  const config = { get: jest.fn(() => undefined) };

  const service = new FilesService(
    prisma as never,
    storage,
    new PermissionService(),
    quota as never,
    config as never,
  );
  const user = {
    sub: USER_A,
    org_id: ORG_A,
    email: 'admin@example.imkan',
    role: 'ADMIN',
  };
  const member = {
    sub: MEMBER_A,
    org_id: ORG_A,
    email: 'member@example.imkan',
    role: 'MEMBER',
  };
  const input = {
    name: 'spec.pdf',
    folderId: FOLDER_A,
    size: 2048,
    mimeType: 'application/pdf',
    sha256: 'b'.repeat(64),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg as unknown[]);
      return (arg as (tx: typeof prisma) => unknown)(prisma);
    });
    (storage.assertObjectExists as jest.Mock).mockResolvedValue(undefined);
    (storage.createDownloadUrl as jest.Mock).mockResolvedValue({
      url: 'https://signed.example/get',
      method: 'GET',
      objectKey: 'tenant_key',
      expiresInSeconds: 900,
    });
  });

  describe('requestUpload', () => {
    it('prepares file metadata and returns the signed upload contract', async () => {
      prisma.folder.findFirst.mockResolvedValue({
        id: FOLDER_A,
        orgId: ORG_A,
      });

      const result = await service.requestUpload(user, input);

      expect(result.upload_url).toBe('https://signed.example/put');
      expect(storage.createUploadUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerOrgId: ORG_A,
          contentType: 'application/pdf',
        }),
      );
      expect(prisma.storageObject.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            storageKey: expect.stringContaining(`${ORG_A}`),
            bucket: 'imkan-workdrive-dev',
            region: 'us-east-1',
            size: BigInt(2048),
          }),
        }),
      );
      expect(prisma.file.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            originalName: 'spec.pdf',
            extension: 'pdf',
            fileType: 'PDF',
            status: 'ACTIVE',
            size: BigInt(2048),
          }),
        }),
      );
      expect(prisma.fileVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            versionNumber: 1,
            storageObjectId: expect.any(String),
            status: 'ACTIVE',
          }),
        }),
      );
      expect(prisma.fileActivity.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'CREATE' }),
        }),
      );
    });

    it('returns 404 for a folder owned by another tenant (IDOR)', async () => {
      prisma.folder.findFirst.mockResolvedValue({
        id: FOLDER_A,
        orgId: ORG_B,
      });
      await expect(service.requestUpload(user, input)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(storage.createUploadUrl).not.toHaveBeenCalled();
    });

    it('returns 404 when a same-org non-member uploads into a Team Folder', async () => {
      prisma.folder.findFirst.mockResolvedValue({
        id: FOLDER_A,
        orgId: ORG_A,
        ownerId: USER_A,
        teamFolderId: TEAM_FOLDER_A,
      });
      prisma.teamFolderMember.findFirst.mockResolvedValue(null);
      await expect(service.requestUpload(member, input)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(storage.createUploadUrl).not.toHaveBeenCalled();
    });

    it('returns 403 when a Team Folder VIEWER can read but cannot upload', async () => {
      prisma.folder.findFirst.mockResolvedValue({
        id: FOLDER_A,
        orgId: ORG_A,
        ownerId: USER_A,
        teamFolderId: TEAM_FOLDER_A,
      });
      prisma.teamFolderMember.findFirst.mockResolvedValue({ role: 'VIEWER' });
      await expect(service.requestUpload(member, input)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(storage.createUploadUrl).not.toHaveBeenCalled();
    });
  });

  describe('completeUpload', () => {
    it('verifies the object, writes an audit log, and returns complete', async () => {
      prisma.fileVersion.findFirst.mockResolvedValue({
        id: VERSION_A,
        orgId: ORG_A,
        fileId: FILE_A,
        versionNumber: 1,
        size: BigInt(2048),
        mimeType: 'application/pdf',
        sha256Hash: 'a'.repeat(64),
        file: { id: FILE_A, deletedAt: null, orgId: ORG_A },
      });

      const result = await service.completeUpload(user, VERSION_A);

      expect(result).toEqual({
        file_id: FILE_A,
        upload_id: VERSION_A,
        status: 'complete',
      });
      expect(storage.assertObjectExists).toHaveBeenCalledWith({
        fileId: FILE_A,
        versionId: VERSION_A,
        ownerOrgId: ORG_A,
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'FILE_UPLOAD_COMPLETE',
            resourceId: FILE_A,
            orgId: ORG_A,
          }),
        }),
      );
    });

    it('returns 404 for a version owned by another tenant (IDOR)', async () => {
      prisma.fileVersion.findFirst.mockResolvedValue({
        id: VERSION_A,
        orgId: ORG_B,
        fileId: FILE_A,
        file: { id: FILE_A, deletedAt: null, orgId: ORG_B },
      });
      await expect(
        service.completeUpload(user, VERSION_A),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(storage.assertObjectExists).not.toHaveBeenCalled();
    });

    it('rejects completion when the object is missing from storage', async () => {
      prisma.fileVersion.findFirst.mockResolvedValue({
        id: VERSION_A,
        orgId: ORG_A,
        fileId: FILE_A,
        file: { id: FILE_A, deletedAt: null, orgId: ORG_A },
      });
      (storage.assertObjectExists as jest.Mock).mockRejectedValue(
        new BadRequestException('Uploaded object was not found'),
      );
      await expect(
        service.completeUpload(user, VERSION_A),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });
  });

  describe('createDownloadUrl', () => {
    it('returns a signed download URL for the latest version', async () => {
      prisma.file.findFirst.mockResolvedValue({
        id: FILE_A,
        orgId: ORG_A,
        ownerId: USER_A,
        name: 'contract.pdf',
        deletedAt: null,
        versions: [
          { id: VERSION_A, versionNumber: 1, mimeType: 'application/pdf' },
        ],
      });

      const result = await service.createDownloadUrl(user, FILE_A);

      expect(result).toEqual({
        download_url: 'https://signed.example/get',
        expires_in_seconds: 900,
        file_id: FILE_A,
      });
      expect(storage.createDownloadUrl).toHaveBeenCalledWith({
        fileId: FILE_A,
        versionId: VERSION_A,
        ownerOrgId: ORG_A,
        contentType: 'application/pdf',
        disposition: 'attachment',
        fileName: 'contract.pdf',
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'FILE_DOWNLOAD',
            orgId: ORG_A,
          }),
        }),
      );
    });

    it('returns 404 for a file owned by another tenant (IDOR)', async () => {
      prisma.file.findFirst.mockResolvedValue({
        id: FILE_A,
        orgId: ORG_B,
        deletedAt: null,
        versions: [{ id: VERSION_A, versionNumber: 1 }],
      });
      await expect(
        service.createDownloadUrl(user, FILE_A),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(storage.createDownloadUrl).not.toHaveBeenCalled();
    });

    it('returns 404 for a soft-deleted file', async () => {
      prisma.file.findFirst.mockResolvedValue(null);
      await expect(
        service.createDownloadUrl(user, FILE_A),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns 404 when a same-org non-member downloads a Team Folder file', async () => {
      prisma.file.findFirst.mockResolvedValue({
        id: FILE_A,
        orgId: ORG_A,
        ownerId: USER_A,
        deletedAt: null,
        folder: TF_FOLDER,
        versions: [
          { id: VERSION_A, versionNumber: 1, mimeType: 'application/pdf' },
        ],
      });
      prisma.teamFolderMember.findFirst.mockResolvedValue(null);
      await expect(
        service.createDownloadUrl(member, FILE_A),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(storage.createDownloadUrl).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });
  });

  describe('rename and trash', () => {
    it('renames a file in the authenticated tenant', async () => {
      prisma.file.findFirst.mockResolvedValue({
        id: FILE_A,
        orgId: ORG_A,
        ownerId: USER_A,
        deletedAt: null,
        name: 'spec.pdf',
        folder: PERSONAL_FOLDER,
      });
      prisma.file.update.mockResolvedValue({ id: FILE_A, name: 'final.pdf' });
      await service.rename(user, FILE_A, 'final.pdf');
      expect(prisma.file.findFirst).toHaveBeenCalledWith({
        where: { id: FILE_A, deletedAt: null },
        ...FILE_TEAM_FOLDER_INCLUDE,
      });
      expect(prisma.file.update).toHaveBeenCalledWith({
        where: { id: FILE_A },
        data: { name: 'final.pdf' },
      });
    });

    it('returns 404 when trashing a file from another tenant', async () => {
      prisma.file.findFirst.mockResolvedValue({
        id: FILE_A,
        orgId: ORG_B,
        ownerId: USER_A,
        deletedAt: null,
        folder: PERSONAL_FOLDER,
      });
      await expect(service.trash(user, FILE_A)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.file.update).not.toHaveBeenCalled();
    });

    it('soft-deletes a file', async () => {
      prisma.file.findFirst.mockResolvedValue({
        id: FILE_A,
        orgId: ORG_A,
        ownerId: USER_A,
        deletedAt: null,
        folder: PERSONAL_FOLDER,
      });
      prisma.file.update.mockResolvedValue({
        id: FILE_A,
        deletedAt: new Date(),
      });
      await service.trash(user, FILE_A);
      expect(prisma.file.findFirst).toHaveBeenCalledWith({
        where: { id: FILE_A, deletedAt: null },
        ...FILE_TEAM_FOLDER_INCLUDE,
      });
      expect(prisma.file.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: FILE_A },
          data: expect.objectContaining({
            deletedAt: expect.any(Date),
            status: 'TRASHED',
          }),
        }),
      );
      expect(prisma.trashEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fileId: FILE_A,
            deletedById: USER_A,
            expiresAt: expect.any(Date),
          }),
        }),
      );
    });

    it('returns 404 when a same-org non-member renames a Team Folder file', async () => {
      prisma.file.findFirst.mockResolvedValue({
        id: FILE_A,
        orgId: ORG_A,
        ownerId: USER_A,
        deletedAt: null,
        folder: TF_FOLDER,
      });
      prisma.teamFolderMember.findFirst.mockResolvedValue(null);
      await expect(
        service.rename(member, FILE_A, 'hijacked.txt'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.file.update).not.toHaveBeenCalled();
    });

    it('returns 404 when a same-org non-member trashes a Team Folder file', async () => {
      prisma.file.findFirst.mockResolvedValue({
        id: FILE_A,
        orgId: ORG_A,
        ownerId: USER_A,
        deletedAt: null,
        folder: TF_FOLDER,
      });
      prisma.teamFolderMember.findFirst.mockResolvedValue(null);
      await expect(service.trash(member, FILE_A)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.file.update).not.toHaveBeenCalled();
    });

    it('returns 404 when a same-org non-member restores a Team Folder file', async () => {
      prisma.file.findFirst.mockResolvedValue({
        id: FILE_A,
        orgId: ORG_A,
        ownerId: USER_A,
        deletedAt: new Date(),
        folder: TF_FOLDER,
      });
      prisma.teamFolderMember.findFirst.mockResolvedValue(null);
      await expect(service.restore(member, FILE_A)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.file.update).not.toHaveBeenCalled();
    });

    it('returns 403 when a Team Folder VIEWER can read but cannot rename a file', async () => {
      prisma.file.findFirst.mockResolvedValue({
        id: FILE_A,
        orgId: ORG_A,
        ownerId: USER_A,
        deletedAt: null,
        folder: TF_FOLDER,
      });
      prisma.teamFolderMember.findFirst.mockResolvedValue({ role: 'VIEWER' });
      await expect(
        service.rename(member, FILE_A, 'hijacked.txt'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.file.update).not.toHaveBeenCalled();
    });
  });

  describe('listTrash', () => {
    it('omits an unreadable Team Folder trashed file for a same-org non-member', async () => {
      prisma.file.findMany.mockResolvedValue([
        {
          id: FILE_A,
          orgId: ORG_A,
          ownerId: USER_A,
          name: 'legal.txt',
          deletedAt: new Date(),
          folder: TF_FOLDER,
        },
      ]);
      prisma.teamFolderMember.findFirst.mockResolvedValue(null);
      const result = await service.listTrash(member);
      expect(result).toEqual([]);
      expect(prisma.file.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orgId: ORG_A, deletedAt: { not: null } },
        }),
      );
    });
  });

  describe('streamFile', () => {
    let storageRoot: string;
    const PAYLOAD = Buffer.from('hello-preview');

    const activeFileVersion = {
      id: VERSION_A,
      storageObjectId: 'so-1',
      versionNumber: 1,
      status: 'ACTIVE',
      mimeType: 'application/pdf',
      size: PAYLOAD.length,
    };

    const readableActiveFile = {
      id: FILE_A,
      orgId: ORG_A,
      ownerId: USER_A,
      name: 'spec.pdf',
      deletedAt: null,
      sha256Hash: null,
      folder: PERSONAL_FOLDER,
      versions: [activeFileVersion],
    };

    /** Express-like response built on a real duplex stream so piping works. */
    const fakeStreamResponse = () => {
      const response = new PassThrough() as unknown as Record<string, unknown>;
      // Both mocks return `this` because streamFile chains
      // `response.status(...).setHeader(...).setHeader(...)`.
      response.setHeader = jest.fn().mockReturnThis();
      response.status = jest.fn().mockReturnThis();
      response.headersSent = false;
      return response as never;
    };

    beforeEach(async () => {
      storageRoot = await mkdtemp(join(tmpdir(), 'workdrive-stream-'));
      prisma.file.findFirst.mockResolvedValue(readableActiveFile);
      prisma.storageObject.findFirst.mockResolvedValue({
        id: 'so-1',
        storageKey: `tenant_${ORG_A}/files/${FILE_A}/${VERSION_A}`,
        size: PAYLOAD.length,
      });
    });

    afterEach(async () => {
      await rm(storageRoot, { recursive: true, force: true });
    });

    it('returns 404 when the physical object is missing from the storage disk', async () => {
      // Database row exists but the bytes were removed from the disk.
      (storage.resolveObjectPath as jest.Mock).mockReturnValue(
        join(storageRoot, 'missing', 'object.bin'),
      );
      const setHeader = jest.fn();
      const response = {
        setHeader,
        status: jest.fn().mockReturnThis(),
        end: jest.fn(),
      };

      await expect(
        service.streamFile(user, FILE_A, response as never),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.streamFile(user, FILE_A, response as never),
      ).rejects.toThrow('File object not found on storage disk');
      // No stream headers may leak onto the response before the 404.
      expect(setHeader).not.toHaveBeenCalled();
    });

    it('streams the whole object when it exists on the storage disk', async () => {
      const objectPath = join(storageRoot, 'object.bin');
      await writeFile(objectPath, PAYLOAD);
      (storage.resolveObjectPath as jest.Mock).mockReturnValue(objectPath);

      const response = fakeStreamResponse();
      const chunks: Buffer[] = [];
      (response as unknown as PassThrough).on('data', (chunk: Buffer) =>
        chunks.push(chunk),
      );
      const finished = new Promise<void>((resolve) =>
        (response as unknown as PassThrough).on('end', resolve),
      );

      await service.streamFile(user, FILE_A, response);
      await finished;

      expect(Buffer.concat(chunks).toString('utf8')).toBe('hello-preview');
    });

    it('honours an HTTP Range request with a 206 partial response', async () => {
      const objectPath = join(storageRoot, 'object.bin');
      await writeFile(objectPath, PAYLOAD);
      (storage.resolveObjectPath as jest.Mock).mockReturnValue(objectPath);

      const response = fakeStreamResponse();
      const chunks: Buffer[] = [];
      (response as unknown as PassThrough).on('data', (chunk: Buffer) =>
        chunks.push(chunk),
      );
      const finished = new Promise<void>((resolve) =>
        (response as unknown as PassThrough).on('end', resolve),
      );

      await service.streamFile(user, FILE_A, response, 'bytes=0-4');
      await finished;

      expect(response['status']).toHaveBeenCalledWith(206);
      expect(Buffer.concat(chunks).toString('utf8')).toBe('hello');
    });
  });
});
