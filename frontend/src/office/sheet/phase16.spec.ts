import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultWorkbook, evalFormula, activeSheet, cellKey } from './model.ts';
import { addConditionalFormat, shiftFormulaReferences, updateCell } from './commands.ts';

test('IMKAN Sheet evaluates common formulas and IFERROR', () => {
  let w = defaultWorkbook();
  w = updateCell(w, 0, 0, '10');
  w = updateCell(w, 1, 0, '20');
  w = updateCell(w, 2, 0, '=SUM(A1:A2)', '=SUM(A1:A2)');
  const s = activeSheet(w)!;
  assert.equal(evalFormula(s.cells.A3.formula!, s, new Set(), w), 30);
  assert.equal(evalFormula('=IFERROR(NOT_A_REAL_FUNCTION(),"fallback")', s, new Set(), w), 'fallback');
});

test('fill-down shifts relative references but keeps absolute references', () => {
  assert.equal(shiftFormulaReferences('=A1+$B$2+C$3+$D4', 2, 1), '=B3+$B$2+D$3+$D6');
});

test('conditional formatting is persisted on the sheet', () => {
  const w = addConditionalFormat(defaultWorkbook(), 'A1:A10', 'cellIs', '>', '5', { background: '#FEF3C7' });
  assert.equal(activeSheet(w)?.conditionalFormats?.length, 1);
  assert.equal(activeSheet(w)?.conditionalFormats?.[0].range, 'A1:A10');
});
