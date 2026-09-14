import { auditListWhere, canReadOrgAudit } from './audit-access';

const admin = {
  sub: '00000000-0000-4000-8000-000000000011',
  org_id: '00000000-0000-4000-8000-000000000001',
  email: 'admin@example.imkan',
  role: 'ADMIN',
};

describe('audit access', () => {
  it('lets an org admin read the full tenant audit stream', () => {
    expect(canReadOrgAudit(admin)).toBe(true);
    expect(auditListWhere(admin)).toEqual({ orgId: admin.org_id });
  });

  it('scopes a member to their own actorId in the same tenant', () => {
    const member = {
      ...admin,
      role: 'MEMBER',
      sub: '00000000-0000-4000-8000-000000000012',
    };
    expect(canReadOrgAudit(member)).toBe(false);
    expect(auditListWhere(member)).toEqual({
      orgId: member.org_id,
      actorId: member.sub,
    });
  });

  it('never copies orgId from a client payload', () => {
    const foreign = '00000000-0000-4000-8000-000000000099';
    expect(auditListWhere(admin).orgId).not.toBe(foreign);
  });
});

describe('viewer audit', () => {
  it('is not an org-wide reader', () => {
    expect(canReadOrgAudit({ ...admin, role: 'VIEWER' })).toBe(false);
  });
});
