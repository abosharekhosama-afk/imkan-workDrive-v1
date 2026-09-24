import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isPrintableInputKey,
  moveAfterEnter,
  moveAfterTab,
  moveCell,
  rangeBounds,
  selectAll,
  selectedKeys,
} from './selection-logic.ts';

describe('selection-logic', () => {
  it('builds selected keys for a range', () => {
    const keys = selectedKeys('A1', 'B2');
    assert.deepEqual(keys, ['A1', 'B1', 'A2', 'B2']);
  });

  it('moves selection with arrow deltas', () => {
    assert.equal(moveCell('B2', 0, 1, 99, 25), 'C2');
    assert.equal(moveCell('A1', -1, 0, 99, 25), 'A1');
  });

  it('moves after enter and tab', () => {
    assert.equal(moveAfterEnter('A1'), 'A2');
    assert.equal(moveAfterTab('A1'), 'B1');
    assert.equal(moveAfterTab('B1', true), 'A1');
  });

  it('detects printable input keys', () => {
    assert.equal(isPrintableInputKey('H'), true);
    assert.equal(isPrintableInputKey('Enter'), false);
    assert.equal(isPrintableInputKey('Tab'), false);
  });

  it('computes range bounds', () => {
    assert.deepEqual(rangeBounds('D5', 'A1'), { start: 'A1', end: 'D5' });
  });

  it('selects all cells', () => {
    const all = selectAll(99, 25);
    assert.equal(all.anchor, 'A1');
    assert.equal(all.focus, 'Z100');
  });
});
