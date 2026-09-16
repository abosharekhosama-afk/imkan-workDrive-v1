import { BadRequestException, ForbiddenException } from '@nestjs/common';

/**
 * Universal upload support (P0): every well-formed `type/subtype` MIME type is
 * accepted — images, documents, media, archives, code and unknown binary
 * formats alike. The only rejected values are structurally invalid strings;
 * content-type correctness is resolved later by `resolveMimeType` on the
 * client and by magic-byte checks in the storage pipeline.
 */
const MIME_TYPE_RE = /^[a-zA-Z0-9][a-zA-Z0-9!#$&^_.+-]{0,126}\/[a-zA-Z0-9][a-zA-Z0-9!#$&^_.+-]{0,126}$/;

export type UploadRequestInput = {
  name: string;
  folderId: string | null;
  size: number;
  mimeType: string;
  sha256: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[a-f0-9]{64}$/;

export function parseUploadRequest(body: unknown): UploadRequestInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Invalid upload-request payload');
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
  const folderId = record.folder_id;
  if (folderId !== null && folderId !== undefined && (typeof folderId !== 'string' || !UUID_RE.test(folderId))) { throw new BadRequestException('Invalid folder_id'); }
  const size = record.size;
  if (typeof size !== 'number' || !Number.isInteger(size) || size < 1) {
    throw new BadRequestException('Invalid size');
  }
  if (
    typeof record.mime_type !== 'string' ||
    !MIME_TYPE_RE.test(record.mime_type)
  ) {
    throw new BadRequestException('Invalid mime_type');
  }
  if (
    typeof record.sha256 !== 'string' ||
    !SHA256_RE.test(record.sha256.toLowerCase())
  ) {
    throw new BadRequestException('Invalid sha256');
  }
  return {
  name,
  folderId: folderId ?? null,
  size,
  mimeType: record.mime_type,
  sha256: record.sha256.toLowerCase(),
};
}
