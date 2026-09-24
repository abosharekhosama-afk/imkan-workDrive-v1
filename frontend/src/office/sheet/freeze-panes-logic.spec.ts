import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Sheet } from './model.ts';
import { freezeOffsets, isFrozenCell, stickyLeftForCol, stickyTopForRow } from './freeze-panes-logic.ts';

const sheet: Sheet = {
  id: 's1',
  name: 'Sheet1',
  cells: {},
  frozenRows: 2,
  frozenColumns: 1,
  rowHeights: { 0: 30, 1: 40 },
  columnWidths: { A: 80 },
};

describe('freeze-panes-logic', () => {
  it('freezeOffsets sums header and frozen dimensions', () => {
    const o = freezeOffsets(sheet, 10, 10);
    assert.equal(o.frozenRows, 2);
    assert.equal(o.frozenCols, 1);
    assert.equal(o.topOffset, 32 + 30 + 40);
    assert.equal(o.leftOffset, 48 + 80);
  });

  it('isFrozenCell detects frozen region', () => {
    assert.equal(isFrozenCell(0, 0, 2, 1), true);
    assert.equal(isFrozenCell(2, 1, 2, 1), false);
  });

  it('stickyTopForRow offsets by prior row heights', () => {
    assert.equal(stickyTopForRow(0, sheet), 32);
    assert.equal(stickyTopForRow(1, sheet), 62);
  });

  it('stickyLeftForCol offsets by prior column widths', () => {
    assert.equal(stickyLeftForCol(0, sheet), 48);
    assert.equal(stickyLeftForCol(1, sheet), 48);
  });
});
