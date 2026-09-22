import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultWorkbook, activeSheet } from './model.ts';
import { updateCell } from './commands.ts';
import { setRangeValidation } from './phase2-commands.ts';

test('Sheet phase 6: text validation enforces min/max length', () => {
  let w=defaultWorkbook();
  w=setRangeValidation(w,'A1','A1',{type:'text',min:3,max:5});
  assert.throws(()=>updateCell(w,0,0,'ab'),/validation/);
  w=updateCell(w,0,0,'abcd');
  assert.equal(activeSheet(w)?.cells.A1.value,'abcd');
  assert.throws(()=>updateCell(w,0,0,'abcdef'),/validation/);
});

test('Sheet phase 6: range validation is copied to every target cell', () => {
  let w=defaultWorkbook();
  w=setRangeValidation(w,'B2','C3',{type:'list',values:['Open','Closed']});
  const s=activeSheet(w)!;
  for(const key of ['B2','C2','B3','C3']) assert.deepEqual(s.cells[key].validation,{type:'list',values:['Open','Closed']});
});
