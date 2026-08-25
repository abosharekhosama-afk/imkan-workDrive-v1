import { BadRequestException } from '@nestjs/common';
import { OrgRole } from '@prisma/client';

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
  if (![OrgRole.MEMBER, OrgRole.ADMIN].includes(role)) throw new BadRequestException('Invalid organization role');
  return { email, role };
}
