import { ForbiddenException } from '@nestjs/common';
import { parseUploadComplete } from './upload-complete.schema';

const valid = { upload_id: '00000000-0000-4000-8000-000000000031' };

describe('parseUploadComplete', () => {
  it('accepts the approved upload-complete contract', () => {
    expect(parseUploadComplete(valid)).toEqual({ uploadId: valid.upload_id });
  });

  it('rejects a client-supplied orgId', () => {
    expect(() =>
      parseUploadComplete({
        ...valid,
        org_id: '00000000-0000-4000-8000-000000000099',
      }),
    ).toThrow(ForbiddenException);
  });
});
