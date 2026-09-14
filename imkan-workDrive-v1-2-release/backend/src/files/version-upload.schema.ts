import { BadRequestException, ForbiddenException } from '@nestjs/common';

/**
 * Normalized multipart payload accepted by `POST /files/:fileId/versions`.
 * Deliberately decoupled from Express/Multer types so the service stays
 * transport-agnostic and unit-testable.
 */
export type VersionUploadFile = {
  /** Raw bytes of the uploaded file (already fully buffered by the adapter). */
  buffer: Buffer;
  /** Client-provided file name, e.g. `spec.pdf`. */
  originalName: string;
  /** Client-provided MIME type, e.g. `application/pdf`. */
  mimeType: string;
  /** Byte length of `buffer` as reported by the multipart parser. */
  size: number;
};

/**
 * Universal MIME contract (mirrors upload-request.schema.ts): every
 * well-formed `type/subtype` is accepted; only structurally invalid
 * strings are rejected. Content correctness is enforced by magic-byte
 * checks in the storage pipeline.
 */
const MIME_TYPE_RE = /^[a-zA-Z0-9][a-zA-Z0-9!#$&^_.+-]{0,126}\/[a-zA-Z0-9][a-zA-Z0-9!#$&^_.+-]{0,126}$/;

/** Safe extension: short, single-segment, alphanumeric only. */
const EXTENSION_RE = /^[a-zA-Z0-9]{1,16}$/;

export function extractSafeExtension(fileName: string): string | null {
  const base = fileName.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return null;
  const ext = base.slice(dot + 1);
  return EXTENSION_RE.test(ext) ? ext.toLowerCase() : null;
}

/**
 * Validates a multipart version upload before any database or storage work:
 * - a non-empty file part must be present,
 * - the MIME type must be structurally valid,
 * - the file name must carry a safe extension.
 */
export function parseVersionUploadFile(file: unknown): VersionUploadFile {
  if (!file || typeof file !== 'object') {
    throw new BadRequestException('Missing file part');
  }
  const record = file as Record<string, unknown>;
  if ('orgId' in record || 'org_id' in record) {
    throw new ForbiddenException('orgId must not be supplied by the client');
  }
  const buffer = record.buffer;
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new BadRequestException('Uploaded file is empty');
  }

  // ✅ التعديل هنا: قراءة originalname من Express/Multer أو originalName
  const rawOriginalName = (record.originalname ?? record.originalName) as unknown;
  const rawMimeType = (record.mimetype ?? record.mimeType) as unknown;

  if (typeof rawOriginalName !== 'string' || rawOriginalName.trim().length < 1 || rawOriginalName.trim().length > 191) {
    throw new BadRequestException('Invalid file name');
  }
  
  const originalName = rawOriginalName.trim();
  
  if (extractSafeExtension(originalName) === null) {
    throw new BadRequestException('Invalid file extension');
  }
  
  if (typeof rawMimeType !== 'string' || !MIME_TYPE_RE.test(rawMimeType)) {
    throw new BadRequestException('Invalid mime_type');
  }
  
  return {
    buffer,
    originalName,
    mimeType: rawMimeType,
    size: buffer.length,
  };
}
