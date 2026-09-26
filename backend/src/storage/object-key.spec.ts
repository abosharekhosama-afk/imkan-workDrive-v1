import { buildTenantObjectKey, encodeS3CopySource, parseTenantObjectKey } from './object-key';

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

  it('encodes slashes inside the object key for S3 CopySource', () => {
    const key = buildTenantObjectKey(orgId, fileId, versionId);
    const encoded = encodeS3CopySource('imkan-workdrive', key);
    expect(encoded.startsWith('imkan-workdrive/')).toBe(true);
    expect(encoded).toContain('tenant_' + orgId + '%2Ffiles%2F' + fileId + '%2F' + versionId);
    expect(encoded.includes('/files/')).toBe(false);
  });
});