import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { OrgRole, MembershipStatus } from '@prisma/client';

export function parseUpdateOrganization(body: unknown): { name: string } {
  if (!body || typeof body !== 'object' || typeof (body as any).name !== 'string') throw new BadRequestException('Organization name is required');
  const name = (body as any).name.trim();
  if (name.length < 2 || name.length > 160) throw new BadRequestException('Organization name must be between 2 and 160 characters');
  return { name };
}

export function parseInvite(body: unknown): { email: string; role: OrgRole } {
  if (!body || typeof body !== 'object') throw new BadRequestException('Invitation payload is required');
  const email = String((body as any).email ?? '').trim().toLowerCase();
  const role = String((body as any).role ?? 'MEMBER') as OrgRole;
  if (!email || !email.includes('@')) throw new BadRequestException('A valid email is required');
  const validInviteRoles: OrgRole[] = [OrgRole.MEMBER, OrgRole.ADMIN];
  if (!validInviteRoles.includes(role)) throw new BadRequestException('Invalid organization role');
  return { email, role };
}

export function parseUpdateMemberRole(body: unknown): { role: OrgRole } {
  if (!body || typeof body !== 'object' || typeof (body as any).role !== 'string') throw new BadRequestException('Role is required');
  const role = (body as any).role as OrgRole;
  if (![OrgRole.MEMBER, OrgRole.ADMIN, OrgRole.SUPER_ADMIN].includes(role)) throw new BadRequestException('Invalid organization role');
  return { role };
}

export function parseRemoveMember(body: unknown): { successorId?: string } {
  if (!body || typeof body !== 'object') return { successorId: undefined };
  return { successorId: (body as any).successorId ?? undefined };
}

export function parseTransferOwnership(body: unknown): { targetMembershipId: string } {
  if (!body || typeof body !=='object' || typeof (body as any).targetMembershipId !== 'string') throw new BadRequestException('Target membership ID is required');
  return { targetMembershipId: (body as any).targetMembershipId };
}

export function parseCreateAccount(body: unknown): { name: string; email: string; password: string; role: 'ADMIN' | 'MEMBER' } {
  if (!body || typeof body !== 'object') throw new BadRequestException('Account payload is required');
  const record = body as Record<string, unknown>;
  if ('orgId' in record || 'org_id' in record) throw new ForbiddenException('orgId must not be supplied by the client');

  const name = typeof record.name === 'string' ? record.name.trim() : '';
  if (name.length < 2 || name.length > 120) throw new BadRequestException('Name must be between 2 and 120 characters');

  const email = typeof record.email === 'string' ? record.email.trim().toLowerCase() : '';
  if (!email || !email.includes('@')) throw new BadRequestException('A valid email is required');

  const password = typeof record.password === 'string' ? record.password : '';
  if (password.length < 8) throw new BadRequestException('Password must be at least 8 characters');

  const role = (record.role ?? OrgRole.MEMBER) as OrgRole;
  const validRoles: OrgRole[] = [OrgRole.MEMBER, OrgRole.ADMIN];
  if (!validRoles.includes(role)) throw new BadRequestException('Invalid organization role');

  // SUPER_ADMIN can never be granted through direct account creation; that
  // privilege is only attainable via the ownership-transfer flow.
  return { name, email, password, role: role as 'ADMIN' | 'MEMBER' };
}
