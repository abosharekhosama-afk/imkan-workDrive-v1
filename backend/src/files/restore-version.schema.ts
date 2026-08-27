import { BadRequestException, ForbiddenException } from '@nestjs/common';

export type RestoreVersionInput = {
  versionNumber: number;
};

export function parseRestoreVersion(body: unknown): RestoreVersionInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Invalid restore version payload');
  }
  const record = body as Record<string, unknown>;
  if ('orgId' in record || 'org_id' in record) {
    throw new ForbiddenException('orgId must not be supplied by the client');
  }
  if (typeof record.versionNumber !== 'number' || !Number.isInteger(record.versionNumber) || record.versionNumber < 1) {
    throw new BadRequestException('Invalid versionNumber');
  }
  return { versionNumber: record.versionNumber };
}