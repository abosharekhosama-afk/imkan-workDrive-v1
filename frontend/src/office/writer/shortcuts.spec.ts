import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveWriterShortcut } from './shortcuts.ts';

const base = { ctrlKey: false, metaKey: false, shiftKey: false, altKey: false };

test('maps common writer shortcuts', () => {
  assert.equal(resolveWriterShortcut({ ...base, key: 'b', ctrlKey: true }), 'bold');
  assert.equal(resolveWriterShortcut({ ...base, key: 'f', ctrlKey: true }), 'find');
  assert.equal(resolveWriterShortcut({ ...base, key: 'h', ctrlKey: true }), 'replace');
  assert.equal(resolveWriterShortcut({ ...base, key: 'g', ctrlKey: true }), 'find-next');
  assert.equal(resolveWriterShortcut({ ...base, key: 'g', ctrlKey: true, shiftKey: true }), 'find-previous');
  assert.equal(resolveWriterShortcut({ ...base, key: 'F3', shiftKey: false }), 'find-next');
  assert.equal(resolveWriterShortcut({ ...base, key: 'F3', shiftKey: true }), 'find-previous');
  assert.equal(resolveWriterShortcut({ ...base, key: 'x', ctrlKey: true, shiftKey: true }), 'strike');
  assert.equal(resolveWriterShortcut({ ...base, key: 'l', ctrlKey: true, shiftKey: true }), 'align-start');
  assert.equal(resolveWriterShortcut({ ...base, key: 'Escape' }), 'close-panel');
  assert.equal(resolveWriterShortcut({ ...base, key: 't', ctrlKey: true, shiftKey: true }), 'track-changes');
  assert.equal(resolveWriterShortcut({ ...base, key: 'c', ctrlKey: true, shiftKey: true }), 'review-panel');
  assert.equal(resolveWriterShortcut({ ...base, key: 'n', ctrlKey: true, shiftKey: true }), 'next-change');
});
