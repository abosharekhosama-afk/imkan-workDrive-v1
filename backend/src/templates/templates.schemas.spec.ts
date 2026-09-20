import { BadRequestException } from '@nestjs/common';
import { TemplateLibraryType } from '@prisma/client';
import { parseTemplateFromFile, parseTemplateBuilder, defaultTemplateBuilderConfig } from './templates.schemas';

describe('template schemas', () => {
  it('rejects an invalid template library', () => {
    expect(() => parseTemplateFromFile({ fileId: 'f1', name: 'Example', library: 'NOPE' })).toThrow(BadRequestException);
  });

  it('defaults template library to personal', () => {
    expect(parseTemplateFromFile({ fileId: 'f1', name: 'Example' }).library).toBe(TemplateLibraryType.PERSONAL);
  });
});


describe('template builder schema', () => {
  it('creates a stable empty builder definition', () => {
    expect(defaultTemplateBuilderConfig()).toMatchObject({ version: 1, fields: [], sections: [], tables: [], images: [], rules: [] });
  });

  it('normalizes builder collections and limits unsafe values', () => {
    const parsed = parseTemplateBuilder({
      fields: [{ id: 'field-1', label: ' Name ', variableId: 'v1', required: 1, position: -4 }],
      sections: [{ id: 'section-1', name: ' Main ', layout: 'two-column' }],
      tables: [{ id: 'table-1', name: 'Items', columns: [{ id: 'c1', label: 'Amount', type: 'CURRENCY' }] }],
      images: [{ id: 'image-1', sourceType: 'URL', source: 'https://example.test/logo.png' }],
      header: { enabled: true, content: '{{company}}', align: 'center' },
      footer: { enabled: true, content: 'Footer', align: 'right' },
      preview: { mode: 'MOBILE' },
    });
    expect(parsed.fields[0]).toMatchObject({ id: 'field-1', label: 'Name', variableId: 'v1', required: true, position: 0 });
    expect(parsed.sections[0]).toMatchObject({ id: 'section-1', name: 'Main', layout: 'two-column' });
    expect(parsed.tables[0].columns[0]).toMatchObject({ id: 'c1', label: 'Amount', type: 'CURRENCY' });
    expect(parsed.header).toMatchObject({ enabled: true, align: 'center' });
    expect(parsed.footer).toMatchObject({ enabled: true, align: 'right' });
    expect(parsed.preview.mode).toBe('MOBILE');
  });
});
