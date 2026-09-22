import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Phase 28 Writer DOCX fidelity source gate', () => {
  const source = readFileSync(join(__dirname, 'office-conversion.service.ts'), 'utf8');

  it('contains native DOCX footnote export and import paths', () => {
    expect(source).toContain("word/footnotes.xml");
    expect(source).toContain('rIdFootnotes');
    expect(source).toContain('w:footnoteReference');
    expect(source).toContain('footnoteTextById');
    expect(source).toContain('footnoteBlockIds');
  });

  it('contains native DOCX endnote export/import paths', () => {
    expect(source).toContain("word/endnotes.xml");
    expect(source).toContain('w:endnoteReference');
    expect(source).toContain('endnoteTextById');
    expect(source).toContain('endnoteBlockIds');
  });

  it('contains native bookmark ranges for Writer bookmarks', () => {
    expect(source).toContain('w:bookmarkStart');
    expect(source).toContain('w:bookmarkEnd');
    expect(source).toContain('bookmarkByBlock');
  });

  it('emits native REF fields and imports them back into the cross-reference model', () => {
    expect(source).toContain('w:fldSimple');
    expect(source).toContain('REF ${esc(crossRef.bookmark)}');
    expect(source).toContain('importedCrossReferences');
    expect(source).toContain('sourceBlockId');
  });

  it('emits native XE fields and INDEX fields for Writer index structures', () => {
    expect(source).toContain('w:fldSimple');
    expect(source).toContain('INDEX \\h');
    expect(source).toContain('XE \\');
    expect(source).toContain('importedIndexEntries');
    expect(source).toContain('indexEntriesByBlock');
  });

  it('emits a native Word TOC field for TOC blocks', () => {
    expect(source).toContain("b.type==='toc'");
    expect(source).toContain('TOC \\o');
  });
});
