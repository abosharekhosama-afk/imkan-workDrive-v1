import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Phase 28 Writer PDF closure contract', () => {
  const page = () => readFileSync('frontend/src/app/office/writer/[fileId]/page.tsx', 'utf8');

  it('guards PDF export cleanup against duplicate afterprint/timeout completion', () => {
    const source = page();
    expect(source).toContain('let finished=false');
    expect(source).toContain('if(finished)return');
    expect(source).toContain('window.setTimeout(done,15000)');
  });

  it('keeps exact page box sizing and protects semantic content from splitting', () => {
    const source = page();
    expect(source).toContain('box-sizing:border-box');
    expect(source).toContain('orphans:3;widows:3');
    expect(source).toContain('.writer-footnote');
    expect(source).toContain('.writer-endnote');
    expect(source).toContain('unicode-bidi:plaintext');
  });

  it('keeps the export browser-native and free of external editor dependencies', () => {
    const source = readFileSync('frontend/src/office/writer/pdf.ts', 'utf8');
    expect(source).toContain('window.print');
    expect(source).not.toContain('ONLYOFFICE');
    expect(source).not.toContain('onlyoffice');
  });
});
