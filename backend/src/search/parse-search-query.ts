import { BadRequestException, ForbiddenException } from '@nestjs/common';

export function parseSearchQuery(raw: unknown): string {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const record = raw as Record<string, unknown>;
    if ('orgId' in record || 'org_id' in record) {
      throw new ForbiddenException('orgId must not be supplied by the client');
    }
  }
  if (typeof raw !== 'string') {
    throw new BadRequestException('Invalid q');
  }
  const query = raw.trim();
  if (query.length < 1 || query.length > 100) {
    throw new BadRequestException('Invalid q');
  }
  return query;
}
