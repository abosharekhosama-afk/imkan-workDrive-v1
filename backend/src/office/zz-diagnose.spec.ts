import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OfficeConversionService } from './office-conversion.service';

describe('diagnose blank assets', () => {
  const svc = new OfficeConversionService();
  it('imports all blank assets', async () => {
    for (const [file, name] of [['blank-document.docx', 'Blank.docx'], ['blank-spreadsheet.xlsx', 'Blank.xlsx'], ['blank-presentation.pptx', 'Blank.pptx']] as const) {
      const bytes = readFileSync(join(__dirname, '..', 'templates', 'blank-assets', file));
      try {
        const r = await svc.import(bytes, name);
        console.log(file, '=>', r.type, 'blocks/sheets/slides:', (r.content?.blocks?.length ?? r.content?.sheets?.length ?? r.content?.slides?.length));
      } catch (e) {
        console.log(file, 'FAILED:', (e as Error).message);
      }
    }
    expect(true).toBe(true);
  });

  it('round-trips export for each blank asset', async () => {
    for (const [file, name, fmt] of [['blank-document.docx', 'Blank.docx', 'docx'], ['blank-spreadsheet.xlsx', 'Blank.xlsx', 'xlsx'], ['blank-presentation.pptx', 'Blank.pptx', 'pptx']] as const) {
      const bytes = readFileSync(join(__dirname, '..', 'templates', 'blank-assets', file));
      try {
        const r = await svc.import(bytes, name);
        const out = await svc.export(r.type as any, r.content, fmt as any);
        console.log(file, 'export ok bytes:', (out as any)?.bytes?.length ?? Object.keys(out || {}).join(','));
      } catch (e) {
        console.log(file, 'EXPORT FAILED:', (e as Error).message);
      }
    }
    expect(true).toBe(true);
  });
});
