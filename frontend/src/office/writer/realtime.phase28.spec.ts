import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRemoteWriterOperations, remotePatchesOverlapPending, transformWriterSelectionForRemote } from './realtime.ts';
import { emptyWriterDocument } from './model.ts';
import type { WriterSelectionBookmark } from './history-selection.ts';

function docWithBlocks(...blocks: { id: string; text: string }[]) {
  const doc = emptyWriterDocument();
  doc.blocks = blocks.map(block => ({ id: block.id, type: 'paragraph' as const, align: 'start' as const, runs: [{ text: block.text }] }));
  return doc;
}

const patch = (id: string, text: string) => ({ op: 'set' as const, path: `/blocksById/${encodeURIComponent(id)}`, value: { id, type: 'paragraph' as const, align: 'start' as const, runs: [{ text }] } });

const selection = (blockId: string, start: number, end: number): WriterSelectionBookmark => ({ blockId, start, end, collapsed: start === end });

test('remote changes on another block preserve local selection', () => {
  const before = docWithBlocks({ id: 'a', text: 'hello' }, { id: 'b', text: 'world' });
  const result = applyRemoteWriterOperations(before, [{ revision: 2, payload: { patches: [patch('b', 'WORLD')] } }], [], selection('a', 1, 4));
  assert.equal(result.conflict, false);
  assert.deepEqual(result.selection, selection('a', 1, 4));
  assert.equal(result.document.blocks[1].runs[0].text, 'WORLD');
});

test('remote deletion of selected block clears selection safely', () => {
  const before = docWithBlocks({ id: 'a', text: 'hello' }, { id: 'b', text: 'world' });
  const result = applyRemoteWriterOperations(before, [{ revision: 2, payload: { patches: [{ op: 'delete', path: '/blocksById/a' }] } }], [], selection('a', 1, 4));
  assert.equal(result.conflict, false);
  assert.equal(result.selection, null);
});

test('remote shortening of selected block clamps offsets', () => {
  const before = docWithBlocks({ id: 'a', text: 'abcdefgh' });
  const after = { ...before, blocks: [{ ...before.blocks[0], runs: [{ text: 'abc' }] }] };
  const next = transformWriterSelectionForRemote(selection('a', 4, 8), before, after, [patch('a', 'abc')]);
  assert.deepEqual(next, selection('a', 3, 3));
  assert.equal(next?.collapsed, true);
});

test('overlapping remote and pending paths are held for conflict', () => {
  assert.equal(remotePatchesOverlapPending([patch('a', 'remote')], [[patch('a', 'local')]]), true);
  assert.equal(remotePatchesOverlapPending([patch('a', 'remote')], [[patch('b', 'local')]]), false);
});

test('non-overlapping pending local edits are reapplied after remote edits', () => {
  const before = docWithBlocks({ id: 'a', text: 'hello' }, { id: 'b', text: 'world' });
  const result = applyRemoteWriterOperations(
    before,
    [{ revision: 2, payload: { patches: [patch('b', 'WORLD')] } }],
    [[patch('a', 'HELLO')]],
    selection('a', 0, 5),
  );
  assert.equal(result.conflict, false);
  assert.equal(result.document.blocks[0].runs[0].text, 'HELLO');
  assert.equal(result.document.blocks[1].runs[0].text, 'WORLD');
  assert.deepEqual(result.selection, selection('a', 0, 5));
});
