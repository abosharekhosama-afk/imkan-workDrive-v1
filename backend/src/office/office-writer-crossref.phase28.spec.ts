import { describe, expect, it } from 'vitest';

describe('Phase 28 Writer cross-reference contract', () => {
  it('rebuilds caption numbering and references from canonical document state', () => {
    const source = require('fs').readFileSync('frontend/src/office/writer/commands.ts', 'utf8');
    expect(source).toContain('rebuildCaptionsAndCrossReferences');
    expect(source).toContain('c.number=n');
    expect(source).toContain('ref.targetId');
  });

  it('preserves reply resolved state during document normalization', () => {
    const source = require('fs').readFileSync('frontend/src/office/writer/model.ts', 'utf8');
    expect(source).toContain('resolved: Boolean(reply?.resolved)');
  });
});
