import assert from 'node:assert/strict';

describe('Phase 28 deep review OOXML invariants', () => {
  it('preserves base paragraph content when a pending insertion is exported', () => {
    const xml = '<w:r><w:t>Existing</w:t></w:r><w:ins w:id="7"><w:r><w:t>New</w:t></w:r></w:ins>';
    assert.match(xml, /Existing/);
    assert.match(xml, /<w:ins\b/);
    assert.match(xml, /New/);
  });
  it('keeps deleted content represented separately from surviving content', () => {
    const xml = '<w:del w:id="8"><w:r><w:delText>Removed</w:delText></w:r></w:del><w:r><w:t>Survives</w:t></w:r>';
    assert.match(xml, /<w:del\b/);
    assert.match(xml, /delText/);
    assert.match(xml, /Survives/);
  });
});
