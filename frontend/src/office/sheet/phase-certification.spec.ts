import test from 'node:test';
import assert from 'node:assert/strict';
import { activeSheet, defaultWorkbook, evalFormula, cellKey } from './model.ts';
import { deleteColumns, deleteRows, fillRange, insertColumns, insertRows, pasteRange, shiftFormulaReferences } from './commands.ts';

test('Sheet certification: row and column insertion preserve workbook semantics', () => {
  let w=defaultWorkbook();
  const s=activeSheet(w)!;
  s.cells={A1:{value:10},B1:{value:20},A2:{value:30},B2:{value:40},C3:{value:null,formula:'=A1+B2'}};
  w=insertRows(w,1,2);
  assert.equal(activeSheet(w)?.cells.A1.value,10);
  assert.equal(activeSheet(w)?.cells.A4.formula,'=A3+B4');
  w=insertColumns(w,1,1);
  assert.equal(activeSheet(w)?.cells.A1.value,10);
  assert.equal(activeSheet(w)?.cells.D5.formula,'=B3+C4');
  w=deleteRows(w,1,2);
  w=deleteColumns(w,1,1);
  assert.equal(activeSheet(w)?.cells.C2.formula,'=A1+B2');
});

test('Sheet certification: paste and fill-down preserve relative formula references', () => {
  let w=defaultWorkbook();
  w=pasteRange(w,'A1',[['10','20'],['30','40']]);
  w=pasteRange(w,'C1',[['=A1+B1']]);
  w=fillRange(w,'C1','C4');
  const s=activeSheet(w)!;
  assert.equal(s.cells.C2.formula,'=A2+B2');
  assert.equal(s.cells.C4.formula,'=A4+B4');
});

test('Sheet certification: formula references retain absolute anchors', () => {
  assert.equal(shiftFormulaReferences('=A1+$B$2+C$3+$D4',2,1),'=B3+$B$2+D$3+$D6');
});

test('Sheet certification: formulas calculate after structural edits', () => {
  let w=defaultWorkbook();
  w=pasteRange(w,'A1',[['10'],['20']]);
  w=pasteRange(w,'B1',[['=A1*2']]);
  w=fillRange(w,'B1','B2');
  const s=activeSheet(w)!;
  assert.equal(evalFormula(s.cells.B2.formula!,s,new Set(),w),40);
  assert.equal(cellKey(1,1),'B2');
});
