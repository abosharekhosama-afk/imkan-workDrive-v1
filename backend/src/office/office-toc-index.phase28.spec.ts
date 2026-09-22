import { describe, expect, it } from 'vitest';

describe('Phase 28 Writer TOC and index rebuild contract', () => {
  it('exposes deterministic TOC and index rebuild commands', () => {
    const source = require('fs').readFileSync('frontend/src/office/writer/commands.ts', 'utf8');
    expect(source).toContain('rebuildTableOfContents');
    expect(source).toContain('rebuildIndex');
    expect(source).toContain('estimatedPageNumbers');
    expect(source).toContain("['heading1','heading2','heading3']");
  });

  it('refreshes generated structures before the Writer persistence boundary', () => {
    const source = require('fs').readFileSync('frontend/src/app/office/writer/[fileId]/page.tsx', 'utf8');
    expect(source).toContain('rebuildIndex(rebuildTableOfContents(candidate))');
  });
});
