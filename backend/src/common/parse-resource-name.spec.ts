import { ForbiddenException } from '@nestjs/common';
import { parseResourceName } from './parse-resource-name';

describe('parseResourceName', () => {
  it('trims a valid name', () => {
    expect(parseResourceName({ name: '  Notes  ' })).toEqual({ name: 'Notes' });
  });

  it('rejects a client-supplied orgId', () => {
    expect(() =>
      parseResourceName({
        name: 'Notes',
        orgId: '00000000-0000-4000-8000-000000000001',
      }),
    ).toThrow(ForbiddenException);
  });
});
