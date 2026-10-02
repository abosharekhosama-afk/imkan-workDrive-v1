import test from 'node:test';
import assert from 'node:assert/strict';
import { insertTable } from './commands.ts';
import { applyTableAction, nextTableCell, canMergeSelection, canSplitSelection } from './table-ops.ts';
import type { WriterDocument } from './model.ts';

function base(): WriterDocument {
  return {
    schema: 7, type: 'WRITER', title: 'T', language: 'en', blocks: [],
    page: {}, review: { comments: [], changes: [], snapshots: [], trackChanges: false },
    citations: [], citationSources: [], citationStyle: 'numeric', captions: [], crossReferences: [],
    indexEntries: [], bookmarks: [], sections: [],
  } as WriterDocument;
}

function tableDoc() {
  return insertTable(base(), 3, 3);
}

test('insert row below uses selection row index', () => {
  let d = tableDoc();
  const id = d.blocks[0].id;
  d = applyTableAction(d, id, 'insert-row-below', [{ row: 0, col: 0 }]).document;
  assert.equal(d.blocks[0].table!.rows.length, 4);
});

test('insert column left shifts selection', () => {
  const d = tableDoc();
  const id = d.blocks[0].id;
  const result = applyTableAction(d, id, 'insert-col-left', [{ row: 1, col: 1 }]);
  assert.equal(result.document.blocks[0].table!.rows[0].length, 4);
  assert.deepEqual(result.selection, [{ row: 1, col: 2 }]);
});

test('delete selected row removes that row only', () => {
  let d = tableDoc();
  const id = d.blocks[0].id;
  d.blocks[0].table!.rows[1][0].runs = [{ text: 'middle' }];
  d = applyTableAction(d, id, 'delete-row', [{ row: 1, col: 0 }]).document;
  assert.equal(d.blocks[0].table!.rows.length, 2);
  assert.notEqual(d.blocks[0].table!.rows[0][0].runs[0]?.text, 'middle');
  assert.notEqual(d.blocks[0].table!.rows[1][0].runs[0]?.text, 'middle');
});

test('merge and split selection helpers', () => {
  const d = tableDoc();
  const id = d.blocks[0].id;
  assert.equal(canMergeSelection(d, id, [{ row: 0, col: 0 }, { row: 0, col: 1 }]), true);
  assert.equal(canMergeSelection(d, id, [{ row: 0, col: 0 }, { row: 1, col: 1 }]), false);
  const merged = applyTableAction(d, id, 'merge', [{ row: 0, col: 0 }, { row: 0, col: 1 }]).document;
  assert.equal(canSplitSelection(merged, id, [{ row: 0, col: 0 }]), true);
});

test('Tab navigation skips to next cell and returns null past end', () => {
  const d = tableDoc();
  const id = d.blocks[0].id;
  assert.deepEqual(nextTableCell(d, id, 0, 0, 1), { row: 0, col: 1 });
  assert.deepEqual(nextTableCell(d, id, 0, 2, 1), { row: 1, col: 0 });
  assert.equal(nextTableCell(d, id, 2, 2, 1), null);
  assert.deepEqual(nextTableCell(d, id, 0, 0, -1), null);
});

test('header row toggles headerRows', () => {
  let d = tableDoc();
  const id = d.blocks[0].id;
  d = applyTableAction(d, id, 'header-row', [{ row: 0, col: 0 }]).document;
  assert.equal(d.blocks[0].table!.headerRows, 1);
  d = applyTableAction(d, id, 'header-row', [{ row: 0, col: 0 }]).document;
  assert.equal(d.blocks[0].table!.headerRows, 0);
});

test('delete table removes the block when more than one block exists', () => {
  let d = tableDoc();
  // ensure another block so removeBlock allows deletion
  d.blocks.push({ id: 'p1', type: 'paragraph', align: 'start', runs: [{ text: 'x' }], lineSpacing: 1.5, spaceAfter: 8 } as any);
  const id = d.blocks[0].id;
  d = applyTableAction(d, id, 'delete-table', []).document;
  assert.equal(d.blocks.find((b) => b.id === id), undefined);
});
