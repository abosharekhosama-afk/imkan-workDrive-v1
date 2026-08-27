import { ForbiddenException } from '@nestjs/common';
import { parseSearchQuery } from './parse-search-query';

describe('parseSearchQuery', () => {
  it('accepts a trimmed query string', () => {
    expect(parseSearchQuery('  spec  ')).toBe('spec');
  });

  it('rejects a client-supplied orgId object', () => {
    expect(() =>
      parseSearchQuery({
        q: 'spec',
        orgId: '00000000-0000-4000-8000-000000000001',
      }),
    ).toThrow(ForbiddenException);
  });
});
