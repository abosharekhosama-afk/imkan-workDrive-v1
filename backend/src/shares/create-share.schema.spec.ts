import { ForbiddenException } from '@nestjs/common';
import { parseCreateShare } from './create-share.schema';

const future = new Date(Date.now() + 86_400_000).toISOString();
const valid = {
  resource_type: 'FILE',
  resource_id: '00000000-0000-4000-8000-000000000021',
  expires_at: future,
  password: 's3cret-link',
  can_download: false,
};

describe('parseCreateShare', () => {
  it('accepts the approved share contract', () => {
    const parsed = parseCreateShare(valid);
    expect(parsed.resourceType).toBe('FILE');
    expect(parsed.canDownload).toBe(false);
    expect(parsed.password).toBe('s3cret-link');
  });

  it('rejects a client-supplied orgId', () => {
    expect(() =>
      parseCreateShare({
        ...valid,
        orgId: '00000000-0000-4000-8000-000000000001',
      }),
    ).toThrow(ForbiddenException);
  });

  it('rejects an expiration in the past', () => {
    expect(() =>
      parseCreateShare({
        ...valid,
        expires_at: new Date(Date.now() - 1000).toISOString(),
      }),
    ).toThrow();
  });
});
