import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { TeamFolderRole } from '@prisma/client';
import { PermissionService } from '../permissions/permission.service';
import { TeamFoldersService } from './team-folders.service';

const ORG_A = '00000000-0000-4000-8000-000000000001';
const ORG_B = '00000000-0000-4000-8000-000000000002';
const TF_A = '00000000-0000-4000-8000-000000000021';
const ROOT_A = '00000000-0000-4000-8000-000000000041';
const ADMIN_ID = '00000000-0000-4000-8000-000000000011';
const MEMBER_ID = '00000000-0000-4000-8000-000000000012';
const VIEWER_ID = '00000000-0000-4000-8000-000000000013';
const EDITOR_ID = '00000000-0000-4000-8000-000000000014';
const ORGANIZER_ID = '00000000-0000-4000-8000-000000000015';
const TF_ADMIN_ID = '00000000-0000-4000-8000-000000000016';
const INVITEE_ID = '00000000-0000-4000-8000-000000000017';
const FOREIGN_ID = '00000000-0000-4000-8000-000000000018';

describe('TeamFoldersService', () => {
  const prisma = {
    $transaction: jest.fn(),
    teamFolder: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    teamFolderMember: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
    folder: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    file: { findFirst: jest.fn() },
    user: { findFirst: jest.fn() },
    organizationMembership: { findFirst: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const service = new TeamFoldersService(
    prisma as never,
    new PermissionService(),
  );
  const admin = {
    sub: ADMIN_ID,
    org_id: ORG_A,
    email: 'admin@example.imkan',
    role: 'ADMIN' as const,
  };
  const member = {
    sub: MEMBER_ID,
    org_id: ORG_A,
    email: 'member@example.imkan',
    role: 'MEMBER' as const,
  };
  const viewer = { ...member, sub: VIEWER_ID, email: 'viewer@example.imkan' };
  const editor = { ...member, sub: EDITOR_ID, email: 'editor@example.imkan' };
  const organizer = {
    ...member,
    sub: ORGANIZER_ID,
    email: 'organizer@example.imkan',
  };
  const tfAdmin = {
    ...member,
    sub: TF_ADMIN_ID,
    email: 'tf-admin@example.imkan',
  };
  const teamFolder = { id: TF_A, orgId: ORG_A, name: 'Legal' };

  function membership(userId: string, role: TeamFolderRole) {
    return { teamFolderId: TF_A, userId, orgId: ORG_A, role };
  }

  function mockCallerRole(roleByUserId: Record<string, TeamFolderRole | null>) {
    prisma.teamFolderMember.findFirst.mockImplementation(
      async (args: { where: { userId?: string } }) => {
        const userId = args.where.userId;
        if (!userId) {
          return null;
        }
        const role = roleByUserId[userId];
        if (!role) {
          return null;
        }
        return membership(userId, role);
      },
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      async (fn: (tx: typeof prisma) => unknown) => fn(prisma),
    );
    prisma.teamFolder.findFirst.mockResolvedValue(teamFolder);
    prisma.user.findFirst.mockImplementation(async ({ where }: { where: { id: string } }) => ({ id: where.id, email: `${where.id}@example.imkan` }));
    prisma.organizationMembership.findFirst.mockImplementation(async ({ where }: { where: { userId: string } }) => ({ userId: where.userId, organizationId: ORG_A, status: 'ACTIVE' }));
  });

  it('forbids a MEMBER from creating a Team Folder', async () => {
    await expect(
      service.create(member, { name: 'Legal' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.teamFolder.create).not.toHaveBeenCalled();
    expect(prisma.folder.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('creates a Team Folder, root folder, and TEAM_FOLDER_CREATED audit in one transaction', async () => {
    prisma.teamFolder.create.mockResolvedValue({
      id: TF_A,
      orgId: ORG_A,
      name: 'Legal',
    });
    prisma.folder.create.mockResolvedValue({ id: ROOT_A });
    prisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });

    const created = await service.create(admin, { name: 'Legal' });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.teamFolder.create).toHaveBeenCalledWith({
      data: { name: 'Legal', orgId: ORG_A },
    });
    expect(prisma.folder.create).toHaveBeenCalledWith({
      data: {
        name: 'Legal',
        orgId: ORG_A,
        teamFolderId: TF_A,
        parentId: null,
        ownerId: admin.sub,
      },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        orgId: ORG_A,
        actorId: admin.sub,
        action: 'TEAM_FOLDER_CREATED',
        resourceType: 'TEAM_FOLDER',
        resourceId: TF_A,
      },
    });
    expect(created).toEqual({
      id: TF_A,
      orgId: ORG_A,
      name: 'Legal',
      rootFolderId: ROOT_A,
    });
  });

  it('rolls back the Team Folder when root folder creation fails', async () => {
    const committed = { teamFolder: false, rootFolder: false, audit: false };
    prisma.$transaction.mockImplementation(
      async (fn: (tx: unknown) => unknown) => {
        const tx = {
          teamFolder: {
            create: jest.fn(
              async (args: { data: { name: string; orgId: string } }) => {
                committed.teamFolder = true;
                return {
                  id: TF_A,
                  orgId: args.data.orgId,
                  name: args.data.name,
                };
              },
            ),
          },
          folder: {
            create: jest.fn(async () => {
              throw new Error('root folder insert failed');
            }),
          },
          auditLog: {
            create: jest.fn(async () => {
              committed.audit = true;
            }),
          },
        };
        try {
          return await fn(tx);
        } catch (error) {
          committed.teamFolder = false;
          committed.rootFolder = false;
          committed.audit = false;
          throw error;
        }
      },
    );

    await expect(service.create(admin, { name: 'Legal' })).rejects.toThrow(
      'root folder insert failed',
    );
    expect(committed.teamFolder).toBe(false);
    expect(committed.rootFolder).toBe(false);
    expect(committed.audit).toBe(false);
  });

  it('omits an unreadable Team Folder from list for a same-org non-member', async () => {
    prisma.teamFolder.findMany.mockResolvedValue([
      { id: TF_A, orgId: ORG_A, name: 'Legal' },
    ]);
    prisma.teamFolderMember.findFirst.mockResolvedValue(null);
    const result = await service.list(member);
    expect(result.teamFolders).toEqual([]);
  });

  it('lists a Team Folder for an org ADMIN', async () => {
    prisma.teamFolder.findMany.mockResolvedValue([
      { id: TF_A, orgId: ORG_A, name: 'Legal' },
    ]);
    prisma.teamFolderMember.findFirst.mockResolvedValue(null);
    prisma.folder.findFirst.mockResolvedValue({ id: ROOT_A });
    const result = await service.list(admin);
    expect(result.teamFolders).toEqual([
      { id: TF_A, name: 'Legal', rootFolderId: ROOT_A, role: 'ORG_ADMIN' },
    ]);
  });

  it('returns 404 when a same-org non-member gets a Team Folder by id', async () => {
    prisma.teamFolderMember.findFirst.mockResolvedValue(null);
    await expect(service.getById(member, TF_A)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('forbids a VIEWER from managing members', async () => {
    mockCallerRole({ [VIEWER_ID]: TeamFolderRole.VIEWER });
    await expect(
      service.addMember(viewer, TF_A, {
        userId: INVITEE_ID,
        role: TeamFolderRole.VIEWER,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.teamFolderMember.create).not.toHaveBeenCalled();
  });

  it('forbids an EDITOR from managing members', async () => {
    mockCallerRole({ [EDITOR_ID]: TeamFolderRole.EDITOR });
    await expect(
      service.addMember(editor, TF_A, {
        userId: INVITEE_ID,
        role: TeamFolderRole.VIEWER,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.teamFolderMember.create).not.toHaveBeenCalled();
  });

  it('lets an ORGANIZER add EDITOR and VIEWER members only', async () => {
    mockCallerRole({ [ORGANIZER_ID]: TeamFolderRole.ORGANIZER });
    prisma.user.findFirst.mockResolvedValue({
      id: INVITEE_ID,
      orgId: ORG_A,
      email: 'i@x',
    });
    prisma.teamFolderMember.create.mockResolvedValue(
      membership(INVITEE_ID, TeamFolderRole.VIEWER),
    );

    const added = await service.addMember(organizer, TF_A, {
      userId: INVITEE_ID,
      role: TeamFolderRole.VIEWER,
    });

    expect(prisma.teamFolderMember.create).toHaveBeenCalledWith({
      data: {
        teamFolderId: TF_A,
        userId: INVITEE_ID,
        orgId: ORG_A,
        role: TeamFolderRole.VIEWER,
      },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        orgId: ORG_A,
        actorId: ORGANIZER_ID,
        action: 'TEAM_FOLDER_MEMBER_ADDED',
        resourceType: 'TEAM_FOLDER',
        resourceId: TF_A,
      },
    });
    expect(added).toEqual({
      teamFolderId: TF_A,
      userId: INVITEE_ID,
      role: TeamFolderRole.VIEWER,
    });
  });

  it('rejects ORGANIZER assignment of ADMIN or ORGANIZER', async () => {
    mockCallerRole({
      [ORGANIZER_ID]: TeamFolderRole.ORGANIZER,
      [INVITEE_ID]: TeamFolderRole.VIEWER,
    });
    await expect(
      service.addMember(organizer, TF_A, {
        userId: INVITEE_ID,
        role: TeamFolderRole.ADMIN,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateMember(organizer, TF_A, INVITEE_ID, {
        role: TeamFolderRole.ORGANIZER,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.teamFolderMember.create).not.toHaveBeenCalled();
    expect(prisma.teamFolderMember.update).not.toHaveBeenCalled();
  });

  it('lets a TF ADMIN manage members', async () => {
    mockCallerRole({ [TF_ADMIN_ID]: TeamFolderRole.ADMIN });
    prisma.user.findFirst.mockResolvedValue({ id: INVITEE_ID });
    prisma.teamFolderMember.create.mockResolvedValue(
      membership(INVITEE_ID, TeamFolderRole.EDITOR),
    );

    await service.addMember(tfAdmin, TF_A, {
      userId: INVITEE_ID,
      role: TeamFolderRole.EDITOR,
    });

    expect(prisma.teamFolderMember.create).toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'TEAM_FOLDER_MEMBER_ADDED' }),
    });
  });

  it('rejects deleting the last TF ADMIN', async () => {
    mockCallerRole({ [TF_ADMIN_ID]: TeamFolderRole.ADMIN });
    prisma.teamFolderMember.findFirst
      .mockResolvedValueOnce(membership(TF_ADMIN_ID, TeamFolderRole.ADMIN))
      .mockResolvedValueOnce(membership(TF_ADMIN_ID, TeamFolderRole.ADMIN));
    prisma.teamFolderMember.count.mockResolvedValue(1);

    await expect(
      service.removeMember(tfAdmin, TF_A, TF_ADMIN_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.teamFolderMember.delete).not.toHaveBeenCalled();
  });

  it('rejects a cross-tenant target user when adding a member', async () => {
    mockCallerRole({ [TF_ADMIN_ID]: TeamFolderRole.ADMIN });
    prisma.user.findFirst.mockResolvedValue({ id: FOREIGN_ID });
    prisma.organizationMembership.findFirst.mockResolvedValue({
      userId: FOREIGN_ID,
      organizationId: ORG_B,
      status: 'ACTIVE',
    });

    await expect(
      service.addMember(tfAdmin, TF_A, {
        userId: FOREIGN_ID,
        role: TeamFolderRole.VIEWER,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.teamFolderMember.create).not.toHaveBeenCalled();
  });

  it('lets an org ADMIN list members and add any role', async () => {
    prisma.teamFolderMember.findFirst.mockResolvedValue(null);
    prisma.teamFolderMember.findMany.mockResolvedValue([
      {
        userId: TF_ADMIN_ID,
        role: TeamFolderRole.ADMIN,
        user: { email: 'tf-admin@example.imkan' },
      },
    ]);
    prisma.user.findFirst.mockResolvedValue({ id: INVITEE_ID });
    prisma.teamFolderMember.create.mockResolvedValue(
      membership(INVITEE_ID, TeamFolderRole.ADMIN),
    );

    const listed = await service.listMembers(admin, TF_A);
    expect(listed.members).toEqual([
      {
        userId: TF_ADMIN_ID,
        email: 'tf-admin@example.imkan',
        role: TeamFolderRole.ADMIN,
      },
    ]);

    const added = await service.addMember(admin, TF_A, {
      userId: INVITEE_ID,
      role: TeamFolderRole.ADMIN,
    });
    expect(added.role).toBe(TeamFolderRole.ADMIN);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'TEAM_FOLDER_MEMBER_ADDED' }),
    });
  });

  it('returns 404 when a non-member lists members', async () => {
    prisma.teamFolderMember.findFirst.mockResolvedValue(null);
    await expect(service.listMembers(member, TF_A)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('forbids an EDITOR from renaming the Team Folder', async () => {
    mockCallerRole({ [EDITOR_ID]: TeamFolderRole.EDITOR });
    await expect(service.rename(editor, TF_A, 'hijack')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.teamFolder.update).not.toHaveBeenCalled();
  });

  it('forbids an ORGANIZER from deleting the Team Folder', async () => {
    mockCallerRole({ [ORGANIZER_ID]: TeamFolderRole.ORGANIZER });
    await expect(service.remove(organizer, TF_A)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.teamFolder.delete).not.toHaveBeenCalled();
  });

  it('lets a TF ADMIN rename the Team Folder with audit', async () => {
    mockCallerRole({ [TF_ADMIN_ID]: TeamFolderRole.ADMIN });
    prisma.teamFolder.update.mockResolvedValue({
      id: TF_A,
      orgId: ORG_A,
      name: 'Renamed',
    });
    prisma.folder.findFirst.mockResolvedValue({ id: ROOT_A });

    const renamed = await service.rename(tfAdmin, TF_A, 'Renamed');

    expect(prisma.teamFolder.update).toHaveBeenCalledWith({
      where: { id: TF_A },
      data: { name: 'Renamed' },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        orgId: ORG_A,
        actorId: TF_ADMIN_ID,
        action: 'TEAM_FOLDER_RENAMED',
        resourceType: 'TEAM_FOLDER',
        resourceId: TF_A,
      },
    });
    expect(renamed.name).toBe('Renamed');
  });

  it('rejects deleting a Team Folder that still has files', async () => {
    mockCallerRole({ [TF_ADMIN_ID]: TeamFolderRole.ADMIN });
    prisma.folder.findFirst.mockResolvedValue(null);
    prisma.folder.findMany.mockResolvedValue([{ id: ROOT_A }]);
    prisma.file.findFirst.mockResolvedValue({ id: 'file-1' });

    await expect(service.remove(tfAdmin, TF_A)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.teamFolder.delete).not.toHaveBeenCalled();
  });
});
