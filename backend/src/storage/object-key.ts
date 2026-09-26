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
