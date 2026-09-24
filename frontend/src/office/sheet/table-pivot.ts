import { Workbook, Sheet, SheetTable, PivotTable, cellKey, parseKey, formulaDisplay } from './model';

export type PivotResult = { headers:string[]; rows:(string|number)[][]; grandTotal:number };

function bounds(start:string,end:string){const a=parseKey(start),b=parseKey(end);if(!a||!b)return null;return {r0:Math.min(a.row,b.row),r1:Math.max(a.row,b.row),c0:Math.min(a.col,b.col),c1:Math.max(a.col,b.col)};}
export function tableMatrix(sheet:Sheet, table:SheetTable, workbook:Workbook){
  const b=bounds(table.start,table.end); if(!b)return [] as string[][];
  const out:string[][]=[]; for(let r=b.r0;r<=b.r1;r++){const row:string[]=[];for(let c=b.c0;c<=b.c1;c++){const cell=sheet.cells[cellKey(r,c)];row.push(cell?String(formulaDisplay(cell,sheet,workbook)):'');}out.push(row);}return out;
}
export function tableHeaders(sheet:Sheet, table:SheetTable, workbook:Workbook){const m=tableMatrix(sheet,table,workbook);return (table.hasHeader&&m.length?m[0]:m.length?m[0].map((_,i)=>`Column${i+1}`):[]);}
export function buildPivot(sheet:Sheet, pivot:PivotTable, workbook:Workbook):PivotResult {
  const b=bounds(...pivot.sourceRange.split(':') as [string,string]); if(!b)return {headers:['Row Labels','Values'],rows:[],grandTotal:0};
  const raw:string[][]=[]; for(let r=b.r0;r<=b.r1;r++){const row:string[]=[];for(let c=b.c0;c<=b.c1;c++){const cell=sheet.cells[cellKey(r,c)];row.push(cell?String(formulaDisplay(cell,sheet,workbook)):'');}raw.push(row);}
  if(!raw.length)return {headers:['Row Labels','Values'],rows:[],grandTotal:0};
  const headers=raw[0], data=raw.slice(1), ri=Math.max(0,pivot.rowField?headers.findIndex(h=>h.toLowerCase()===pivot.rowField!.toLowerCase()):-1), vi=Math.max(0,pivot.valueField?headers.findIndex(h=>h.toLowerCase()===pivot.valueField!.toLowerCase()):-1);
  const groups=new Map<string,{sum:number;count:number;min:number;max:number}>();
  for(const row of data){const key=row[ri]??'';const n=Number(row[vi]);const g=groups.get(key)??{sum:0,count:0,min:Number.POSITIVE_INFINITY,max:Number.NEGATIVE_INFINITY};if(Number.isFinite(n)){g.sum+=n;g.count++;g.min=Math.min(g.min,n);g.max=Math.max(g.max,n);}groups.set(key,g);}
  const aggValue=(g:{sum:number;count:number;min:number;max:number})=>{if(pivot.aggregation==='count')return g.count;if(pivot.aggregation==='average')return g.count?g.sum/g.count:0;if(pivot.aggregation==='min')return g.count?g.min:0;if(pivot.aggregation==='max')return g.count?g.max:0;return g.sum;};
  const rows=[...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([k,g])=>[k,aggValue(g)]);
  return {headers:[pivot.rowField||headers[ri]||'Row Labels',pivot.valueField||headers[vi]||'Values'],rows,grandTotal:rows.reduce((s,r)=>s+Number(r[1]||0),0)};
}
export function updateTable(workbook:Workbook,id:string,patch:Partial<SheetTable>){const n=JSON.parse(JSON.stringify(workbook)) as Workbook;const s=n.sheets.find(x=>x.id===n.activeSheet);const t=s?.tables?.find(x=>x.id===id);if(t)Object.assign(t,patch);return n;}
export function deletePivotTable(workbook:Workbook,id:string){const n=JSON.parse(JSON.stringify(workbook)) as Workbook;const s=n.sheets.find(x=>x.id===n.activeSheet);if(s)s.pivotTables=(s.pivotTables??[]).filter(p=>p.id!==id);return n;}
