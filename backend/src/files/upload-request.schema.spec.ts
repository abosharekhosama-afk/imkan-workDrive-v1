import { ForbiddenException } from '@nestjs/common';
import { parseUploadRequest } from './upload-request.schema';

const valid = {
  name: 'spec.pdf',
  folder_id: '00000000-0000-4000-8000-000000000041',
  size: 1024,
  mime_type: 'application/pdf',
  sha256: 'a'.repeat(64),
};

describe('parseUploadRequest', () => {
  it('accepts the approved upload-request contract', () => {
    expect(parseUploadRequest(valid)).toEqual({
      name: 'spec.pdf',
      folderId: valid.folder_id,
      size: 1024,
      mimeType: 'application/pdf',
      sha256: 'a'.repeat(64),
    });
  });

  it('rejects a client-supplied orgId', () => {
    expect(() =>
      parseUploadRequest({
        ...valid,
        orgId: '00000000-0000-4000-8000-000000000099',
      }),
    ).toThrow(ForbiddenException);
  });

  it('rejects a disallowed mime type', () => {
    expect(() =>
      parseUploadRequest({ ...valid, mime_type: 'application/x-msdownload' }),
    ).toThrow();
  });
});
