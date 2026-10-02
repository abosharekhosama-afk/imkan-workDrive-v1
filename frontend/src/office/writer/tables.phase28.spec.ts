import test from 'node:test';
import assert from 'node:assert/strict';
import { insertTable, addTableRow, addTableColumn, removeTableRow, removeTableColumn, mergeTableCells, splitTableCell, toggleTableBorders } from './commands.ts';
import type { WriterDocument } from './model.ts';

function doc(): WriterDocument { return {schema:7,type:'WRITER',title:'T',language:'en',blocks:[],page:{},review:{comments:[],changes:[],snapshots:[],trackChanges:false},citations:[],citationSources:[],citationStyle:'numeric',captions:[],crossReferences:[],indexEntries:[],bookmarks:[],sections:[]} as WriterDocument; }
function tableDoc(){ return insertTable(doc(),3,3) }

test('adds and removes rows and columns without changing other dimensions unexpectedly',()=>{ let d=tableDoc(); const id=d.blocks[0].id; d=addTableRow(d,id,1); assert.equal(d.blocks[0].table!.rows.length,4); d=removeTableRow(d,id,1); assert.equal(d.blocks[0].table!.rows.length,3); d=addTableColumn(d,id,1); assert.equal(d.blocks[0].table!.rows[0].length,4); d=removeTableColumn(d,id,1); assert.equal(d.blocks[0].table!.rows[0].length,3); });

test('merge rectangular selection into anchor cell',()=>{ let d=tableDoc(); const id=d.blocks[0].id; d.blocks[0].table!.rows[0][0].runs=[{text:'A'}]; d.blocks[0].table!.rows[0][1].runs=[{text:'B'}]; d=mergeTableCells(d,id,[{row:0,col:0},{row:0,col:1}]); const t=d.blocks[0].table!; assert.equal(t.rows[0][0].colSpan,2); assert.equal(t.rows[0][1].hidden,true); assert.ok(t.rows[0][0].runs.map(x=>x.text).join('').startsWith('A')); });

test('rejects non-rectangular merge',()=>{ const d=tableDoc(); const id=d.blocks[0].id; const out=mergeTableCells(d,id,[{row:0,col:0},{row:1,col:1}]); assert.equal(out.blocks[0].table!.rows[0][0].colSpan,undefined); });

test('splits a merged cell back into visible cells',()=>{ let d=tableDoc(); const id=d.blocks[0].id; d=mergeTableCells(d,id,[{row:0,col:0},{row:0,col:1},{row:1,col:0},{row:1,col:1}]); d=splitTableCell(d,id,0,0); const t=d.blocks[0].table!; assert.equal(t.rows[0][0].colSpan,1); assert.equal(t.rows[0][0].rowSpan,1); assert.equal(t.rows[0][1].hidden,false); assert.equal(t.rows[1][0].hidden,false); });

test('toggles borders without altering cell data',()=>{ let d=tableDoc(); const id=d.blocks[0].id; const before=d.blocks[0].table!.rows[0][0].runs; d=toggleTableBorders(d,id); assert.equal(d.blocks[0].table!.bordered,false); assert.deepEqual(d.blocks[0].table!.rows[0][0].runs,before); });
