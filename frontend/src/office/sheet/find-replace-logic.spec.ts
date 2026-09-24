import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cellKey, type Workbook } from './model.ts';
import { findNextCell, findPreviousCell, replaceCellText, autoSumRange, sheetCellKeys } from './find-replace-logic.ts';

const workbook: Workbook = {
  schema: 7,
  type: 'SHEET',
  title: 'Test',
  activeSheet: 's1',
  sheets: [{
    id: 's1',
    name: 'Sheet1',
    cells: {
      A1: { value: 'Hello' },
      B1: { value: 10, formula: '=SUM(1,9)' },
      A2: { value: 'World' },
    },
  }],
};

const sheet = workbook.sheets[0];

describe('find-replace-logic', () => {
  it('findNextCell scans forward from selection', () => {
    const hit = findNextCell(sheet, workbook, 'world', 'A1', 5, 5, 'values');
    assert.equal(hit, 'A2');
  });

  it('findPreviousCell scans backward', () => {
    const hit = findPreviousCell(sheet, workbook, 'hello', 'A2', 5, 5, 'values');
    assert.equal(hit, 'A1');
  });

  it('replaceCellText updates plain values', () => {
    const next = replaceCellText(sheet, workbook, 'A1', 'Hello', 'Hi', 'values');
    assert.deepEqual(next, { value: 'Hi' });
  });

  it('autoSumRange builds SUM formula', () => {
    assert.equal(autoSumRange('A1', 'B2'), '=SUM(A1:B2)');
  });

  it('sheetCellKeys returns row-major keys', () => {
    const keys = sheetCellKeys(2, 2);
    assert.deepEqual(keys, [cellKey(0, 0), cellKey(0, 1), cellKey(1, 0), cellKey(1, 1)]);
  });
});
