import { buildTenantObjectKey, parseTenantObjectKey } from './object-key';

describe('buildTenantObjectKey', () => {
  const orgId = '00000000-0000-4000-8000-000000000001';
  const fileId = '00000000-0000-4000-8000-000000000021';
  const versionId = '00000000-0000-4000-8000-000000000031';

  it('uses the approved tenant-isolated key layout', () => {
    expect(buildTenantObjectKey(orgId, fileId, versionId)).toBe(
      `tenant_${orgId}/files/${fileId}/${versionId}`,
    );
  });

  it('parses an approved tenant object key', () => {
    const key = buildTenantObjectKey(orgId, fileId, versionId);
    expect(parseTenantObjectKey(key)).toEqual({ orgId, fileId, versionId });
  });
});
