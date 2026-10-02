import test from 'node:test';
import assert from 'node:assert/strict';
import { applyEnterAtBlock, applyBackspaceAtBlockStart } from './editing-keys.ts';
import type { WriterDocument } from './model.ts';

function doc(blocks: WriterDocument['blocks']): WriterDocument {
  return {
    title: 't',
    blocks,
    page: { size: 'A4', orientation: 'portrait', marginTopMm: 20, marginRightMm: 20, marginBottomMm: 20, marginLeftMm: 20, widthMm: 210, heightMm: 297, header: '', footer: '', showPageNumbers: true, pageNumberStart: 1, pageNumberFormat: 'decimal' },
    review: { trackChanges: false, showFormattingChanges: true, displayMode: 'all', markupColor: '#22c55e', comments: [], changes: [], snapshots: [] },
    bookmarks: [], footnotes: [], endnotes: [], citations: [], citationSources: [], citationStyle: 'numeric', captions: [], crossReferences: [], indexEntries: [], sections: [],
  } as WriterDocument;
}

test('Enter on empty list item exits the list', () => {
  const d = doc([{ id: 'a', type: 'list-item', ordered: true, align: 'start', runs: [{ text: '' }], lineSpacing: 1.5, spaceAfter: 8 }]);
  const result = applyEnterAtBlock(d, 'a', { before: [{ text: '' }], after: [{ text: '' }] });
  assert.equal(result.document.blocks[0].type, 'paragraph');
  assert.equal(result.focusBlockId, 'a');
});

test('Enter on non-empty list item creates another list item', () => {
  const d = doc([{ id: 'a', type: 'list-item', ordered: false, align: 'start', runs: [{ text: 'Item' }], lineSpacing: 1.5, spaceAfter: 8 }]);
  const result = applyEnterAtBlock(d, 'a', { before: [{ text: 'Item' }], after: [{ text: '' }] });
  assert.equal(result.document.blocks.length, 2);
  assert.equal(result.document.blocks[0].type, 'list-item');
  assert.equal(result.document.blocks[1].type, 'list-item');
  assert.equal(result.document.blocks[1].ordered, false);
  assert.ok(result.focusBlockId && result.focusBlockId !== 'a');
});

test('Enter splits a normal paragraph at the caret', () => {
  const d = doc([{ id: 'a', type: 'paragraph', align: 'start', runs: [{ text: 'Hello world' }], lineSpacing: 1.5, spaceAfter: 8 }]);
  const result = applyEnterAtBlock(d, 'a', { before: [{ text: 'Hello ' }], after: [{ text: 'world' }] });
  assert.equal(result.document.blocks.length, 2);
  assert.equal(result.document.blocks[0].runs.map(r=>r.text).join(''), 'Hello ');
  assert.equal(result.document.blocks[1].runs.map(r=>r.text).join(''), 'world');
});

test('Enter after a heading creates a paragraph', () => {
  const d = doc([{ id: 'a', type: 'heading1', align: 'start', runs: [{ text: 'Title' }], lineSpacing: 1.5, spaceAfter: 8 }]);
  const result = applyEnterAtBlock(d, 'a', { before: [{ text: 'Title' }], after: [{ text: '' }] });
  assert.equal(result.document.blocks[1].type, 'paragraph');
});

test('Backspace at start of list item exits the list', () => {
  const d = doc([{ id: 'a', type: 'list-item', ordered: true, align: 'start', runs: [{ text: 'Item' }], lineSpacing: 1.5, spaceAfter: 8 }]);
  const result = applyBackspaceAtBlockStart(d, 'a');
  assert.equal(result.document.blocks[0].type, 'paragraph');
  assert.equal(result.document.blocks[0].runs[0].text, 'Item');
});

test('Backspace at start of second paragraph merges into previous', () => {
  const d = doc([
    { id: 'a', type: 'paragraph', align: 'start', runs: [{ text: 'Hello ' }], lineSpacing: 1.5, spaceAfter: 8 },
    { id: 'b', type: 'paragraph', align: 'start', runs: [{ text: 'world' }], lineSpacing: 1.5, spaceAfter: 8 },
  ]);
  const result = applyBackspaceAtBlockStart(d, 'b');
  assert.equal(result.document.blocks.length, 1);
  assert.equal(result.document.blocks[0].runs.map(r=>r.text).join(''), 'Hello world');
  assert.equal(result.caretOffset, 6);
  assert.equal(result.focusBlockId, 'a');
});
