import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PermissionService } from '../permissions/permission.service';
import { FoldersService } from './folders.service';

describe('FoldersService', () => {
  const prisma = {
    folder: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    file: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    teamFolder: {
      findFirst: jest.fn(),
    },
    teamFolderMember: {
      findFirst: jest.fn(),
    },
    auditLog: { create: jest.fn() },
  };
  const service = new FoldersService(prisma as never, new PermissionService());
  const orgA = '00000000-0000-4000-8000-000000000001';
  const user = {
    sub: '00000000-0000-4000-8000-000000000011',
    org_id: orgA,
    email: 'admin@example.imkan',
    role: 'ADMIN',
  };
  const member = {
    sub: '00000000-0000-4000-8000-000000000012',
    org_id: orgA,
    email: 'member@example.imkan',
    role: 'MEMBER',
  };
  const viewer = { ...user, role: 'VIEWER' };
  const folderId = '00000000-0000-4000-8000-000000000041';
  const teamFolderId = '00000000-0000-4000-8000-000000000021';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a folder owned by the authenticated tenant user', async () => {
    prisma.folder.create.mockResolvedValue({ id: 'folder-1', name: 'Inbox' });
    await service.create(user, { name: 'Inbox' });
    expect(prisma.folder.create).toHaveBeenCalledWith({
      data: {
        name: 'Inbox',
        parentId: undefined,
        teamFolderId: undefined,
        ownerId: user.sub,
        orgId: user.org_id,
      },
    });
  });

  it('returns 404 when attaching a teamFolderId that does not exist', async () => {
    prisma.teamFolder.findFirst.mockResolvedValue(null);
    await expect(
      service.create(user, { name: 'Inbox', teamFolderId }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.folder.create).not.toHaveBeenCalled();
  });

  it('returns 404 when attaching a teamFolderId from another organization', async () => {
    prisma.teamFolder.findFirst.mockResolvedValue({
      id: teamFolderId,
      orgId: '00000000-0000-4000-8000-000000000002',
      name: 'Foreign TF',
      isPublicToOrg: false,
    });
    await expect(
      service.create(user, { name: 'Inbox', teamFolderId }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.folder.create).not.toHaveBeenCalled();
  });

  it('returns 404 when a same-org non-member attaches an unreadable teamFolderId', async () => {
    prisma.teamFolder.findFirst.mockResolvedValue({
      id: teamFolderId,
      orgId: orgA,
      name: 'Private TF',
      isPublicToOrg: true,
    });
    await expect(
      service.create(member, { name: 'Inbox', teamFolderId }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.folder.create).not.toHaveBeenCalled();
  });

  it('creates a folder when an org ADMIN attaches a readable same-org teamFolderId', async () => {
    prisma.teamFolder.findFirst.mockResolvedValue({
      id: teamFolderId,
      orgId: orgA,
      name: 'Legal',
      isPublicToOrg: false,
    });
    prisma.teamFolderMember.findFirst.mockResolvedValue(null);
    prisma.folder.create.mockResolvedValue({ id: 'folder-1', name: 'Inbox' });
    await service.create(user, { name: 'Inbox', teamFolderId });
    expect(prisma.folder.create).toHaveBeenCalledWith({
      data: {
        name: 'Inbox',
        parentId: undefined,
        teamFolderId,
        ownerId: user.sub,
        orgId: user.org_id,
      },
    });
  });

  it('inherits teamFolderId from the parent folder', async () => {
    prisma.folder.findFirst.mockResolvedValue({
      id: folderId,
      orgId: orgA,
      teamFolderId,
      parentId: null,
    });
    prisma.teamFolder.findFirst.mockResolvedValue({
      id: teamFolderId,
      orgId: orgA,
      name: 'Legal',
    });
    prisma.folder.create.mockResolvedValue({ id: 'child-1', name: 'Child' });
    await service.create(user, { name: 'Child', parentId: folderId });
    expect(prisma.folder.create).toHaveBeenCalledWith({
      data: {
        name: 'Child',
        parentId: folderId,
        teamFolderId,
        ownerId: user.sub,
        orgId: user.org_id,
      },
    });
  });

  it('rejects a client teamFolderId that conflicts with the parent', async () => {
    prisma.folder.findFirst.mockResolvedValue({
      id: folderId,
      orgId: orgA,
      teamFolderId,
    });
    await expect(
      service.create(user, {
        name: 'Child',
        parentId: folderId,
        teamFolderId: '00000000-0000-4000-8000-000000000099',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.folder.create).not.toHaveBeenCalled();
  });

  it('returns 403 when a Team Folder VIEWER can read but cannot create a child folder', async () => {
    prisma.teamFolder.findFirst.mockResolvedValue({
      id: teamFolderId,
      orgId: orgA,
      name: 'Legal',
    });
    prisma.teamFolderMember.findFirst.mockResolvedValue({ role: 'VIEWER' });
    await expect(
      service.create(member, { name: 'Inbox', teamFolderId }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.folder.create).not.toHaveBeenCalled();
  });

  it('returns 404 when the folder is missing (including cross-tenant misses)', async () => {
    prisma.folder.findFirst.mockResolvedValue(null);
    await expect(
      service.getById(user, '00000000-0000-4000-8000-000000000099'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('omits an unreadable Team Folder root from listContents and keeps personal roots', async () => {
    const personal = {
      id: 'personal-1',
      orgId: orgA,
      teamFolderId: null,
      ownerId: member.sub,
      parentId: null,
      name: 'My',
    };
    const tfRoot = {
      id: folderId,
      orgId: orgA,
      teamFolderId,
      ownerId: user.sub,
      parentId: null,
      name: 'Legal',
    };
    prisma.folder.findMany.mockResolvedValue([personal, tfRoot]);
    prisma.file.findMany.mockResolvedValue([]);
    prisma.teamFolderMember.findFirst.mockResolvedValue(null);
    const result = await service.listContents(member);
    expect(result.folders.map((folder) => folder.id)).toEqual(['personal-1']);
  });

  it('lists a Team Folder root for an org ADMIN', async () => {
    const tfRoot = {
      id: folderId,
      orgId: orgA,
      teamFolderId,
      ownerId: user.sub,
      parentId: null,
      name: 'Legal',
    };
    prisma.folder.findMany.mockResolvedValue([tfRoot]);
    prisma.file.findMany.mockResolvedValue([]);
    prisma.teamFolderMember.findFirst.mockResolvedValue(null);
    const result = await service.listContents(user);
    expect(result.folders).toEqual([tfRoot]);
  });

  it('returns 404 when a same-org non-member gets a Team Folder by id', async () => {
    prisma.folder.findFirst.mockResolvedValue({
      id: folderId,
      orgId: orgA,
      teamFolderId,
      ownerId: user.sub,
      name: 'Legal',
    });
    prisma.teamFolderMember.findFirst.mockResolvedValue(null);
    await expect(service.getById(member, folderId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns 404 when listing children of an unreadable Team Folder', async () => {
    prisma.folder.findFirst.mockResolvedValue({
      id: folderId,
      orgId: orgA,
      teamFolderId,
      ownerId: user.sub,
      name: 'Legal',
    });
    prisma.teamFolderMember.findFirst.mockResolvedValue(null);
    await expect(service.listContents(member, folderId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.folder.findMany).not.toHaveBeenCalled();
    expect(prisma.file.findMany).not.toHaveBeenCalled();
  });

  it('returns a Team Folder and its children to an org ADMIN', async () => {
    const tfRoot = {
      id: folderId,
      orgId: orgA,
      teamFolderId,
      ownerId: user.sub,
      name: 'Legal',
    };
    const child = {
      id: 'child-1',
      orgId: orgA,
      teamFolderId,
      ownerId: user.sub,
      parentId: folderId,
      name: 'Child',
    };
    prisma.folder.findFirst.mockResolvedValue(tfRoot);
    prisma.folder.findMany.mockResolvedValue([child]);
    prisma.file.findMany.mockResolvedValue([]);
    prisma.teamFolderMember.findFirst.mockResolvedValue(null);
    const result = await service.getById(user, folderId);
    expect(result.id).toBe(folderId);
    expect(result.folders).toEqual([child]);
  });

  it('renames a folder in the authenticated tenant', async () => {
    prisma.folder.findFirst.mockResolvedValue({
      id: folderId,
      orgId: user.org_id,
      ownerId: user.sub,
      name: 'Inbox',
      teamFolderId: null,
    });
    prisma.folder.update.mockResolvedValue({ id: folderId, name: 'Archive' });
    await service.rename(user, folderId, 'Archive');
    expect(prisma.folder.update).toHaveBeenCalledWith({
      where: { id: folderId },
      data: { name: 'Archive' },
    });
  });

  it('denies a viewer rename', async () => {
    prisma.folder.findFirst.mockResolvedValue({
      id: folderId,
      orgId: user.org_id,
      ownerId: user.sub,
      name: 'Inbox',
      teamFolderId: null,
    });
    await expect(
      service.rename(viewer, folderId, 'Archive'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns 404 when a same-org non-member renames a Team Folder root', async () => {
    prisma.folder.findFirst.mockResolvedValue({
      id: folderId,
      orgId: orgA,
      ownerId: user.sub,
      name: 'Legal',
      teamFolderId,
    });
    prisma.teamFolderMember.findFirst.mockResolvedValue(null);
    await expect(
      service.rename(member, folderId, 'hijacked-root'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.folder.update).not.toHaveBeenCalled();
  });

  it('returns 403 when a Team Folder VIEWER can read but cannot rename the root', async () => {
    prisma.folder.findFirst.mockResolvedValue({
      id: folderId,
      orgId: orgA,
      ownerId: user.sub,
      name: 'Legal',
      teamFolderId,
    });
    prisma.teamFolderMember.findFirst.mockResolvedValue({ role: 'VIEWER' });
    await expect(
      service.rename(member, folderId, 'hijacked-root'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.folder.update).not.toHaveBeenCalled();
  });
});
