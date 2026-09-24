import test from 'node:test';
import assert from 'node:assert/strict';
import { removeDuplicatesInRange } from './remove-duplicates-logic.ts';
import { defaultWorkbook } from '../model.ts';

test('remove duplicates keeps header and compacts rows', () => {
  const w = defaultWorkbook();
  w.sheets[0].cells.A1 = { value: 'Name' };
  w.sheets[0].cells.A2 = { value: 'A' };
  w.sheets[0].cells.A3 = { value: 'A' };
  w.sheets[0].cells.A4 = { value: 'B' };
  const { workbook: next, removed } = removeDuplicatesInRange(w, 'A1', 'A4', [0], true);
  assert.equal(removed, 1);
  assert.equal(next.sheets[0].cells.A2.value, 'A');
  assert.equal(next.sheets[0].cells.A3.value, 'B');
});
