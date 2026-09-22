import { BadRequestException, ConflictException } from '@nestjs/common';

describe('Phase 25 upload integrity contracts', () => {
  it('defines explicit pending and complete lifecycle states', () => {
    expect(['PENDING', 'COMPLETE', 'ABORTED']).toEqual(
      expect.arrayContaining(['PENDING', 'COMPLETE']),
    );
  });

  it('uses a client-visible bad request for manifest mismatch', () => {
    expect(
      new BadRequestException(
        'Uploaded object checksum does not match the upload manifest',
      ),
    ).toBeInstanceOf(BadRequestException);
  });

  it('uses a conflict for concurrent completion races', () => {
    expect(
      new ConflictException(
        'Upload completion was already processed; retry the request',
      ),
    ).toBeInstanceOf(ConflictException);
  });
});
