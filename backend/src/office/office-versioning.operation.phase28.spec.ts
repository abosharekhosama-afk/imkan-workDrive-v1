import { computeOfficeContentHash } from './office-versioning';

describe('Phase 28 operation versioning contract', () => {
  it('uses content hash as the immutable identity of an operation snapshot', () => {
    const content = { schema: 7, type: 'WRITER', blocks: [{ id: 'p1', runs: [{ text: 'hello' }] }] };
    expect(computeOfficeContentHash(content)).toHaveLength(64);
    expect(computeOfficeContentHash(content)).toBe(computeOfficeContentHash(JSON.parse(JSON.stringify(content))));
  });

  it('changes the snapshot identity when an operation changes canonical content', () => {
    const before = { schema: 7, type: 'WRITER', blocks: [{ id: 'p1', runs: [{ text: 'hello' }] }] };
    const after = { ...before, blocks: [{ id: 'p1', runs: [{ text: 'hello world' }] }] };
    expect(computeOfficeContentHash(before)).not.toBe(computeOfficeContentHash(after));
  });
});
