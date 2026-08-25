import { BadRequestException } from '@nestjs/common';

export type CreateFolderInput = {
  name: string;
  parentId?: string;
  teamFolderId?: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function optionalUuid(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new BadRequestException(`Invalid ${field}`);
  }
  return value;
}

export function parseCreateFolder(body: unknown): CreateFolderInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Invalid folder payload');
  }
  const record = body as Record<string, unknown>;
  if (typeof record.name !== 'string') {
    throw new BadRequestException('Invalid name');
  }
  const name = record.name.trim();
  if (name.length < 1 || name.length > 191) {
    throw new BadRequestException('Invalid name');
  }
  return {
    name,
    parentId: optionalUuid(record.parentId, 'parentId'),
    teamFolderId: optionalUuid(record.teamFolderId, 'teamFolderId'),
  };
}
