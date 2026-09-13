import { TeamFolderRole } from '@prisma/client';
import type { AccessTokenPayload } from '../auth/jwt.types';
import {
  PermissionService,
  type AccessibleResource,
  type TeamFolderMembershipPort,
} from './permission.service';

const ORG_A = '00000000-0000-4000-8000-000000000001';
const ORG_B = '00000000-0000-4000-8000-000000000002';
const OWNER = '00000000-0000-4000-8000-000000000011';
const OTHER = '00000000-0000-4000-8000-000000000012';
const TEAM_FOLDER_A = '00000000-0000-4000-8000-000000000021';

const orgAdmin = (orgId = ORG_A): AccessTokenPayload => ({
  sub: OTHER,
  org_id: orgId,
  email: 'admin@example.imkan',
  role: 'ADMIN',
});

const member = (sub: string, orgId = ORG_A): AccessTokenPayload => ({
  sub,
  org_id: orgId,
  email: 'member@example.imkan',
  role: 'MEMBER',
});

const personal: AccessibleResource = { orgId: ORG_A, ownerId: OWNER };

const teamFolder = (
  role?: TeamFolderRole | null,
  extras: Partial<AccessibleResource> = {},
): AccessibleResource => {
  const resource: AccessibleResource = {
    orgId: ORG_A,
    ownerId: OWNER,
    teamFolderId: TEAM_FOLDER_A,
    ...extras,
  };
  if (role !== undefined) {
    resource.teamFolderRole = role;
  }
  return resource;
};

describe('PermissionService personal resources (Phase 04)', () => {
  const permissions = new PermissionService();

  it('allows same-tenant org admin to read, write, and share', () => {
    const user = orgAdmin();
    expect(permissions.canRead(user, personal)).toBe(true);
    expect(permissions.canWrite(user, personal)).toBe(true);
    expect(permissions.canShare(user, personal)).toBe(true);
  });

  it('allows the owning member to write and share', () => {
    const user = member(OWNER);
    expect(permissions.canRead(user, personal)).toBe(true);
    expect(permissions.canWrite(user, personal)).toBe(true);
    expect(permissions.canShare(user, personal)).toBe(true);
  });

  it('allows a same-org non-owner member to read but not write or share', () => {
    const user = member(OTHER);
    expect(permissions.canRead(user, personal)).toBe(true);
    expect(permissions.canWrite(user, personal)).toBe(false);
    expect(permissions.canShare(user, personal)).toBe(false);
  });

  it('denies a JWT VIEWER write and share even when they own the resource', () => {
    const user: AccessTokenPayload = {
      sub: OWNER,
      org_id: ORG_A,
      email: 'v@x',
      role: 'VIEWER',
    };
    expect(permissions.canRead(user, personal)).toBe(true);
    expect(permissions.canWrite(user, personal)).toBe(false);
    expect(permissions.canShare(user, personal)).toBe(false);
  });

  it('denies a user from another tenant including a foreign org admin', () => {
    const user = orgAdmin(ORG_B);
    expect(permissions.canRead(user, personal)).toBe(false);
    expect(permissions.canWrite(user, personal)).toBe(false);
    expect(permissions.canShare(user, personal)).toBe(false);
  });

  it('does not treat personal resources as Team Folder admin surfaces', () => {
    const user = orgAdmin();
    expect(permissions.canManageTeamFolder(user, personal)).toBe(false);
    expect(permissions.canManageMembers(user, personal)).toBe(false);
  });

  it('allows only org ADMIN to create Team Folders', () => {
    expect(permissions.canCreateTeamFolder(orgAdmin())).toBe(true);
    expect(permissions.canCreateTeamFolder(member(OWNER))).toBe(false);
  });
});

