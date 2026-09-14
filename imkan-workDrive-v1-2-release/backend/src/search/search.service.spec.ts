import { PermissionService } from '../permissions/permission.service';
import { SearchService } from './search.service';

const ORG_A = '00000000-0000-4000-8000-000000000001';
const ORG_B = '00000000-0000-4000-8000-000000000002';
const USER_A = '00000000-0000-4000-8000-000000000011';
const MEMBER_A = '00000000-0000-4000-8000-000000000012';
const TEAM_FOLDER_A = '00000000-0000-4000-8000-000000000061';
const TF_ROOT = '00000000-0000-4000-8000-000000000041';
const TF_CHILD = '00000000-0000-4000-8000-000000000042';
const TF_FILE = '00000000-0000-4000-8000-000000000021';
const PERSONAL_FOLDER = '00000000-0000-4000-8000-000000000043';
const PERSONAL_FILE = '00000000-0000-4000-8000-000000000022';

describe('SearchService', () => {
  const prisma = {
    folder: { findMany: jest.fn() },
    file: { findMany: jest.fn() },
    teamFolderMember: { findFirst: jest.fn() },
  };
  const service = new SearchService(prisma as never, new PermissionService());
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

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.folder.findMany.mockResolvedValue([]);
    prisma.file.findMany.mockResolvedValue([]);
  });

  it('runs full-text search scoped to the JWT tenant, excludes trash and private My-Folder rows', async () => {
    await service.search(user, 'spec');
    expect(prisma.folder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          orgId: ORG_A,
          name: { search: 'spec' },
          OR: [{ teamFolderId: { not: null } }, { ownerId: USER_A }],
        },
      }),
    );
    expect(prisma.file.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          orgId: ORG_A,
          deletedAt: null,
          name: { search: 'spec' },
          OR: [
            { folder: null },
            { folder: { teamFolderId: { not: null } } },
            { folder: { ownerId: USER_A } },
          ],
        },
      }),
    );
  });

  it('never uses a client-provided foreign org id', async () => {
    await service.search(user, 'spec');
    const folderWhere = prisma.folder.findMany.mock.calls[0][0].where;
    expect(folderWhere.orgId).toBe(ORG_A);
    expect(folderWhere.orgId).not.toBe(ORG_B);
  });

  it('omits unreadable Team Folder roots, descendants, file ids, and names for a same-org non-member', async () => {
    prisma.folder.findMany.mockResolvedValue([
      {
        id: PERSONAL_FOLDER,
        orgId: ORG_A,
        name: 'My Inbox',
        ownerId: MEMBER_A,
        teamFolderId: null,
      },
      {
        id: TF_ROOT,
        orgId: ORG_A,
        name: 'Legal',
        ownerId: USER_A,
        teamFolderId: TEAM_FOLDER_A,
      },
      {
        id: TF_CHILD,
        orgId: ORG_A,
        name: 'Legal child',
        ownerId: USER_A,
        teamFolderId: TEAM_FOLDER_A,
        parentId: TF_ROOT,
      },
    ]);
    prisma.file.findMany.mockResolvedValue([
      {
        id: PERSONAL_FILE,
        orgId: ORG_A,
        name: 'notes.txt',
        ownerId: MEMBER_A,
        folder: { teamFolderId: null },
      },
      {
        id: TF_FILE,
        orgId: ORG_A,
        name: 'Legal contract',
        ownerId: USER_A,
        folder: { teamFolderId: TEAM_FOLDER_A },
      },
    ]);
    prisma.teamFolderMember.findFirst.mockResolvedValue(null);

    const result = await service.search(member, 'Legal');
    const folderIds = result.folders.map((folder) => folder.id);
    const fileIds = result.files.map((file) => file.id);
    const names = [
      ...result.folders.map((folder) => folder.name),
      ...result.files.map((file) => file.name),
    ].join(' ');

    expect(folderIds).not.toContain(TF_ROOT);
    expect(folderIds).not.toContain(TF_CHILD);
    expect(fileIds).not.toContain(TF_FILE);
    expect(names).not.toContain('Legal');
    expect(folderIds).toEqual([PERSONAL_FOLDER]);
    expect(fileIds).toEqual([PERSONAL_FILE]);
  });

  it('returns readable Team Folder content for an org ADMIN', async () => {
    prisma.folder.findMany.mockResolvedValue([
      {
        id: TF_ROOT,
        orgId: ORG_A,
        name: 'Legal',
        ownerId: USER_A,
        teamFolderId: TEAM_FOLDER_A,
      },
    ]);
    prisma.file.findMany.mockResolvedValue([
      {
        id: TF_FILE,
        orgId: ORG_A,
        name: 'Legal contract',
        ownerId: USER_A,
        folder: { teamFolderId: TEAM_FOLDER_A },
      },
    ]);
    prisma.teamFolderMember.findFirst.mockResolvedValue(null);

    const result = await service.search(user, 'Legal');
    expect(result.folders.map((folder) => folder.id)).toEqual([TF_ROOT]);
    expect(result.files.map((file) => file.id)).toEqual([TF_FILE]);
    expect(result.files[0]).not.toHaveProperty('folder');
  });

  it('returns Team Folder hits for a member with a readable role', async () => {
    prisma.folder.findMany.mockResolvedValue([
      {
        id: TF_ROOT,
        orgId: ORG_A,
        name: 'Legal',
        ownerId: USER_A,
        teamFolderId: TEAM_FOLDER_A,
      },
    ]);
    prisma.file.findMany.mockResolvedValue([
      {
        id: TF_FILE,
        orgId: ORG_A,
        name: 'Legal contract',
        ownerId: USER_A,
        folder: { teamFolderId: TEAM_FOLDER_A },
      },
    ]);
    prisma.teamFolderMember.findFirst.mockResolvedValue({ role: 'VIEWER' });

    const result = await service.search(member, 'Legal');
    expect(result.folders.map((folder) => folder.id)).toEqual([TF_ROOT]);
    expect(result.files.map((file) => file.id)).toEqual([TF_FILE]);
  });

  it('keeps personal folders and files visible to a same-org MEMBER', async () => {
    prisma.folder.findMany.mockResolvedValue([
      {
        id: PERSONAL_FOLDER,
        orgId: ORG_A,
        name: 'spec notes',
        ownerId: MEMBER_A,
        teamFolderId: null,
      },
    ]);
    prisma.file.findMany.mockResolvedValue([
      {
        id: PERSONAL_FILE,
        orgId: ORG_A,
        name: 'spec.pdf',
        ownerId: MEMBER_A,
        folder: { teamFolderId: null },
      },
    ]);

    const result = await service.search(member, 'spec');
    expect(result.folders).toEqual([
      expect.objectContaining({ id: PERSONAL_FOLDER, name: 'spec notes' }),
    ]);
    expect(result.files).toEqual([
      expect.objectContaining({ id: PERSONAL_FILE, name: 'spec.pdf' }),
    ]);
  });
});
