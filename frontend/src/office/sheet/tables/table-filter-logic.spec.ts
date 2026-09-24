import test from 'node:test';
import assert from 'node:assert/strict';
import { hiddenTableRows, visibleTableRows } from './table-filter-logic.ts';
import { defaultWorkbook } from '../model.ts';

test('table filter hides non-matching rows', () => {
  const w = defaultWorkbook();
  const sheet = w.sheets[0];
  sheet.cells = {
    A1: { value: 'Region' },
    B1: { value: 'Amount' },
    A2: { value: 'East' },
    B2: { value: 10 },
    A3: { value: 'West' },
    B3: { value: 20 },
    A4: { value: 'East' },
    B4: { value: 30 },
  };
  const table = { id: 't1', name: 'Sales', start: 'A1', end: 'B4', hasHeader: true, filter: { Region: 'East' } };
  sheet.tables = [table];
  const visible = visibleTableRows(sheet, table, w);
  assert.deepEqual(visible, [0, 1, 3]);
  const hidden = hiddenTableRows(sheet, w);
  assert.equal(hidden.has(2), true);
  assert.equal(hidden.has(0), false);
});
