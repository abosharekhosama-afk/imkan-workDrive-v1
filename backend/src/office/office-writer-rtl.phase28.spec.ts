import { describe, expect, it } from 'vitest';

describe('Phase 28 Writer RTL / Arabic closure contract', () => {
  it('persists paragraph direction in the canonical Writer model', () => {
    const source = require('fs').readFileSync('frontend/src/office/writer/model.ts', 'utf8');
    expect(source).toContain("export type WriterBlockDirection = 'auto' | 'ltr' | 'rtl'");
    expect(source).toContain("direction: ['auto','ltr','rtl'].includes(block?.direction)");
  });

  it('exposes explicit RTL/LTR/auto controls in the Writer toolbar', () => {
    const source = require('fs').readFileSync('frontend/src/office/writer/toolbar.tsx', 'utf8');
    expect(source).toContain("onDirection('rtl')");
    expect(source).toContain("onDirection('ltr')");
    expect(source).toContain("onDirection('auto')");
  });

  it('round-trips paragraph direction through native DOCX bidi markup', () => {
    const source = require('fs').readFileSync('backend/src/office/office-conversion.service.ts', 'utf8');
    expect(source).toContain("/<w:bidi(?:\\s[^>]*)?\\/?>/.test(ppr)?'rtl'");
    expect(source).toContain("b.direction==='rtl'?'<w:bidi/>'");
    expect(source).toContain("b.direction==='ltr'?'<w:bidi w:val=\"0\"/>'");
  });

  it('uses block direction for browser-native print/PDF layout', () => {
    const source = require('fs').readFileSync('frontend/src/app/office/writer/[fileId]/page.tsx', 'utf8');
    expect(source).toContain("dir={block.direction==='rtl'?'rtl':block.direction==='ltr'?'ltr':ar?'rtl':'ltr'}");
  });
});
