import test from 'node:test';
import assert from 'node:assert/strict';
import { getWriterToolbarLayout } from './toolbar-overflow.ts';

test('wide writer toolbar keeps all controls visible', () => {
  const layout = getWriterToolbarLayout(1280);
  assert.equal(layout.overflow.length, 0);
  assert.ok(layout.visible.includes('image'));
  assert.ok(layout.visible.includes('comments'));
});

test('medium width moves lower-priority insertion controls to overflow', () => {
  const layout = getWriterToolbarLayout(1000);
  assert.deepEqual(layout.overflow, ['image', 'table', 'link', 'comments']);
  assert.ok(layout.visible.includes('alignment'));
});

test('narrow width preserves core formatting while overflowing secondary actions', () => {
  const layout = getWriterToolbarLayout(700);
  assert.ok(layout.visible.includes('alignment'));
  assert.ok(layout.visible.includes('clearFormatting'));
  assert.ok(layout.overflow.includes('image'));
  assert.ok(layout.overflow.includes('comments'));
});

test('very narrow width keeps overflow deterministic and non-empty', () => {
  const layout = getWriterToolbarLayout(520);
  assert.deepEqual(layout.visible, ['alignment', 'clearFormatting']);
  assert.equal(new Set(layout.overflow).size, layout.overflow.length);
});
