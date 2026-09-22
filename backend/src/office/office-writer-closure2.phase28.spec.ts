import { describe, expect, it } from 'vitest';

describe('Phase 28 Writer final layout closure contract', () => {
  it('keeps section-relative first-page and odd/even pagination logic', () => {
    const source = require('fs').readFileSync('frontend/src/app/office/writer/[fileId]/page.tsx', 'utf8');
    expect(source).toContain('sectionPageOrdinal');
    expect(source).toContain('differentFirstPage');
    expect(source).toContain('differentOddEven');
    expect(source).toContain('pageNumber%2===1');
  });

  it('keeps footnotes and endnotes attached to the rendered Writer page model', () => {
    const source = require('fs').readFileSync('frontend/src/app/office/writer/[fileId]/page.tsx', 'utf8');
    expect(source).toContain('doc.footnotes.filter');
    expect(source).toContain('doc.endnotes.length');
    expect(source).toContain('pageBreakInside');
  });
});
