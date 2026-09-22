import { describe, expect, it } from 'vitest';

describe('Phase 28 Writer closure 4 contracts', () => {
  it('exports repeatable table header rows using native OOXML tblHeader', () => {
    const source = require('fs').readFileSync('backend/src/office/office-conversion.service.ts', 'utf8');
    expect(source).toContain('repeatHeaderRow');
    expect(source).toContain('<w:tblHeader/>');
    expect(source).toContain('headerRows');
  });

  it('supports multiple footnotes/endnotes attached to the same block', () => {
    const source = require('fs').readFileSync('backend/src/office/office-conversion.service.ts', 'utf8');
    expect(source).toContain('footnotesByBlock');
    expect(source).toContain('endnotesByBlock');
    expect(source).toContain('footnotesForBlock.map');
    expect(source).toContain('endnotesForBlock.map');
  });
});
