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
