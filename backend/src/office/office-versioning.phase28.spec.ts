import { computeOfficeContentHash } from './office-versioning';

describe('Phase 28 Office version integrity', () => {
  it('produces a deterministic SHA-256 content hash', () => {
    const a = { type: 'WRITER', title: 'Test', blocks: [{ id: '1', runs: [{ text: 'مرحبا' }] }] };
    expect(computeOfficeContentHash(a)).toBe(computeOfficeContentHash(a));
    expect(computeOfficeContentHash(a)).toHaveLength(64);
  });

  it('changes the hash when persisted Office state changes', () => {
    const a = { type: 'SHEET', sheets: [{ id: 's1', cells: { A1: { value: 1 } } }] };
    const b = { type: 'SHEET', sheets: [{ id: 's1', cells: { A1: { value: 2 } } }] };
    expect(computeOfficeContentHash(a)).not.toBe(computeOfficeContentHash(b));
  });
});
