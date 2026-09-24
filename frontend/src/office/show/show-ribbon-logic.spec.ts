import assert from 'node:assert/strict';
import test from 'node:test';
import { SHOW_ANIMATIONS, SHOW_INSERTS, SHOW_RIBBON_TABS, SHOW_TRANSITIONS, showShortcut } from './show-ribbon-logic.ts';

test('show ribbon exposes only the supported presentation tabs', () => {
  assert.deepEqual(SHOW_RIBBON_TABS, ['home', 'insert', 'design', 'transitions', 'animations', 'slideshow', 'review', 'view']);
  assert.equal(SHOW_RIBBON_TABS.includes('chart' as never), false);
});

test('insert, transition, and animation catalogs match the show engine', () => {
  assert.deepEqual(SHOW_INSERTS, ['text', 'shape', 'image', 'table', 'line', 'video', 'audio']);
  assert.deepEqual(SHOW_TRANSITIONS, ['none', 'fade', 'slide']);
  assert.deepEqual(SHOW_ANIMATIONS, ['none', 'fade', 'zoom', 'slide-in']);
});

test('show shortcuts route to real commands and ignore typing', () => {
  assert.equal(showShortcut({ key: 'z', ctrlKey: true, metaKey: false, shiftKey: false }, true), 'undo');
  assert.equal(showShortcut({ key: 's', ctrlKey: true, metaKey: false, shiftKey: false }, false), 'save');
  assert.equal(showShortcut({ key: 'Delete', ctrlKey: false, metaKey: false, shiftKey: false }, true), null);
  assert.equal(showShortcut({ key: 'F5', ctrlKey: false, metaKey: false, shiftKey: false }, false), 'present');
  assert.equal(showShortcut({ key: 'y', ctrlKey: true, metaKey: false, shiftKey: false }, false), 'redo');
});
