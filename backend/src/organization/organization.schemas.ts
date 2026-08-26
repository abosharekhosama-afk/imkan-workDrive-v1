import { BadRequestException } from '@nestjs/common';
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
