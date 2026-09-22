import test from 'node:test';
import assert from 'node:assert/strict';
import { activeSheet, buildDependencyGraph, defaultWorkbook, evalFormula, findCircularReferences, listDependencies } from './model.ts';
import { insertRows, pasteRange, shiftFormulaReferences, updateCell } from './commands.ts';

test('Sheet phase 3: dependency graph resolves cross-sheet references and cycles', () => {
  let w=defaultWorkbook();
  w.sheets.push({id:'sheet-2',name:'Data',cells:{A1:{value:10}}});
  const s=activeSheet(w)!;
  s.cells.A1={value:null,formula:'=Data!A1*2'};
  const graph=buildDependencyGraph(w);
  assert.deepEqual(graph['sheet-1!A1'],['sheet-2!A1']);
  assert.equal(evalFormula('=Data!A1*2',s,new Set(),w),20);
  assert.equal(findCircularReferences(w).length,0);
  s.cells.B1={value:null,formula:'=A1'};
  s.cells.A1={value:null,formula:'=B1'};
  assert.equal(findCircularReferences(w).length,1);
});

test('Sheet phase 3: formula shifting preserves absolute references and quoted literals', () => {
  assert.equal(shiftFormulaReferences('=A1+$B$2+C$3+$D4+"A1"',2,1),'=B3+$B$2+D$3+$D6+"A1"');
});

test('Sheet phase 3: row insertion shifts formula references consistently', () => {
  let w=defaultWorkbook();
  w=pasteRange(w,'A1',[['10'],['20'],['=SUM(A1:A2)']]);
  w=insertRows(w,1,1);
  const s=activeSheet(w)!;
  assert.equal(s.cells.A4.formula,'=SUM(A2:A3)');
});

test('Sheet phase 3: data validation is enforced on direct edits', () => {
  let w=defaultWorkbook();
  const s=activeSheet(w)!; s.cells.A1={value:'Open',validation:{type:'list',values:['Open','Closed']}};
  assert.throws(()=>updateCell(w,0,0,'Other'),/allowed list/);
  w=updateCell(w,0,0,'Closed');
  assert.equal(activeSheet(w)?.cells.A1.value,'Closed');
});

test('Sheet phase 3: dependency parser ignores quoted cell-like text', () => {
  assert.deepEqual(listDependencies('=IF(A1="B2","C3",Data!D4)'),['A1','Data!D4']);
});
