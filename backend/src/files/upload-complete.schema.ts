import { BadRequestException, ForbiddenException } from '@nestjs/common';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type UploadCompleteInput = {
  uploadId: string;
};

export function parseUploadComplete(body: unknown): UploadCompleteInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Invalid upload-complete payload');
  }
  const record = body as Record<string, unknown>;
  if ('orgId' in record || 'org_id' in record) {
    throw new ForbiddenException('orgId must not be supplied by the client');
  }
  if (typeof record.upload_id !== 'string' || !UUID_RE.test(record.upload_id)) {
    throw new BadRequestException('Invalid upload_id');
  }
  return { uploadId: record.upload_id };
}
