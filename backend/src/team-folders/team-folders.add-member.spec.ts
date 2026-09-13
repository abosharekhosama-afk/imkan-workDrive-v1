import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TeamFolderRole } from '@prisma/client';
import { PermissionService } from '../permissions/permission.service';
import { TeamFoldersService } from './team-folders.service';

const ORG_A = '00000000-0000-4000-8000-000000000001';
const ORG_B = '00000000-0000-4000-8000-000000000002';
const TF_A = '00000000-0000-4000-8000-000000000021';
const ADMIN_ID = '00000000-0000-4000-8000-000000000011';
const VIEWER_ID = '00000000-0000-4000-8000-000000000013';
const INVITEE_ID = '00000000-0000-4000-8000-000000000017';

async function errorOf(promise: Promise<unknown>): Promise<{ name: string; code?: string }> {
  try {
    await promise;
  } catch (error) {
    const response = (
      error as { getResponse?: () => unknown }
    ).getResponse?.() as { code?: string } | undefined;
    return { name: (error as Error).name, code: response?.code };
  }
  throw new Error('expected the promise to reject');
}

describe('TeamFoldersService.addMember error handling', () => {
  const prisma = {
    $transaction: jest.fn(),
    teamFolder: { findFirst: jest.fn() },
    folder: { findFirst: jest.fn() },
    teamFolderMember: { findFirst: jest.fn(), create: jest.fn() },
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
  const plainMember = {
    sub: VIEWER_ID,
    org_id: ORG_A,
    email: 'member@example.imkan',
    role: 'MEMBER' as const,
  };
  const teamFolder = { id: TF_A, orgId: ORG_A, name: 'Legal' };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      async (fn: (tx: typeof prisma) => unknown) => fn(prisma),
    );
    prisma.teamFolder.findFirst.mockResolvedValue(teamFolder);
    prisma.folder.findFirst.mockResolvedValue({ id: 'root-folder' });
    prisma.teamFolderMember.findFirst.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue({ id: INVITEE_ID });
    prisma.organizationMembership.findFirst.mockResolvedValue({
      userId: INVITEE_ID,
      organizationId: ORG_A,
      status: 'ACTIVE',
    });
  });

  it('reports MEMBER_ALREADY_EXISTS for a pre-existing membership', async () => {
    prisma.teamFolderMember.findFirst.mockImplementation(
      async ({ where }: { where: { userId?: string; teamFolderId?: string } }) =>
        where.userId && where.userId !== ADMIN_ID
          ? { teamFolderId: TF_A, userId: where.userId, orgId: ORG_A, role: TeamFolderRole.VIEWER }
          : null,
    );

    const failure = await errorOf(
      service.addMember(admin, TF_A, { userId: INVITEE_ID, role: TeamFolderRole.VIEWER }),
    );

    expect(failure.name).toBe('ConflictException');
    expect(failure.code).toBe('MEMBER_ALREADY_EXISTS');
    expect(prisma.teamFolderMember.create).not.toHaveBeenCalled();
  });

  it('translates a Prisma unique-constraint race into MEMBER_ALREADY_EXISTS', async () => {
    prisma.$transaction.mockRejectedValueOnce({ code: 'P2002' });

    const failure = await errorOf(
      service.addMember(admin, TF_A, { userId: INVITEE_ID, role: TeamFolderRole.EDITOR }),
    );

    expect(failure.name).toBe('ConflictException');
    expect(failure.code).toBe('MEMBER_ALREADY_EXISTS');
  });

  it('rejects targets that are not ACTIVE members of the organization', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      userId: INVITEE_ID,
      organizationId: ORG_B,
      status: 'ACTIVE',
    });

    const failure = await errorOf(
      service.addMember(admin, TF_A, { userId: INVITEE_ID, role: TeamFolderRole.VIEWER }),
    );

    expect(failure.name).toBe('NotFoundException');
    expect(failure.code).toBe('USER_NOT_IN_ORGANIZATION');
    expect(prisma.teamFolderMember.create).not.toHaveBeenCalled();
  });

  it('forbids a folder VIEWER with INSUFFICIENT_PERMISSIONS', async () => {
    // Same-org user who can READ the folder (TF membership VIEWER) must still
    // be denied when attempting to manage its members.
    prisma.teamFolderMember.findFirst.mockImplementation(
      async ({ where }: { where: { userId?: string } }) =>
        where.userId && where.userId !== ADMIN_ID
          ? { teamFolderId: TF_A, userId: where.userId, orgId: ORG_A, role: TeamFolderRole.VIEWER }
          : null,
    );

    const failure = await errorOf(
      service.addMember(plainMember, TF_A, {
        userId: INVITEE_ID,
        role: TeamFolderRole.VIEWER,
      }),
    );

    expect(failure.name).toBe('ForbiddenException');
    expect(failure.code).toBe('INSUFFICIENT_PERMISSIONS');
    expect(prisma.teamFolderMember.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('commits membership plus audit atomically on success', async () => {
    let txAuditInsideTransaction = false;
    prisma.$transaction.mockImplementationOnce(async (fn: (tx: typeof prisma) => Promise<unknown>) => {
      const result = await fn(prisma);
      txAuditInsideTransaction = prisma.auditLog.create.mock.calls.length > 0;
      return result;
    });
    prisma.teamFolderMember.create.mockResolvedValue({
      teamFolderId: TF_A,
      userId: INVITEE_ID,
      orgId: ORG_A,
      role: TeamFolderRole.EDITOR,
    });

    const added = await service.addMember(admin, TF_A, {
      userId: INVITEE_ID,
      role: TeamFolderRole.EDITOR,
    });

    expect(added).toEqual({
      teamFolderId: TF_A,
      userId: INVITEE_ID,
      role: TeamFolderRole.EDITOR,
    });
    expect(txAuditInsideTransaction).toBe(true);
    expect(prisma.teamFolderMember.create).toHaveBeenCalledWith({
      data: {
        teamFolderId: TF_A,
        userId: INVITEE_ID,
        orgId: ORG_A,
        role: TeamFolderRole.EDITOR,
      },
    });
  });
});