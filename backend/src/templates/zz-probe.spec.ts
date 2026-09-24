import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OfficeConversionService } from '../office/office-conversion.service';

describe('probe blank assets', () => {
  const service = new OfficeConversionService();
  const assets: Array<[string, string]> = [
    ['blank-document.docx', 'WRITER'],
    ['blank-spreadsheet.xlsx', 'SHEET'],
    ['blank-presentation.pptx', 'SHOW'],
  ];

  it.each(assets)('imports %s', async (file, expected) => {
    const bytes = readFileSync(join(__dirname, 'blank-assets', file));
    const result = await service.import(bytes, file);
    // eslint-disable-next-line no-console
    console.log(file, '=>', result.type, 'expected', expected, 'title', result.title);
    expect(result.type).toBe(expected);
  });
});
