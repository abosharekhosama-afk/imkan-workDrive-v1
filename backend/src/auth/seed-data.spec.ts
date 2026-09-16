import { OrgRole } from '@prisma/client';
import { SEED_ORGANIZATION, SEED_USERS, SEED_MEMBERSHIPS } from './seed-data';

describe('T-202 seed data', () => {
  it('defines one organization and three users', () => {
    expect(SEED_ORGANIZATION.id).toHaveLength(36);
    expect(SEED_USERS).toHaveLength(3);
    expect(SEED_USERS.map((user) => user.email)).toEqual([
      'admin@example.imkan',
      'organizer@example.imkan',
      'viewer@example.imkan',
    ]);
    expect(SEED_MEMBERSHIPS[0].role).toBe(OrgRole.SUPER_ADMIN);
    expect(new Set(SEED_USERS.map((user) => user.id)).size).toBe(3);
  });
});