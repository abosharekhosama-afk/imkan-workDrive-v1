const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertUuid(value: string, field: string): void {
  if (!UUID_RE.test(value)) {
    throw new Error(`Invalid ${field}`);
  }
}

export type ParsedTenantObjectKey = {
  orgId: string;
  fileId: string;
  versionId: string;
};

const OBJECT_KEY_RE =
  /^tenant_([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/files\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

export function buildTenantObjectKey(
  orgId: string,
  fileId: string,
  versionId: string,
): string {
  assertUuid(orgId, 'orgId');
  assertUuid(fileId, 'fileId');
  assertUuid(versionId, 'versionId');
  return `tenant_${orgId}/files/${fileId}/${versionId}`;
}

export function parseTenantObjectKey(objectKey: string): ParsedTenantObjectKey {
  const match = OBJECT_KEY_RE.exec(objectKey);
  if (!match) {
    throw new Error('Invalid object key');
  }
  return { orgId: match[1], fileId: match[2], versionId: match[3] };
}

export type ParsedPublicTemplateObjectKey = { fileId: string; versionId: string };
const PUBLIC_TEMPLATE_KEY_RE = /^public_templates\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
export function buildPublicTemplateObjectKey(fileId: string, versionId: string): string { assertUuid(fileId, 'fileId'); assertUuid(versionId, 'versionId'); return `public_templates/${fileId}/${versionId}`; }
export function parsePublicTemplateObjectKey(objectKey: string): ParsedPublicTemplateObjectKey { const match = PUBLIC_TEMPLATE_KEY_RE.exec(objectKey); if (!match) throw new Error('Invalid public template object key'); return { fileId: match[1], versionId: match[2] }; }
export function isPublicTemplateObjectKey(objectKey: string): boolean { return PUBLIC_TEMPLATE_KEY_RE.test(objectKey); }

/**
 * CopySource for S3-compatible CopyObject.
 * The bucket/key separator stays a slash. Slashes inside the object key are
 * percent-encoded so providers such as R2 do not reject tenant keys.
 */
export function encodeS3CopySource(bucket: string, objectKey: string): string {
  const encodedKey = objectKey.split('/').map((part) => encodeURIComponent(part)).join('%2F');
  return `${encodeURIComponent(bucket)}/${encodedKey}`;
}

/**
 * Backup namespace keys written by BackupCryptoService:
 *   backups/{orgHmac}/{runId}/{fileId}/{hint-nonce}
 * Also accepts slightly looser backup paths (same depth, safe charset) so
 * restore/download never reject valid snapshot keys as "Invalid object key".
 *
 * NOTE: These are *storage path keys* (object names in disk/S3), NOT API keys
 * and NOT environment variables like BACKUP_ENCRYPTION_KEY.
 */
const BACKUP_OBJECT_KEY_RE =
  /^backups\/[A-Za-z0-9_-]{8,128}\/[A-Za-z0-9._-]{1,80}\/[A-Za-z0-9._-]{1,80}\/[A-Za-z0-9._-]{1,120}$/;

export function isBackupObjectKey(objectKey: string): boolean {
  return BACKUP_OBJECT_KEY_RE.test(objectKey);
}

/**
 * Validates that a physical storage key is one of the allowed namespaces
 * (tenant live files, public templates, or backup snapshots).
 * Rejects path traversal and arbitrary keys.
 */
export function assertAllowedObjectKey(objectKey: string): void {
  if (!objectKey || typeof objectKey !== 'string') {
    throw new Error('Invalid object key');
  }
  if (objectKey.includes('..') || objectKey.includes('\\') || objectKey.startsWith('/') || objectKey.includes('\0')) {
    throw new Error('Invalid object key');
  }
  if (OBJECT_KEY_RE.test(objectKey) || isPublicTemplateObjectKey(objectKey) || isBackupObjectKey(objectKey)) {
    return;
  }
  throw new Error(`Invalid object key: unsupported storage path (${objectKey.slice(0, 80)})`);
}
