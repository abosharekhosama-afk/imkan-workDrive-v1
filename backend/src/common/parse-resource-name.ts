import { BadRequestException, ForbiddenException } from '@nestjs/common';

export function parseResourceName(body: unknown): { name: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Invalid rename payload');
  }
  const record = body as Record<string, unknown>;
  if ('orgId' in record || 'org_id' in record) {
    throw new ForbiddenException('orgId must not be supplied by the client');
  }
  if (typeof record.name !== 'string') {
    throw new BadRequestException('Invalid name');
  }
  const name = record.name.trim();
  if (name.length < 1 || name.length > 191) {
    throw new BadRequestException('Invalid name');
  }
  return { name };
}
