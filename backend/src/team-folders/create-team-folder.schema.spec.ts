import { parseCreateTeamFolder } from './create-team-folder.schema';

describe('parseCreateTeamFolder', () => {
  it('accepts a trimmed name and ignores orgId from the body', () => {
    expect(() =>
      parseCreateTeamFolder({
        name: ' Projects ',
        orgId: '00000000-0000-4000-8000-000000000099',
      }),
    ).toThrow('orgId must not be supplied by the client');
  });

  it('accepts a valid name', () => {
    expect(parseCreateTeamFolder({ name: ' Projects ' })).toEqual({
      name: 'Projects',
    });
  });

  it('rejects an empty name', () => {
    expect(() => parseCreateTeamFolder({ name: '  ' })).toThrow();
  });
});
