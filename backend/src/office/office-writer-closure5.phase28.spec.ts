import { describe, expect, it } from 'vitest';

describe('Phase 28 Writer final persistence closure contract', () => {
  it('normalizes derived Writer structures before persistence', () => {
    const source = require('fs').readFileSync('frontend/src/office/writer/commands.ts', 'utf8');
    expect(source).toContain('export function normalizeWriterDocument');
    expect(source).toContain('rebuildCitationDisplay');
    expect(source).toContain('rebuildTableOfContents');
    expect(source).toContain('rebuildCaptionsAndCrossReferences');
    expect(source).toContain('rebuildIndex');
  });
  it('uses the same normalization path for direct block/table edits', () => {
    const source = require('fs').readFileSync('frontend/src/app/office/writer/[fileId]/page.tsx', 'utf8');
    expect(source).toContain('normalizeWriterDocument(reviewed)');
    expect(source).toContain('normalizeWriterDocument(next)');
  });
});
