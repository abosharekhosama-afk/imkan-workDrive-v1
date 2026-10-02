import test from 'node:test';
import assert from 'node:assert/strict';
import { findMatches, nextFindMatch, replaceAllMatches } from './find-replace.ts';
import type { WriterDocument } from './model.ts';

function doc(): WriterDocument {
  return {
    id: 'd', title: 'Test', revision: 1,
    page: { size: 'A4', orientation: 'portrait', marginTopMm: 20, marginRightMm: 20, marginBottomMm: 20, marginLeftMm: 20 },
    blocks: [
      { id: 'a', type: 'paragraph', align: 'start', runs: [{ text: 'Hello ' }, { text: 'World', bold: true }] },
      { id: 'b', type: 'paragraph', align: 'start', runs: [{ text: 'hello again' }] },
    ],
    sections: [], citations: [], citationSources: [], footnotes: [], endnotes: [], comments: [], bookmarks: [], review: { comments: [], changes: [], trackChanges: false, snapshots: [] },
  } as WriterDocument;
}

test('findMatches is case-insensitive by default', () => assert.equal(findMatches(doc(), 'hello').length, 2));
test('findMatches supports case-sensitive search', () => assert.equal(findMatches(doc(), 'hello', true).length, 1));
test('nextFindMatch wraps to the first result', () => { const all = findMatches(doc(), 'hello'); assert.equal(nextFindMatch(doc(), 'hello', all[1])?.blockId, all[0].blockId); });
test('replaceAllMatches preserves run formatting and replaces every match', () => { const result = replaceAllMatches(doc(), 'hello', 'Hi'); assert.equal(result.count, 2); assert.equal(result.doc.blocks[0].runs[0].text, 'Hi '); assert.equal(result.doc.blocks[0].runs[1].text, 'World'); assert.equal(result.doc.blocks[0].runs[1].bold, true); assert.equal(result.doc.blocks[1].runs[0].text, 'Hi again'); });
