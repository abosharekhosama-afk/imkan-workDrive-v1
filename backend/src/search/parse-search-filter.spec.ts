import { BadRequestException } from '@nestjs/common';
import { parseSearchFilter } from './parse-search-filter';

describe('parseSearchFilter', () => {
  it('defaults to all and accepts supported filters', () => {
    expect(parseSearchFilter(undefined)).toBe('all');
    expect(parseSearchFilter('folders')).toBe('folders');
    expect(parseSearchFilter('files')).toBe('files');
    expect(parseSearchFilter('recent')).toBe('recent');
  });

  it('rejects unsupported values', () => {
    expect(() => parseSearchFilter('team-folders')).toThrow(BadRequestException);
  });
});
