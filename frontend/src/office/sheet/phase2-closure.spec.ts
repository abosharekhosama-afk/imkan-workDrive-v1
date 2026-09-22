import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultWorkbook, activeSheet } from './model.ts';
import { clearRange, patchRangeFormat, setRangeValidation, toggleFreeze } from './phase2-commands.ts';
import { decodeClipboard, encodeClipboard } from './clipboard.ts';
import { pasteRange } from './commands.ts';

test('Sheet phase 2: range formatting and clear preserve non-target cells', () => {
  let w=defaultWorkbook();
  w=pasteRange(w,'A1',[['1','2'],['3','4']]);
  w=patchRangeFormat(w,'A1','B2',{bold:true,background:'#eeeeee'});
  const s=activeSheet(w)!;
  assert.equal(s.cells.A1.format?.bold,true);
  assert.equal(s.cells.B2.format?.background,'#eeeeee');
  w=clearRange(w,'A1','A2');
  assert.equal(activeSheet(w)?.cells.A1,undefined);
  assert.equal(activeSheet(w)?.cells.B2.value,4);
});

test('Sheet phase 2: range validation and freeze toggle are reversible', () => {
  let w=defaultWorkbook();
  w=setRangeValidation(w,'A1','B2',{type:'list',values:['Open','Closed']});
  assert.deepEqual(activeSheet(w)?.cells.B2.validation?.values,['Open','Closed']);
  w=toggleFreeze(w,1,2);
  assert.equal(activeSheet(w)?.frozenRows,1);
  assert.equal(activeSheet(w)?.frozenColumns,2);
  w=toggleFreeze(w,1,2);
  assert.equal(activeSheet(w)?.frozenRows,0);
  assert.equal(activeSheet(w)?.frozenColumns,0);
});

test('Sheet phase 2: clipboard matrix preserves tabular shape', () => {
  const raw=encodeClipboard({cells:[[{value:'A'},{value:'=B1'}],[{value:'10'},{value:'20'}]]});
  assert.equal(raw,'A\t=B1\n10\t20');
  assert.deepEqual(decodeClipboard(raw),[['A','=B1'],['10','20']]);
});
