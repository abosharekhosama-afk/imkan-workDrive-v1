import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PermissionService } from '../permissions/permission.service';
import { FilesService } from './files.service';

const ORG_A = '00000000-0000-4000-8000-000000000001';
const ORG_B = '00000000-0000-4000-8000-000000000002';
const FILE_A = '00000000-0000-4000-8000-000000000021';
const USER_A = '00000000-0000-4000-8000-000000000011';
const MEMBER_A = '00000000-0000-4000-8000-000000000012';
const TEAM_FOLDER_A = '00000000-0000-4000-8000-000000000061';
const PERSONAL_FOLDER = { teamFolderId: null as string | null };
const TF_FOLDER = { teamFolderId: TEAM_FOLDER_A };

describe('FilesService trash restore', () => {
  const storage = {
    buildObjectKey: jest.fn(),
    createUploadUrl: jest.fn(),
    createDownloadUrl: jest.fn(),
    assertObjectExists: jest.fn(),
    deleteObject: jest.fn(),
    deleteStoredObject: jest.fn(),
  };
  const prisma = {
    file: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    teamFolderMember: { findFirst: jest.fn() },
    auditLog: { create: jest.fn() },
    trashEntry: { create: jest.fn(), updateMany: jest.fn() },
    fileActivity: { create: jest.fn() },
  };
  const service = new FilesService(
    prisma as never,
    storage,
    new PermissionService(),
    { assertAvailable: jest.fn() } as never,
    { get: jest.fn(() => undefined) } as never,
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

  beforeEach(() => jest.clearAllMocks());

  it('lists only trashed files for the JWT tenant', async () => {
    prisma.file.findMany.mockResolvedValue([
      { id: FILE_A, deletedAt: new Date() },
    ]);
    await service.listTrash(user);
    expect(prisma.file.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: ORG_A, deletedAt: { not: null } },
      }),
    );
  });

  it('omits an unreadable Team Folder trashed file and keeps personal trash', async () => {
    const personal = {
      id: FILE_A,
      orgId: ORG_A,
      ownerId: MEMBER_A,
      name: 'notes.txt',
      deletedAt: new Date(),
      folder: PERSONAL_FOLDER,
    };
    const tfFile = {
      id: '00000000-0000-4000-8000-000000000022',
      orgId: ORG_A,
      ownerId: USER_A,
      name: 'legal.txt',
      deletedAt: new Date(),
      folder: TF_FOLDER,
    };
    prisma.file.findMany.mockResolvedValue([personal, tfFile]);
    prisma.teamFolderMember.findFirst.mockResolvedValue(null);
    const result = await service.listTrash(member);
    expect(result.map((file) => file.id)).toEqual([FILE_A]);
    expect(result[0]).not.toHaveProperty('folder');
  });

  it('lists a readable Team Folder trashed file for an org ADMIN', async () => {
    const tfFile = {
      id: FILE_A,
      orgId: ORG_A,
      ownerId: USER_A,
      name: 'legal.txt',
      deletedAt: new Date(),
      folder: TF_FOLDER,
    };
    prisma.file.findMany.mockResolvedValue([tfFile]);
    prisma.teamFolderMember.findFirst.mockResolvedValue(null);
    const result = await service.listTrash(user);
    expect(result.map((file) => file.id)).toEqual([FILE_A]);
  });

  it('restores a trashed file in the authenticated tenant', async () => {
    prisma.file.findFirst.mockResolvedValue({
      id: FILE_A,
      orgId: ORG_A,
      ownerId: USER_A,
      deletedAt: new Date(),
      folder: PERSONAL_FOLDER,
    });
    prisma.file.update.mockResolvedValue({ id: FILE_A, deletedAt: null });
    await service.restore(user, FILE_A);
    expect(prisma.file.findFirst).toHaveBeenCalledWith({
      where: { id: FILE_A, deletedAt: { not: null } },
      include: { folder: { select: { teamFolderId: true } } },
    });
    expect(prisma.file.update).toHaveBeenCalledWith({
      where: { id: FILE_A },
      data: { deletedAt: null, status: 'ACTIVE' },
    });
    expect(prisma.trashEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { fileId: FILE_A, restoredAt: null },
        data: expect.objectContaining({ restoredById: USER_A }),
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'FILE_RESTORED',
          orgId: ORG_A,
        }),
      }),
    );
  });

  it('returns 404 when restoring another tenant file (IDOR)', async () => {
    prisma.file.findFirst.mockResolvedValue({
      id: FILE_A,
      orgId: ORG_B,
      ownerId: USER_A,
      deletedAt: new Date(),
      folder: PERSONAL_FOLDER,
    });
    await expect(service.restore(user, FILE_A)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.file.update).not.toHaveBeenCalled();
  });

  it('denies a viewer restore', async () => {
    prisma.file.findFirst.mockResolvedValue({
      id: FILE_A,
      orgId: ORG_A,
      ownerId: USER_A,
      deletedAt: new Date(),
      folder: PERSONAL_FOLDER,
    });
    await expect(
      service.restore({ ...user, role: 'VIEWER' }, FILE_A),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
