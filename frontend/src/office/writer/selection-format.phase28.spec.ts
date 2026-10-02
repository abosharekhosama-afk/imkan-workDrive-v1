import test from 'node:test';
import assert from 'node:assert/strict';
import { patchRunsInRange } from './selection-format.ts';

test('patches only the selected characters inside a run', () => {
  const result = patchRunsInRange([{ text: 'Hello world' }], 6, 11, { bold: true });
  assert.deepEqual(result, [{ text: 'Hello ' }, { text: 'world', bold: true }]);
});

test('preserves existing formatting outside a selection spanning runs', () => {
  const result = patchRunsInRange([
    { text: 'AB', italic: true },
    { text: 'CD', color: '#f00' },
  ], 1, 3, { underline: true });
  assert.deepEqual(result, [
    { text: 'A', italic: true },
    { text: 'B', italic: true, underline: true },
    { text: 'C', color: '#f00', underline: true },
    { text: 'D', color: '#f00' },
  ]);
});

test('zero-length selection leaves runs unchanged', () => {
  const runs = [{ text: 'Text', italic: true }];
  assert.deepEqual(patchRunsInRange(runs, 2, 2, { bold: true }), runs);
});
