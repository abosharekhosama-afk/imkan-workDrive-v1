import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ResourceType } from '@prisma/client';

export type SharePermissionInput =
  | 'VIEW'
  | 'COMMENT'
  | 'EDIT'
  | 'ORGANIZE'
  | 'FULL_ACCESS';

export type CreateShareInput = {
  resourceType: ResourceType;
  resourceId: string;
  expiresAt?: Date;
  password?: string;
  canDownload: boolean;
  recipientUserIds: string[];
  permission: SharePermissionInput;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseCreateShare(body: unknown): CreateShareInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Invalid share payload');
  }
  const record = body as Record<string, unknown>;
  if ('orgId' in record || 'org_id' in record) {
    throw new ForbiddenException('orgId must not be supplied by the client');
  }
  if (record.resource_type !== 'FILE') {
    throw new BadRequestException('Only files can be shared');
  }
  if (
    typeof record.resource_id !== 'string' ||
    !UUID_RE.test(record.resource_id)
  ) {
    throw new BadRequestException('Invalid resource_id');
  }
  let expiresAt: Date | undefined;
  if (
    record.expires_at !== undefined &&
    record.expires_at !== null &&
    record.expires_at !== ''
  ) {
    if (typeof record.expires_at !== 'string') {
      throw new BadRequestException('Invalid expires_at');
    }
    expiresAt = new Date(record.expires_at);
    if (
      Number.isNaN(expiresAt.getTime()) ||
      expiresAt.getTime() <= Date.now()
    ) {
      throw new BadRequestException('Invalid expires_at');
    }
  }
  let password: string | undefined;
  if (
    record.password !== undefined &&
    record.password !== null &&
    record.password !== ''
  ) {
    if (typeof record.password !== 'string' || record.password.length < 8) {
      throw new BadRequestException('Invalid password');
    }
    password = record.password;
  }
  const recipientUserIds = record.recipient_user_ids === undefined ? [] : record.recipient_user_ids;
  if (!Array.isArray(recipientUserIds) || recipientUserIds.some((id) => typeof id !== 'string' || !UUID_RE.test(id))) throw new BadRequestException('Invalid recipient_user_ids');
  const permission = record.permission === undefined ? 'VIEW' : record.permission;
  if (
    permission !== 'VIEW' &&
    permission !== 'COMMENT' &&
    permission !== 'EDIT' &&
    permission !== 'ORGANIZE' &&
    permission !== 'FULL_ACCESS'
  ) {
    throw new BadRequestException('Invalid permission');
  }
  const canDownload =
    record.can_download === undefined ? true : record.can_download === true;
  if (
    record.can_download !== undefined &&
    typeof record.can_download !== 'boolean'
  ) {
    throw new BadRequestException('Invalid can_download');
  }
  return {
    resourceType: record.resource_type,
    resourceId: record.resource_id,
    expiresAt,
    password,
    canDownload,
    recipientUserIds: recipientUserIds as string[],
    permission: permission as SharePermissionInput,
  };
}
