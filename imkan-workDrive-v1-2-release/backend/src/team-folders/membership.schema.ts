import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TeamFolderRole } from '@prisma/client';

export type AddTeamFolderMemberInput = {
  userId: string;
  role: TeamFolderRole;
};

export type UpdateTeamFolderMemberInput = {
  role: TeamFolderRole;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ROLES = new Set<string>(Object.values(TeamFolderRole));

function rejectClientOrgId(record: Record<string, unknown>): void {
  if ('orgId' in record || 'org_id' in record) {
    throw new ForbiddenException('orgId must not be supplied by the client');
  }
}

function parseRole(value: unknown): TeamFolderRole {
  if (typeof value !== 'string' || !ROLES.has(value)) {
    throw new BadRequestException('Invalid role');
  }
  return value as TeamFolderRole;
}

export function parseAddTeamFolderMember(
  body: unknown,
): AddTeamFolderMemberInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Invalid member payload');
  }
  const record = body as Record<string, unknown>;
  rejectClientOrgId(record);
  if (typeof record.userId !== 'string' || !UUID_RE.test(record.userId)) {
    throw new BadRequestException('Invalid userId');
  }
  return { userId: record.userId, role: parseRole(record.role) };
}

export function parseUpdateTeamFolderMember(
  body: unknown,
): UpdateTeamFolderMemberInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Invalid member payload');
  }
  const record = body as Record<string, unknown>;
  rejectClientOrgId(record);
  return { role: parseRole(record.role) };
}
