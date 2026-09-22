import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('IMKAN Sheet XLSX round-trip Phase 7 source/runtime gate', () => {
  const source = readFileSync(join(__dirname, 'office-conversion.service.ts'), 'utf8');

  it('imports native XLSX tables including range, header, totals and style', () => {
    expect(source).toContain('const tables:any[]=[]');
    expect(source).toContain('tablePart');
    expect(source).toContain('displayName');
    expect(source).toContain('totalsRowCount');
    expect(source).toContain('tableStyleInfo');
  });

  it('exports native XLSX table parts and worksheet relationships', () => {
    expect(source).toContain('xl/tables/table${tableNo}.xml');
    expect(source).toContain('rIdTable${i+1}_${ti+1}');
    expect(source).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml');
    expect(source).toContain('<tableParts count=');
  });

  it('keeps charts and tables in the same worksheet relationship part', () => {
    expect(source).toContain('sheetExtraRels:Record<number,string[]>');
    expect(source).toContain('rIdDrawing${drawingNo}');
    expect(source).toContain('rIdTable${i+1}_${ti+1}');
    expect(source).toContain('http://schemas.openxmlformats.org/officeDocument/2006/relationships/table');
    expect(source).toContain('for(let i=0;i<sheets.length;i++){ const relsXml=sheetExtraRels[i]||[];');
  });

  it('round-trip structural metrics cover tables, validations, conditional formatting, panes and names', () => {
    expect(source).toContain('tables:sheets.reduce');
    expect(source).toContain('validations:sheets.reduce');
    expect(source).toContain('conditionalFormats:sheets.reduce');
    expect(source).toContain('frozenPanes:sheets.reduce');
    expect(source).toContain('namedRanges:Array.isArray(content?.namedRanges)');
  });

  it('retains existing formula, validation, conditional formatting and defined-name paths', () => {
    expect(source).toContain("formula:'='+decodeXml(formula)");
    expect(source).toContain('dataValidation');
    expect(source).toContain('conditionalFormatting');
    expect(source).toContain('definedNames');
  });
});
