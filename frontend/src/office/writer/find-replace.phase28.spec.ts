import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findMatches,
  nextFindMatch,
  previousFindMatch,
  replaceAllMatches,
  replaceCurrentMatch,
  matchIndexOf,
} from './find-replace.ts';
import type { WriterDocument } from './model.ts';

function doc(): WriterDocument {
  return {
    id: 'd', title: 'Test', revision: 1,
    page: { size: 'A4', orientation: 'portrait', marginTopMm: 20, marginRightMm: 20, marginBottomMm: 20, marginLeftMm: 20 },
    blocks: [
      { id: 'a', type: 'paragraph', align: 'start', runs: [{ text: 'Hello ' }, { text: 'World', bold: true }] },
      { id: 'b', type: 'paragraph', align: 'start', runs: [{ text: 'hello again' }] },
      {
        id: 't', type: 'table', align: 'start', runs: [],
        table: {
          bordered: true,
          rows: [
            [{ id: 'c1', runs: [{ text: 'hello cell' }] }, { id: 'c2', runs: [{ text: 'other' }] }],
          ],
        },
      },
    ],
    sections: [], citations: [], citationSources: [], footnotes: [], endnotes: [], comments: [], bookmarks: [],
    review: { comments: [], changes: [], trackChanges: false, snapshots: [] },
  } as WriterDocument;
}

test('findMatches is case-insensitive by default', () => assert.equal(findMatches(doc(), 'hello').length, 3));
test('findMatches supports case-sensitive search', () => assert.equal(findMatches(doc(), 'hello', true).length, 2));
test('findMatches supports whole-word option', () => {
  assert.equal(findMatches(doc(), 'hello', { wholeWord: true }).length, 3);
  // hello in "hello cell" is whole word; hello in "hello again" is whole word; Hello in first is whole word → 3
  assert.equal(findMatches(doc(), 'hello', { wholeWord: true }).length, 3);
  assert.equal(findMatches(doc(), 'hell', { wholeWord: true }).length, 0);
});
test('findMatches searches table cells', () => {
  const m = findMatches(doc(), 'hello cell');
  assert.equal(m.length, 1);
  assert.deepEqual(m[0].cell, { row: 0, col: 0 });
});
test('nextFindMatch wraps to the first result', () => {
  const all = findMatches(doc(), 'hello');
  assert.equal(nextFindMatch(doc(), 'hello', all[all.length - 1])?.blockId, all[0].blockId);
});
test('previousFindMatch wraps to the last result', () => {
  const all = findMatches(doc(), 'hello');
  assert.equal(previousFindMatch(doc(), 'hello', all[0])?.blockId, all[all.length - 1].blockId);
});
test('replaceAllMatches preserves run formatting and replaces every match', () => {
  const result = replaceAllMatches(doc(), 'hello', 'Hi');
  assert.equal(result.count, 3);
  assert.equal(result.doc.blocks[0].runs[0].text, 'Hi ');
  assert.equal(result.doc.blocks[0].runs[1].text, 'World');
  assert.equal(result.doc.blocks[0].runs[1].bold, true);
  assert.equal(result.doc.blocks[1].runs[0].text, 'Hi again');
});
test('replaceCurrentMatch replaces one occurrence', () => {
  const first = findMatches(doc(), 'hello')[0];
  const result = replaceCurrentMatch(doc(), 'hello', 'Hi', first);
  assert.equal(result.count, 1);
  assert.equal(findMatches(result.doc, 'hello').length, 2);
});
test('matchIndexOf reports 1-based position', () => {
  const all = findMatches(doc(), 'hello');
  assert.deepEqual(matchIndexOf(doc(), 'hello', all[1]), { index: 2, total: 3 });
});