describe('PermissionService Team Folder matrix', () => {
  const permissions = new PermissionService();
  const actor = member(OTHER);

  it('grants org ADMIN every Team Folder action without membership', () => {
    const resource = teamFolder();
    const user = orgAdmin();
    expect(permissions.canRead(user, resource)).toBe(true);
    expect(permissions.canWrite(user, resource)).toBe(true);
    expect(permissions.canShare(user, resource)).toBe(true);
    expect(permissions.canManageTeamFolder(user, resource)).toBe(true);
    expect(permissions.canManageMembers(user, resource)).toBe(true);
    expect(
      permissions.canAssignTeamFolderRole(user, resource, TeamFolderRole.ADMIN),
    ).toBe(true);
  });

  it('grants Team Folder ADMIN read, write, share, member, and TF management', () => {
    const resource = teamFolder(TeamFolderRole.ADMIN);
    expect(permissions.canRead(actor, resource)).toBe(true);
    expect(permissions.canWrite(actor, resource)).toBe(true);
    expect(permissions.canShare(actor, resource)).toBe(true);
    expect(permissions.canManageTeamFolder(actor, resource)).toBe(true);
    expect(permissions.canManageMembers(actor, resource)).toBe(true);
    expect(
      permissions.canAssignTeamFolderRole(
        actor,
        resource,
        TeamFolderRole.ORGANIZER,
      ),
    ).toBe(true);
  });

  it('grants ORGANIZER write and share and EDITOR/VIEWER member assignment only', () => {
    const resource = teamFolder(TeamFolderRole.ORGANIZER);
    expect(permissions.canRead(actor, resource)).toBe(true);
    expect(permissions.canWrite(actor, resource)).toBe(true);
    expect(permissions.canShare(actor, resource)).toBe(true);
    expect(permissions.canManageTeamFolder(actor, resource)).toBe(false);
    expect(permissions.canManageMembers(actor, resource)).toBe(true);
    expect(
      permissions.canAssignTeamFolderRole(
        actor,
        resource,
        TeamFolderRole.EDITOR,
      ),
    ).toBe(true);
    expect(
      permissions.canAssignTeamFolderRole(
        actor,
        resource,
        TeamFolderRole.VIEWER,
      ),
    ).toBe(true);
    expect(
      permissions.canAssignTeamFolderRole(
        actor,
        resource,
        TeamFolderRole.ADMIN,
      ),
    ).toBe(false);
    expect(
      permissions.canAssignTeamFolderRole(
        actor,
        resource,
        TeamFolderRole.ORGANIZER,
      ),
    ).toBe(false);
  });

  it('grants EDITOR write and share but not member or Team Folder management', () => {
    const resource = teamFolder(TeamFolderRole.EDITOR);
    expect(permissions.canRead(actor, resource)).toBe(true);
    expect(permissions.canWrite(actor, resource)).toBe(true);
    expect(permissions.canShare(actor, resource)).toBe(true);
    expect(permissions.canManageTeamFolder(actor, resource)).toBe(false);
    expect(permissions.canManageMembers(actor, resource)).toBe(false);
    expect(
      permissions.canAssignTeamFolderRole(
        actor,
        resource,
        TeamFolderRole.VIEWER,
      ),
    ).toBe(false);
  });

  it('grants VIEWER read only', () => {
    const resource = teamFolder(TeamFolderRole.VIEWER);
    expect(permissions.canRead(actor, resource)).toBe(true);
    expect(permissions.canWrite(actor, resource)).toBe(false);
    expect(permissions.canShare(actor, resource)).toBe(false);
    expect(permissions.canManageTeamFolder(actor, resource)).toBe(false);
    expect(permissions.canManageMembers(actor, resource)).toBe(false);
  });

  it('denies a same-org non-member by default', () => {
    const resource = teamFolder(null);
    expect(permissions.canRead(actor, resource)).toBe(false);
    expect(permissions.canWrite(actor, resource)).toBe(false);
    expect(permissions.canShare(actor, resource)).toBe(false);
    expect(permissions.canManageTeamFolder(actor, resource)).toBe(false);
    expect(permissions.canManageMembers(actor, resource)).toBe(false);
  });

  it('denies when Team Folder role is unresolved (default deny)', () => {
    const resource = teamFolder();
    expect(
      Object.prototype.hasOwnProperty.call(resource, 'teamFolderRole'),
    ).toBe(false);
    expect(permissions.canRead(actor, resource)).toBe(false);
    expect(permissions.canWrite(actor, resource)).toBe(false);
    expect(permissions.canShare(actor, resource)).toBe(false);
  });

  it('denies a cross-tenant user even with a Team Folder ADMIN role claim', () => {
    const resource = teamFolder(TeamFolderRole.ADMIN);
    const foreign = member(OTHER, ORG_B);
    expect(permissions.canRead(foreign, resource)).toBe(false);
    expect(permissions.canWrite(foreign, resource)).toBe(false);
    expect(permissions.canShare(foreign, resource)).toBe(false);
    expect(permissions.canManageTeamFolder(foreign, resource)).toBe(false);
  });

  it('ignores isPublicToOrg=true for a non-member', () => {
    const resource = teamFolder(null, { isPublicToOrg: true });
    expect(permissions.canRead(actor, resource)).toBe(false);
    expect(permissions.canWrite(actor, resource)).toBe(false);
    expect(permissions.canShare(actor, resource)).toBe(false);
  });

  it('never uses a client-supplied org id; only JWT org_id vs resource.orgId', () => {
    const user = member(OTHER, ORG_A);
    const spoofed: AccessibleResource = {
      orgId: ORG_B,
      ownerId: OWNER,
      teamFolderId: TEAM_FOLDER_A,
      teamFolderRole: TeamFolderRole.ADMIN,
    };
    expect(permissions.canRead(user, spoofed)).toBe(false);
    expect(permissions.canWrite(user, spoofed)).toBe(false);
    expect(permissions.canShare(user, spoofed)).toBe(false);
  });
});

