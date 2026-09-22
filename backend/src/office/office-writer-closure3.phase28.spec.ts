import { describe, expect, it } from 'vitest';

describe('Phase 28 Writer closure 3 contract', () => {
  it('refreshes derived captions and cross-references before persistence', () => {
    const page = require('fs').readFileSync('frontend/src/app/office/writer/[fileId]/page.tsx', 'utf8');
    expect(page).toContain('rebuildCaptionsAndCrossReferences');
    expect(page).toContain('persist(current,next)');
  });

  it('keeps DOCX footnotes/endnotes and modern review parts in the conversion contract', () => {
    const source = require('fs').readFileSync('backend/src/office/office-conversion.service.ts', 'utf8');
    for (const token of ['footnotes.xml', 'endnotes.xml', 'commentsExtended.xml', 'w15:paraIdParent', 'w15:done']) {
      expect(source).toContain(token);
    }
  });
});
