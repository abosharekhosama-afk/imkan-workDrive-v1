import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWriterOutline, findWriterOutlineItem } from './navigation.ts';
import type { WriterDocument } from './model';

const doc = {
  id: 'd1', title: 'Demo', blocks: [
    { id: 'a', type: 'paragraph', runs: [{ text: 'Intro' }] },
    { id: 'b', type: 'heading1', runs: [{ text: ' Main   heading ' }] },
    { id: 'c', type: 'heading2', runs: [{ text: 'Child' }] },
    { id: 'd', type: 'heading3', runs: [{ text: '' }] },
    { id: 'e', type: 'paragraph', runs: [{ text: 'End' }] },
  ], sections: [{ id: 's1' }], page: {} as any, review: { comments: [], changes: [], snapshots: [] }, bookmarks: [], citations: [], footnotes: [], endnotes: [], indexEntries: [], captionCounter: 0, citationStyle: 'numeric'
} as unknown as WriterDocument;

test('builds ordered heading outline and levels', () => {
  const outline = buildWriterOutline(doc);
  assert.deepEqual(outline,[
    { blockId: 'b', text: 'Main heading', level: 1, index: 1 },
    { blockId: 'c', text: 'Child', level: 2, index: 2 },
    { blockId: 'd', text: 'Heading 3', level: 3, index: 3 },
  ]);
});

test('finds outline item by stable block id', () => {
  assert.equal(findWriterOutlineItem(doc, 'c')?.level,2);
  assert.equal(findWriterOutlineItem(doc, 'missing'),undefined);
});