describe('PermissionService complete matrix cells', () => {
  const permissions = new PermissionService();
  const actor = member(OTHER);
  const jwtViewer: AccessTokenPayload = {
    sub: OWNER,
    org_id: ORG_A,
    email: 'v@x',
    role: 'VIEWER',
  };

  const assignableRoles = [
    TeamFolderRole.ADMIN,
    TeamFolderRole.ORGANIZER,
    TeamFolderRole.EDITOR,
    TeamFolderRole.VIEWER,
  ] as const;

  it.each([
    { label: 'org ADMIN', user: orgAdmin(), expected: true },
    {
      label:
        'JWT MEMBER (covers TF ADMIN, ORGANIZER, EDITOR, VIEWER, non-member)',
      user: actor,
      expected: false,
    },
    { label: 'JWT VIEWER', user: jwtViewer, expected: false },
  ])('$label create Team Folder → $expected', ({ user, expected }) => {
    expect(permissions.canCreateTeamFolder(user)).toBe(expected);
  });

  it('treats explicit teamFolderId null as personal (Phase 04 owner write)', () => {
    const resource: AccessibleResource = {
      orgId: ORG_A,
      ownerId: OWNER,
      teamFolderId: null,
    };
    expect(permissions.canRead(member(OWNER), resource)).toBe(true);
    expect(permissions.canWrite(member(OWNER), resource)).toBe(true);
    expect(permissions.canWrite(member(OTHER), resource)).toBe(false);
    expect(permissions.canManageTeamFolder(orgAdmin(), resource)).toBe(false);
  });

  it.each([
    {
      label: 'org ADMIN',
      user: orgAdmin(),
      resource: teamFolder(),
      read: true,
      write: true,
      share: true,
      manageTf: true,
      manageMembers: true,
      assign: {
        [TeamFolderRole.ADMIN]: true,
        [TeamFolderRole.ORGANIZER]: true,
        [TeamFolderRole.EDITOR]: true,
        [TeamFolderRole.VIEWER]: true,
      },
    },
    {
      label: 'TF ADMIN',
      user: actor,
      resource: teamFolder(TeamFolderRole.ADMIN),
      read: true,
      write: true,
      share: true,
      manageTf: true,
      manageMembers: true,
      assign: {
        [TeamFolderRole.ADMIN]: true,
        [TeamFolderRole.ORGANIZER]: true,
        [TeamFolderRole.EDITOR]: true,
        [TeamFolderRole.VIEWER]: true,
      },
    },
    {
      label: 'ORGANIZER',
      user: actor,
      resource: teamFolder(TeamFolderRole.ORGANIZER),
      read: true,
      write: true,
      share: true,
      manageTf: false,
      manageMembers: true,
      assign: {
        [TeamFolderRole.ADMIN]: false,
        [TeamFolderRole.ORGANIZER]: false,
        [TeamFolderRole.EDITOR]: true,
        [TeamFolderRole.VIEWER]: true,
      },
    },
    {
      label: 'EDITOR',
      user: actor,
      resource: teamFolder(TeamFolderRole.EDITOR),
      read: true,
      write: true,
      share: true,
      manageTf: false,
      manageMembers: false,
      assign: {
        [TeamFolderRole.ADMIN]: false,
        [TeamFolderRole.ORGANIZER]: false,
        [TeamFolderRole.EDITOR]: false,
        [TeamFolderRole.VIEWER]: false,
      },
    },
    {
      label: 'VIEWER',
      user: actor,
      resource: teamFolder(TeamFolderRole.VIEWER),
      read: true,
      write: false,
      share: false,
      manageTf: false,
      manageMembers: false,
      assign: {
        [TeamFolderRole.ADMIN]: false,
        [TeamFolderRole.ORGANIZER]: false,
        [TeamFolderRole.EDITOR]: false,
        [TeamFolderRole.VIEWER]: false,
      },
    },
    {
      label: 'non-member',
      user: actor,
      resource: teamFolder(null),
      read: false,
      write: false,
      share: false,
      manageTf: false,
      manageMembers: false,
      assign: {
        [TeamFolderRole.ADMIN]: false,
        [TeamFolderRole.ORGANIZER]: false,
        [TeamFolderRole.EDITOR]: false,
        [TeamFolderRole.VIEWER]: false,
      },
    },
    {
      label: 'unresolved role (default deny)',
      user: actor,
      resource: teamFolder(),
      read: false,
      write: false,
      share: false,
      manageTf: false,
      manageMembers: false,
      assign: {
        [TeamFolderRole.ADMIN]: false,
        [TeamFolderRole.ORGANIZER]: false,
        [TeamFolderRole.EDITOR]: false,
        [TeamFolderRole.VIEWER]: false,
      },
    },
    {
      label: 'cross-tenant',
      user: member(OTHER, ORG_B),
      resource: teamFolder(TeamFolderRole.ADMIN),
      read: false,
      write: false,
      share: false,
      manageTf: false,
      manageMembers: false,
      assign: {
        [TeamFolderRole.ADMIN]: false,
        [TeamFolderRole.ORGANIZER]: false,
        [TeamFolderRole.EDITOR]: false,
        [TeamFolderRole.VIEWER]: false,
      },
    },
  ])(
    '$label: read/write/share/manage/assign cells',
    ({
      user,
      resource,
      read,
      write,
      share,
      manageTf,
      manageMembers,
      assign,
    }) => {
      expect(permissions.canRead(user, resource)).toBe(read);
      expect(permissions.canWrite(user, resource)).toBe(write);
      expect(permissions.canShare(user, resource)).toBe(share);
      expect(permissions.canManageTeamFolder(user, resource)).toBe(manageTf);
      expect(permissions.canManageMembers(user, resource)).toBe(manageMembers);
      for (const role of assignableRoles) {
        expect(permissions.canAssignTeamFolderRole(user, resource, role)).toBe(
          assign[role],
        );
      }
    },
  );

  it('does not let isPublicToOrg=true grant VIEWER write or share', () => {
    const resource = teamFolder(TeamFolderRole.VIEWER, { isPublicToOrg: true });
    expect(permissions.canRead(actor, resource)).toBe(true);
    expect(permissions.canWrite(actor, resource)).toBe(false);
    expect(permissions.canShare(actor, resource)).toBe(false);
    expect(permissions.canManageMembers(actor, resource)).toBe(false);
    expect(permissions.canManageTeamFolder(actor, resource)).toBe(false);
  });

  it('does not let isPublicToOrg=true create membership for an unresolved role', () => {
    const resource = teamFolder(undefined, { isPublicToOrg: true });
    expect(permissions.canRead(actor, resource)).toBe(false);
    expect(permissions.canWrite(actor, resource)).toBe(false);
    expect(permissions.canShare(actor, resource)).toBe(false);
    expect(permissions.canManageTeamFolder(actor, resource)).toBe(false);
    expect(permissions.canManageMembers(actor, resource)).toBe(false);
  });
});

describe('PermissionService membership port', () => {
  const actor = member(OTHER);
  const port: TeamFolderMembershipPort = {
    findRole: ({ userId, orgId, teamFolderId }) => {
      if (
        userId === actor.sub &&
        orgId === ORG_A &&
        teamFolderId === TEAM_FOLDER_A
      ) {
        return TeamFolderRole.EDITOR;
      }
      return null;
    },
  };
  const permissions = new PermissionService(port);

  it('uses injected membership when teamFolderRole is not on the resource', () => {
    const resource = teamFolder();
    expect(permissions.canRead(actor, resource)).toBe(true);
    expect(permissions.canWrite(actor, resource)).toBe(true);
    expect(permissions.canShare(actor, resource)).toBe(true);
    expect(permissions.canManageMembers(actor, resource)).toBe(false);
  });

  it('does not let isPublicToOrg bypass a port that returns no membership', () => {
    const emptyPort: TeamFolderMembershipPort = { findRole: () => null };
    const locked = new PermissionService(emptyPort);
    const resource = teamFolder(undefined, { isPublicToOrg: true });
    expect(locked.canRead(actor, resource)).toBe(false);
  });
});
