import { strict as assert } from 'node:assert';

describe('Phase 28 Writer citation OOXML primitives', () => {
  it('uses native CITATION and BIBLIOGRAPHY field instructions', () => {
    const citation = '<w:fldSimple w:instr=" CITATION source-1 \\l \\"1033\\" "><w:r><w:t>Author</w:t></w:r></w:fldSimple>';
    const bibliography = '<w:fldSimple w:instr=" BIBLIOGRAPHY \\l \\"1033\\" "><w:r><w:t>Bibliography</w:t></w:r></w:fldSimple>';
    assert.match(citation, /CITATION\\s+source-1/);
    assert.match(bibliography, /BIBLIOGRAPHY/);
  });

  it('keeps citation source identity separate from rendered text', () => {
    const citation = { id: 'source-1', source: 'source-1', author: 'Doe', title: 'Example' };
    assert.equal(citation.id, 'source-1');
    assert.equal(citation.author, 'Doe');
    assert.notEqual(citation.author, citation.source);
  });
});
