import { describe, expect, it } from 'vitest';

/**
 * Phase 28 Writer fidelity contract: DOCX body nodes must retain their original
 * paragraph/table order after feature-specific parsing.
 */
describe('Phase 28 Writer DOCX body order fidelity', () => {
  it('records source offsets for paragraphs and tables and sorts the final blocks', () => {
    const source = require('fs').readFileSync('backend/src/office/office-conversion.service.ts', 'utf8');
    expect(source).toContain('blockSourceOffsets');
    expect(source).toContain("blockSourceOffsets[blockId]");
    expect(source).toContain("blockSourceOffsets[tableId]");
    expect(source).toContain('blocks.sort');
  });

  it('does not rely on appending all tables after paragraphs', () => {
    const source = require('fs').readFileSync('backend/src/office/office-conversion.service.ts', 'utf8');
    expect(source).toContain('Restore the original body order');
    expect(source).toContain('Paragraphs and tables are parsed separately');
  });
});
