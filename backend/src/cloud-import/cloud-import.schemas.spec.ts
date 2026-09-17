import { BadRequestException } from '@nestjs/common';
import { parseCreateJobs, parseProvider } from './cloud-import.schemas';

describe('cloud import schemas', () => {
  it('accepts supported providers', () => expect(parseProvider('google')).toBe('google'));
  it('rejects unsupported providers', () => expect(() => parseProvider('ftp')).toThrow(BadRequestException));
  it('deduplicates selected remote files', () => {
    const result = parseCreateJobs({ folderId: null, files: [{ id: 'a', name: 'A' }, { id: 'a', name: 'A again' }] });
    expect(result.files).toHaveLength(1);
  });
  it('limits the selection size', () => {
    expect(() => parseCreateJobs({ folderId: null, files: [] })).toThrow(BadRequestException);
    expect(() => parseCreateJobs({ folderId: null, files: Array.from({ length: 51 }, (_, i) => ({ id: String(i) })) })).toThrow(BadRequestException);
  });
});
