import { ResourceType, TeamFolderRole } from '@prisma/client';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { EffectivePermissionService } from './effective-permission.service';

const ORG = 'org-a';
const USER = 'user-a';
const OWNER = 'owner-a';
const TEAM = 'team-a';
const ROOT = 'root-a';
const CHILD = 'child-a';
const GROUP = 'group-a';
const FILE = 'file-a';

const user: AccessTokenPayload = {
  sub: USER,
  org_id: ORG,
  email: 'user@example.com',
  role: 'MEMBER',
};

function mockPrisma() {
  const folders: Record<string, any> = {
    [CHILD]: { id: CHILD, orgId: ORG, ownerId: OWNER, parentId: ROOT, teamFolderId: null, teamFolder: null },
    [ROOT]: { id: ROOT, orgId: ORG, ownerId: OWNER, parentId: null, teamFolderId: null, teamFolder: null },
  };
  const acl: any[] = [];
  const prisma: any = {
    folder: {
      findFirst: jest.fn(async ({ where, select }: any) => {
        const row = folders[where.id];
        if (!row || (where.orgId && row.orgId !== where.orgId)) return null;
        if (select?.ownerId) return row;
        return { id: row.id, parentId: row.parentId, orgId: row.orgId };
      }),
    },
    file: {
      findFirst: jest.fn(async () => ({
        id: FILE,
        orgId: ORG,
        ownerId: OWNER,
        folderId: CHILD,
        folder: { id: CHILD, parentId: ROOT, teamFolderId: null, teamFolder: null },
      })),
    },
    organizationMembership: {
      findFirst: jest.fn(async () => ({ role: 'MEMBER' })),
    },
    teamFolder: { findFirst: jest.fn(async () => ({ archivedAt: null })) },
    teamFolderMember: { findFirst: jest.fn(async () => null) },
    groupMember: { findMany: jest.fn(async () => [{ groupId: GROUP }]) },
    folderPermission: {
      findMany: jest.fn(async () => acl),
    },
    folderShareRecipient: { findMany: jest.fn(async () => []) },
    fileShareRecipient: { findMany: jest.fn(async () => []) },
  };
  return { prisma, acl };
}

describe('EffectivePermissionService', () => {
  it('grants owner full access on a personal folder', async () => {
    const { prisma } = mockPrisma();
    const service = new EffectivePermissionService(prisma);
    const result = await service.resolveFolder({ ...user, sub: OWNER }, CHILD);
    expect(result.level).toBe('FULL_ACCESS');
    expect(result.sources).toContain('OWNER');
  });

  it('inherits a root group EDIT permission to a child folder', async () => {
    const { prisma, acl } = mockPrisma();
    acl.push({ folderId: ROOT, userId: null, groupId: GROUP, access: 'EDIT', hidden: false });
    const service = new EffectivePermissionService(prisma);
    const result = await service.resolveFolder(user, CHILD);
    expect(result.level).toBe('EDIT');
    expect(result.sources).toContain('INHERITED_FOLDER_ACL');
  });

  it('uses a more-specific direct user ACL over a weaker inherited group ACL', async () => {
    const { prisma, acl } = mockPrisma();
    acl.push({ folderId: ROOT, userId: null, groupId: GROUP, access: 'VIEW', hidden: false });
    acl.push({ folderId: CHILD, userId: USER, groupId: null, access: 'EDIT', hidden: false });
    const service = new EffectivePermissionService(prisma);
    const result = await service.resolveFolder(user, CHILD);
    expect(result.level).toBe('EDIT');
    expect(result.sources).toContain('DIRECT_FOLDER_ACL');
  });

  it('does not let a file owner bypass Team Folder membership', async () => {
    const { prisma } = mockPrisma();
    prisma.file.findFirst.mockResolvedValue({
      id: FILE,
      orgId: ORG,
      ownerId: USER,
      folderId: CHILD,
      folder: { id: CHILD, parentId: ROOT, teamFolderId: TEAM, teamFolder: { archivedAt: null } },
    });
    prisma.teamFolder.findFirst.mockResolvedValue({ archivedAt: null });
    prisma.teamFolderMember.findFirst.mockResolvedValue(null);
    const service = new EffectivePermissionService(prisma);
    const result = await service.resolveFile(user, FILE);
    expect(result.level).toBe('NONE');
    expect(result.allowed).toBe(false);
  });


  it('honors recipient-specific file share permission and ignores expired shares', async () => {
    const { prisma } = mockPrisma();
    prisma.fileShareRecipient.findMany.mockResolvedValue([{ permission: 'COMMENT' }]);
    const service = new EffectivePermissionService(prisma);
    const result = await service.resolveFile(user, FILE);
    expect(result.level).toBe('COMMENT');
    expect(result.sources).toContain('FILE_SHARE');
  });

  it('maps Team Folder EDITOR to EDIT and archived state blocks writes', async () => {
    const { prisma } = mockPrisma();
    prisma.file.findFirst.mockResolvedValue({
      id: FILE,
      orgId: ORG,
      ownerId: OWNER,
      folderId: CHILD,
      folder: { id: CHILD, parentId: ROOT, teamFolderId: TEAM, teamFolder: { archivedAt: new Date() } },
    });
    prisma.teamFolder.findFirst.mockResolvedValue({ archivedAt: new Date() });
    prisma.teamFolderMember.findFirst.mockResolvedValue({ role: TeamFolderRole.EDITOR });
    const service = new EffectivePermissionService(prisma);
    const result = await service.resolveFile(user, FILE);
    expect(result.level).toBe('EDIT');
    expect(result.sources).toContain('ARCHIVED_TEAM_FOLDER');
    expect(await service.canWrite(user, ResourceType.FILE, FILE)).toBe(false);
  });
});
