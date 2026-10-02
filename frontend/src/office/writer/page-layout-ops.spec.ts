import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePageSettings, applyDocumentPageSetup, clampZoom, contentWidthMm } from './page-layout-ops.ts';
import type { WriterDocument } from './model.ts';

function doc(): WriterDocument {
  return {
    schema: 7, type: 'WRITER', title: 'P', language: 'en', blocks: [],
    page: { size: 'A4', orientation: 'portrait', marginTopMm: 20, marginRightMm: 20, marginBottomMm: 20, marginLeftMm: 20, widthMm: 210, heightMm: 297 },
    review: { comments: [], changes: [], snapshots: [], trackChanges: false },
    citations: [], citationSources: [], citationStyle: 'numeric', captions: [], crossReferences: [],
    indexEntries: [], bookmarks: [], sections: [],
  } as WriterDocument;
}

test('normalizePageSettings clamps margins and defaults size', () => {
  const p = normalizePageSettings({ size: 'NOPE' as any, marginTopMm: 999, orientation: 'landscape' });
  assert.equal(p.size, 'A4');
  assert.equal(p.marginTopMm, 80);
  assert.equal(p.orientation, 'landscape');
});

test('applyDocumentPageSetup updates page margins and header', () => {
  const next = applyDocumentPageSetup(doc(), {
    size: 'LETTER', orientation: 'portrait', marginTop: 15, marginRight: 15, marginBottom: 15, marginLeft: 15,
    widthMm: 216, heightMm: 279, header: 'H', footer: 'F', firstHeader: '', firstFooter: '', oddHeader: '', oddFooter: '',
    evenHeader: '', evenFooter: '', showPageNumbers: true, pageNumberFormat: 'decimal', pageNumberStart: 3,
    differentFirstPage: false, differentOddEven: false, columns: 1, columnGapMm: 8, breakType: 'next-page',
  });
  assert.equal(next.page.size, 'LETTER');
  assert.equal(next.page.marginTopMm, 15);
  assert.equal(next.page.header, 'H');
  assert.equal(next.page.pageNumberStart, 3);
});

test('clampZoom stays within 50-200', () => {
  assert.equal(clampZoom(10), 50);
  assert.equal(clampZoom(250), 200);
  assert.equal(clampZoom(120), 120);
});

test('contentWidthMm subtracts margins', () => {
  const w = contentWidthMm({ size: 'A4', orientation: 'portrait', marginTopMm: 20, marginRightMm: 25, marginBottomMm: 20, marginLeftMm: 25, widthMm: 210, heightMm: 297 } as any);
  assert.equal(w, 210 - 50);
});
