import { addTable, addPivotTable } from './commands';
import { buildPivot, tableHeaders, updateTable, deletePivotTable } from './table-pivot';
import type { Workbook } from './model';

const base=():Workbook=>({schema:7,type:'SHEET',title:'T',activeSheet:'s1',sheets:[{id:'s1',name:'Sheet1',cells:{A1:{value:'Category'},B1:{value:'Amount'},A2:{value:'A'},B2:{value:10},A3:{value:'B'},B3:{value:20},A4:{value:'A'},B4:{value:5}}}]});

test('table headers and pivot aggregation are deterministic',()=>{let w=base();w=addTable(w,'A1','B4','Sales',true);expect(tableHeaders(w.sheets[0],w.sheets[0].tables![0],w)).toEqual(['Category','Amount']);w=addPivotTable(w,'A1:B4','P1','Category','Amount','sum');const r=buildPivot(w.sheets[0],w.sheets[0].pivotTables![0],w);expect(r.rows).toEqual([['A',15],['B',20]]);expect(r.grandTotal).toBe(35);});

test('table and pivot mutations preserve workbook shape',()=>{let w=base();w=addTable(w,'A1','B4','Sales');const id=w.sheets[0].tables![0].id;w=updateTable(w,id,{style:'minimal',totalRow:true});expect(w.sheets[0].tables![0].totalRow).toBe(true);w=addPivotTable(w,'A1:B4','P1','Category','Amount','average');const pid=w.sheets[0].pivotTables![0].id;w=deletePivotTable(w,pid);expect(w.sheets[0].pivotTables).toEqual([]);});
