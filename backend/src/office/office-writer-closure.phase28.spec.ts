import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Phase 28 Writer closure contract', () => {
  it('covers the final Writer persistence/export path', () => {
    const page = readFileSync('frontend/src/app/office/writer/[fileId]/page.tsx', 'utf8');
    const commands = readFileSync('frontend/src/office/writer/commands.ts', 'utf8');
    const pdf = readFileSync('frontend/src/office/writer/pdf.ts', 'utf8');
    expect(page).toContain('prepareWriterPrintExport');
    expect(page).toContain('window.print()');
    expect(page).toContain('buildBibliographyEntries');
    expect(commands).toContain('rebuildTableOfContents');
    expect(commands).toContain('rebuildIndex');
    expect(commands).toContain('setCitationStyle');
    expect(pdf).toContain('imkan-writer-printing');
  });

  it('uses browser-native print without an external document server', () => {
    const pdf = readFileSync('frontend/src/office/writer/pdf.ts', 'utf8');
    expect(pdf).not.toContain('ONLYOFFICE');
    expect(pdf).not.toContain('http://');
    expect(pdf).not.toContain('https://');
  });
});
