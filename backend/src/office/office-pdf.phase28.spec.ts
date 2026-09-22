import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Phase 28 Writer PDF export contract', () => {
  it('uses browser-native PDF preparation without an external Office service', () => {
    const source = readFileSync('frontend/src/office/writer/pdf.ts', 'utf8');
    const page = readFileSync('frontend/src/app/office/writer/[fileId]/page.tsx', 'utf8');
    expect(page).toContain('window.print');
    expect(source).toContain('document.title');
    expect(source).not.toContain('onlyoffice');
  });

  it('keeps print layout aware of page dimensions, RTL, tables and images', () => {
    const source = readFileSync('frontend/src/app/office/writer/[fileId]/page.tsx', 'utf8');
    expect(source).toContain('@page{size:${pageWidth}mm ${pageHeight}mm');
    expect(source).toContain("dir={ar?'rtl':'ltr'}");
    expect(source).toContain('writer-table-header');
    expect(source).toContain('page-break-inside:avoid');
    expect(source).toContain('pageNumberFor');
    expect(source).toContain("breakType==='even-page'");
    expect(source).toContain("breakType==='odd-page'");
  });
});
