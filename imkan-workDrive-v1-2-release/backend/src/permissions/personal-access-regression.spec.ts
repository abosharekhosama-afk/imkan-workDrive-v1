import { PermissionService } from './permission.service';
import type { AccessTokenPayload } from '../auth/jwt.types';

const org = 'org-1';
const owner = 'user-owner';
const other = 'user-other';
const admin: AccessTokenPayload = { sub: other, org_id: org, email: 'admin@example.com', role: 'ADMIN' };
const superAdmin: AccessTokenPayload = { sub: other, org_id: org, email: 'superadmin@example.com', role: 'SUPER_ADMIN' };
const member: AccessTokenPayload = { sub: other, org_id: org, email: 'member@example.com', role: 'MEMBER' };
const personal = { orgId: org, ownerId: owner };

describe('personal resource isolation', () => {
  const permissions = new PermissionService();
  it('does not let another member read a personal resource', () => expect(permissions.canRead(member, personal)).toBe(false));
  it('does not let an organization admin implicitly read a personal resource', () => expect(permissions.canRead(admin, personal)).toBe(false));
  it('does not let a super admin implicitly read or write a personal resource', () => {
    expect(permissions.canRead(superAdmin, personal)).toBe(false);
    expect(permissions.canWrite(superAdmin, personal)).toBe(false);
    expect(permissions.canShare(superAdmin, personal)).toBe(false);
  });
  it('allows the owner to read/write/share their personal resource', () => {
    const actor = { ...member, sub: owner };
    expect(permissions.canRead(actor, personal)).toBe(true);
    expect(permissions.canWrite(actor, personal)).toBe(true);
    expect(permissions.canShare(actor, personal)).toBe(true);
  });
});
