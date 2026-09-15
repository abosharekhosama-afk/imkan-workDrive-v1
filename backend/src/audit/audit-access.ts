import type { AccessTokenPayload } from '../auth/jwt.types';

export function canReadOrgAudit(user: AccessTokenPayload): boolean {
  return user.role === 'ADMIN';
}

export function auditListWhere(user: AccessTokenPayload) {
  if (canReadOrgAudit(user)) {
    return { orgId: user.org_id };
  }
  return { orgId: user.org_id, actorId: user.sub };
}
