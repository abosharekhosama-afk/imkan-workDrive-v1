import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultPivotDestination, findPivotAtCell, refreshPivotToSheet } from './pivot-render-logic.ts';
import { defaultWorkbook } from '../model.ts';

test('pivot destination defaults beside source range', () => {
  assert.equal(defaultPivotDestination('A1:C5'), 'E5');
});

test('findPivotAtCell selects pivot by destination range', () => {
  const sheet = defaultWorkbook().sheets[0];
  sheet.pivotTables = [{ id: 'p1', name: 'Pivot1', sourceRange: 'A1:B3', destinationRange: 'E1:F5' }];
  assert.equal(findPivotAtCell(sheet, 'E3')?.id, 'p1');
  assert.equal(findPivotAtCell(sheet, 'A1'), null);
});

test('refreshPivotToSheet writes headers and totals', () => {
  let w = defaultWorkbook();
  const sheet = w.sheets[0];
  sheet.cells = {
    A1: { value: 'Item' },
    B1: { value: 'Qty' },
    A2: { value: 'Apple' },
    B2: { value: 2 },
    A3: { value: 'Apple' },
    B3: { value: 3 },
  };
  sheet.pivotTables = [{
    id: 'p1',
    name: 'Pivot1',
    sourceRange: 'A1:B3',
    destinationRange: 'E1',
    rowField: 'Item',
    valueField: 'Qty',
    aggregation: 'sum',
  }];
  w = refreshPivotToSheet(w, 'p1');
  const out = w.sheets[0].cells;
  assert.equal(out.E1?.value, 'Item');
  assert.equal(out.F1?.value, 'Qty');
  assert.equal(out.E2?.value, 'Apple');
  assert.equal(out.F2?.value, 5);
});
