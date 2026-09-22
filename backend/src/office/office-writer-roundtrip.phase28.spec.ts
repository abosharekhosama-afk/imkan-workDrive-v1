import { describe, expect, it } from 'vitest';

describe('Phase 28 Writer round-trip closure contract', () => {
  it('tracks semantic Writer structures, not only block counts', () => {
    const source = require('fs').readFileSync('backend/src/office/office-conversion.service.ts', 'utf8');
    for (const metric of [
      'tableRows', 'tableCells', 'sections', 'bookmarks', 'footnotes', 'endnotes',
      'comments', 'replies', 'changes', 'pendingChanges', 'citations', 'citationSources',
      'captions', 'crossReferences', 'indexEntries', 'tocBlocks', 'bibliographyBlocks',
    ]) expect(source).toContain(metric);
  });

  it('keeps the round-trip endpoint wired to the conversion service', () => {
    const controller = require('fs').readFileSync('backend/src/office/office.controller.ts', 'utf8');
    expect(controller).toContain("files/:fileId/conversion-roundtrip");
    expect(controller).toContain('this.conversion.roundTrip');
  });
});
