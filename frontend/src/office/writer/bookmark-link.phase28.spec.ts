import test from 'node:test';
import assert from 'node:assert/strict';
import { addBookmark } from './commands.ts';
import { emptyWriterDocument } from './model.ts';

test('adds a sanitized bookmark and replaces duplicate names', () => {
  const doc = emptyWriterDocument();
  const blockId = doc.blocks[0].id;
  const one = addBookmark(doc, blockId, 'Section 1 / Intro');
  assert.equal(one.bookmarks[0].name, 'Section-1---Intro');
  const two = addBookmark(one, blockId, 'Section 1 / Intro');
  assert.equal(two.bookmarks.length, 1);
});
test('bookmark links resolve to stable block anchors', () => {
  const doc = emptyWriterDocument();
  const blockId = doc.blocks[0].id;
  const next = addBookmark(doc, blockId, 'intro');
  const bookmark = next.bookmarks.find(b => b.name === 'intro');
  assert.ok(bookmark);
  assert.equal(bookmark?.blockId, blockId);
});
