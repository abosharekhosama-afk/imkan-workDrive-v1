import { TeamFolderRole } from '@prisma/client';
import {
  parseAddTeamFolderMember,
  parseUpdateTeamFolderMember,
} from './membership.schema';

const USER_ID = '00000000-0000-4000-8000-000000000012';

describe('parseAddTeamFolderMember', () => {
  it('accepts userId and role and rejects client orgId', () => {
    expect(() =>
      parseAddTeamFolderMember({
        userId: USER_ID,
        role: TeamFolderRole.VIEWER,
        orgId: '00000000-0000-4000-8000-000000000099',
      }),
    ).toThrow('orgId must not be supplied by the client');
  });

  it('accepts a valid membership payload', () => {
    expect(
      parseAddTeamFolderMember({ userId: USER_ID, role: 'EDITOR' }),
    ).toEqual({
      userId: USER_ID,
      role: TeamFolderRole.EDITOR,
    });
  });

  it('rejects a non-UUID userId', () => {
    expect(() =>
      parseAddTeamFolderMember({ userId: 'not-a-uuid', role: 'VIEWER' }),
    ).toThrow();
  });

  it('rejects an unknown role', () => {
    expect(() =>
      parseAddTeamFolderMember({ userId: USER_ID, role: 'OWNER' }),
    ).toThrow();
  });
});

describe('parseUpdateTeamFolderMember', () => {
  it('rejects client orgId', () => {
    expect(() =>
      parseUpdateTeamFolderMember({
        role: TeamFolderRole.EDITOR,
        org_id: '00000000-0000-4000-8000-000000000099',
      }),
    ).toThrow('orgId must not be supplied by the client');
  });

  it('accepts a valid role', () => {
    expect(parseUpdateTeamFolderMember({ role: 'VIEWER' })).toEqual({
      role: TeamFolderRole.VIEWER,
    });
  });
});
