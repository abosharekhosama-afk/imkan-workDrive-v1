import test from 'node:test';
import assert from 'node:assert/strict';
import { previewTextToColumns, splitLine } from './text-to-columns-logic.ts';

test('text to columns splits comma values', () => {
  assert.deepEqual(splitLine('a,b,c', 'comma'), ['a', 'b', 'c']);
  assert.deepEqual(previewTextToColumns('x,y\np,q', 'comma'), [['x', 'y'], ['p', 'q']]);
});
