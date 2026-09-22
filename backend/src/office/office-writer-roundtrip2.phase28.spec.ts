import { describe, expect, it } from 'vitest';

describe('Phase 28 Writer round-trip fidelity 2', () => {
  it('tracks table header semantics in structural metrics', () => {
    const source = require('fs').readFileSync('backend/src/office/office-conversion.service.ts', 'utf8');
    expect(source).toContain('tableHeaderRows');
    expect(source).toContain('repeatingHeaderTables');
    expect(source).toContain('tblHeader');
    expect(source).toContain('repeatHeaderRow:headerRows>0');
  });

  it('imports native SEQ captions instead of dropping them', () => {
    const source = require('fs').readFileSync('backend/src/office/office-conversion.service.ts', 'utf8');
    expect(source).toContain('importedCaptions');
    expect(source).toContain('SEQ\\s+(Figure|Table|Equation)');
  });
});
