import { BadRequestException } from '@nestjs/common';

export type SearchFilter = 'all' | 'folders' | 'files' | 'recent';

export function parseSearchFilter(raw: unknown): SearchFilter {
  if (raw === undefined || raw === null || raw === '') return 'all';
  if (typeof raw !== 'string') throw new BadRequestException('Invalid filter');
  const value = raw.trim();
  if (value === 'all' || value === 'folders' || value === 'files' || value === 'recent') return value;
  throw new BadRequestException('Invalid filter');
}
