import test from 'node:test';
import assert from 'node:assert/strict';
import { recordChange } from './review.ts';
import { pendingChanges, nextPendingChange, previousPendingChange, changeKindFromRuns, acceptNextChange } from './review-ops.ts';
import type { WriterDocument } from './model.ts';

function base(): WriterDocument {
  return {
    schema: 7, type: 'WRITER', title: 'R', language: 'en',
    blocks: [{ id: 'b1', type: 'paragraph', align: 'start', runs: [{ text: 'Original' }] }],
    review: { comments: [], changes: [], snapshots: [], trackChanges: true },
    citations: [], citationSources: [], bookmarks: [], footnotes: [], endnotes: [], crossReferences: [], indexEntries: [], sections: [],
    page: { widthMm: 210, heightMm: 297, marginTopMm: 20, marginRightMm: 20, marginBottomMm: 20, marginLeftMm: 20 },
  } as WriterDocument;
}

test('changeKindFromRuns classifies insert/delete/format', () => {
  assert.equal(changeKindFromRuns(3, 5), 'insert');
  assert.equal(changeKindFromRuns(5, 3), 'delete');
  assert.equal(changeKindFromRuns(4, 4), 'format');
});

test('pendingChanges and navigation wrap', () => {
  let d = recordChange(base(), 'b1', [{ text: 'Original' }], [{ text: 'A' }], 'insert');
  d = recordChange(d, 'b1', [{ text: 'A' }], [{ text: 'B' }], 'insert');
  const pending = pendingChanges(d);
  assert.equal(pending.length, 2);
  const first = nextPendingChange(d);
  assert.ok(first);
  const second = nextPendingChange(d, first!.id);
  assert.ok(second);
  assert.notEqual(first!.id, second!.id);
  const back = previousPendingChange(d, first!.id);
  assert.equal(back!.id, pending[pending.length - 1].id);
});

test('acceptNextChange accepts one pending change', () => {
  let d = recordChange(base(), 'b1', [{ text: 'Original' }], [{ text: 'Changed' }], 'insert');
  const id = d.review.changes[0].id;
  const result = acceptNextChange(d, id);
  assert.equal(result.document.review.changes[0].status, 'accepted');
  assert.equal(result.document.blocks[0].runs[0].text, 'Changed');
});
