import { describe, expect, it } from 'vitest';

describe('Phase 28 Writer OOXML review contract', () => {
  it('requires native DOCX comments and tracked-change primitives', () => {
    const xml = '<w:commentRangeStart w:id="1"/><w:ins w:id="2" w:author="User" w:date="2026-09-21T00:00:00.000Z"><w:r><w:t>inserted</w:t></w:r></w:ins><w:commentRangeEnd w:id="1"/>';
    expect(xml).toContain('commentRangeStart');
    expect(xml).toContain('<w:ins ');
    expect(xml).toContain('commentRangeEnd');
  });

  it('uses deleted-text markup for native Word deletions', () => {
    const xml = '<w:del w:id="3"><w:r><w:delText xml:space="preserve">deleted</w:delText></w:r></w:del>';
    expect(xml).toContain('<w:del ');
    expect(xml).toContain('<w:delText');
  });
});
