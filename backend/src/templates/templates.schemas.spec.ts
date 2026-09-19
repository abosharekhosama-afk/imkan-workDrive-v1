import { BadRequestException } from '@nestjs/common';
import { TemplateLibraryType } from '@prisma/client';
import { parseTemplateFromFile } from './templates.schemas';

describe('template schemas', () => {
  it('rejects an invalid template library', () => {
    expect(() => parseTemplateFromFile({ fileId: 'f1', name: 'Example', library: 'NOPE' })).toThrow(BadRequestException);
  });

  it('defaults template library to personal', () => {
    expect(parseTemplateFromFile({ fileId: 'f1', name: 'Example' }).library).toBe(TemplateLibraryType.PERSONAL);
  });
});
