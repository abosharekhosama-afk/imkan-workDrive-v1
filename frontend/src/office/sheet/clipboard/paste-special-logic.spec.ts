import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPasteSpecial, extractRangeData } from './paste-special-logic.ts';
import { defaultWorkbook } from '../model.ts';

test('paste special values copies values without formulas', () => {
  const w = defaultWorkbook();
  w.sheets[0].cells.A1 = { value: 10, format: { bold: true } };
  w.sheets[0].cells.B1 = { value: null, formula: '=A1*2' };
  const matrix = extractRangeData(w.sheets[0], w, 'A1', 'A1');
  const next = applyPasteSpecial(w, 'B1', matrix, 'values');
  assert.equal(next.sheets[0].cells.B1.formula, undefined);
  assert.equal(next.sheets[0].cells.B1.value, 10);
});
