import { parseCreateFolder } from './create-folder.schema';

const TEAM_FOLDER_ID = '00000000-0000-4000-8000-000000000021';

describe('parseCreateFolder', () => {
  it('accepts a valid name and ignores orgId from the body', () => {
    const parsed = parseCreateFolder({
      name: ' Projects ',
      orgId: '00000000-0000-4000-8000-000000000099',
    });
    expect(parsed).toEqual({ name: 'Projects' });
    expect(parsed).not.toHaveProperty('orgId');
  });

  it('rejects an empty name', () => {
    expect(() => parseCreateFolder({ name: '  ' })).toThrow();
  });

  it('parses teamFolderId but does not treat a UUID as authorization', () => {
    const parsed = parseCreateFolder({
      name: 'Shared',
      teamFolderId: TEAM_FOLDER_ID,
    });
    expect(parsed.teamFolderId).toBe(TEAM_FOLDER_ID);
    expect(parsed).not.toHaveProperty('orgId');
  });

  it('rejects a non-UUID teamFolderId', () => {
    expect(() =>
      parseCreateFolder({ name: 'Shared', teamFolderId: 'not-a-uuid' }),
    ).toThrow();
  });
});
