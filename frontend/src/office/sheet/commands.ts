import { Workbook, SheetCell, activeSheet, cellKey, cloneWorkbook, parseKey, colIndex, colName, type ValidationRule } from './model';

export function addSheet(w:Workbook){const n=cloneWorkbook(w),id=`sheet-${Date.now()}`;n.sheets.push({id,name:`Sheet${n.sheets.length+1}`,cells:{}});n.activeSheet=id;return n}
export function deleteActiveSheet(w:Workbook){if(w.sheets.length<=1)return w;const n=cloneWorkbook(w),i=n.sheets.findIndex(s=>s.id===n.activeSheet);n.sheets.splice(i,1);n.activeSheet=n.sheets[Math.max(0,i-1)].id;return n}
export function renameSheet(w:Workbook,name:string){const n=cloneWorkbook(w),s=activeSheet(n);if(s)s.name=name.trim().slice(0,80)||s.name;return n}
export const setActiveSheet=(w:Workbook,id:string)=>({...w,activeSheet:id});
export function validateValue(value:string,rule?:ValidationRule):string|null{
  if(!rule)return null;
  if(rule.type==='list') return (rule.values??[]).includes(value) ? null : 'Value is not in the allowed list';
  if(rule.type==='number'){
    const n=Number(value); if(value.trim()==='' || !Number.isFinite(n)) return 'Value must be a number';
    if(rule.min!==undefined && n<rule.min)return `Value must be >= ${rule.min}`;
    if(rule.max!==undefined && n>rule.max)return `Value must be <= ${rule.max}`;
  }
  if(rule.type==='text'){
    if(rule.min!==undefined && value.length<rule.min)return `Text length must be >= ${rule.min}`;
    if(rule.max!==undefined && value.length>rule.max)return `Text length must be <= ${rule.max}`;
  }
  return null;
}
export function updateCell(w:Workbook,row:number,col:number,value:string,formula?:string){const n=cloneWorkbook(w),s=activeSheet(n);if(!s)return w;const key=cellKey(row,col);const old=s.cells[key];if(!formula){const error=validateValue(value,old?.validation);if(error)throw new Error(error);}const cell:SheetCell={value:formula?null:(value===''?null:(/^[-+]?\d+(\.\d+)?$/.test(value)?Number(value):value)),...(formula?{formula}:{validation:old?.validation,format:old?.format})};if(value===''&&!formula){if(old?.validation)cell.validation=old.validation;if(old?.format)cell.format=old.format;if(!cell.validation&&!cell.format)delete s.cells[key];else s.cells[key]=cell}else s.cells[key]=cell;return n}
export function patchFormat(w:Workbook,key:string,format:Partial<NonNullable<SheetCell['format']>>){const n=cloneWorkbook(w),s=activeSheet(n);if(!s)return w;s.cells[key]={...(s.cells[key]??{value:null}),format:{...(s.cells[key]?.format??{}),...format}};return n}
export function setValidation(w:Workbook,key:string,validation:SheetCell['validation']){const n=cloneWorkbook(w),s=activeSheet(n);if(!s)return w;s.cells[key]={...(s.cells[key]??{value:null}),validation};return n}
export function setColumnWidth(w:Workbook,col:string,width:number){const n=cloneWorkbook(w),s=activeSheet(n);if(s)s.columnWidths={...(s.columnWidths??{}),[col]:Math.max(60,Math.min(420,width))};return n}
export function setRowHeight(w:Workbook,row:number,height:number){const n=cloneWorkbook(w),s=activeSheet(n);if(s)s.rowHeights={...(s.rowHeights??{}),[row]:Math.max(22,Math.min(100,height))};return n}
export function freeze(w:Workbook,rows:number,cols:number){const n=cloneWorkbook(w),s=activeSheet(n);if(s){s.frozenRows=Math.max(0,Math.min(20,rows));s.frozenColumns=Math.max(0,Math.min(10,cols))}return n}
export function mergeRange(w:Workbook,start:string,end:string){const n=cloneWorkbook(w),s=activeSheet(n);if(!s)return w;const a=parseKey(start)!,b=parseKey(end)!;const st=cellKey(Math.min(a.row,b.row),Math.min(a.col,b.col)),en=cellKey(Math.max(a.row,b.row),Math.max(a.col,b.col));s.merges=[...(s.merges??[]).filter(m=>!(m.start===st&&m.end===en)),{start:st,end:en}];return n}
export function unmergeRange(w:Workbook,start:string,end:string){const n=cloneWorkbook(w),s=activeSheet(n);if(s)s.merges=(s.merges??[]).filter(m=>!(m.start===start&&m.end===end));return n}

/** Insert blank rows and shift cells/row metadata/formula references downward. */
export function insertRows(w:Workbook, at:number, count=1){
  const n=cloneWorkbook(w),s=activeSheet(n); if(!s||count<=0)return w; at=Math.max(0,Math.floor(at));
  const cells:Record<string,SheetCell>={};
  for(const [key,cell] of Object.entries(s.cells)){const p=parseKey(key)!;const row=p.row>=at?p.row+count:p.row;cells[cellKey(row,p.col)]={...cell,formula:cell.formula?shiftFormulaReferences(cell.formula,count,0):undefined};if(!cell.formula)delete cells[cellKey(row,p.col)].formula;}
  s.cells=cells;
  if(s.rowHeights){const next:Record<number,number>={};for(const [r,h] of Object.entries(s.rowHeights))next[Number(r)>=at?Number(r)+count:Number(r)]=h;s.rowHeights=next;}
  if(s.merges)s.merges=s.merges.map(m=>shiftRangeRows(m,at,count));
  if(s.conditionalFormats)s.conditionalFormats=s.conditionalFormats.map(cf=>({...cf,range:shiftRangeRowsText(cf.range,at,count)}));
  if(s.tables)s.tables=s.tables.map(t=>({...t,start:shiftCellRow(t.start,at,count),end:shiftCellRow(t.end,at,count)}));
  return n;
}

/** Delete rows and shift cells/row metadata/formula references upward. */
export function deleteRows(w:Workbook, at:number, count=1){
  const n=cloneWorkbook(w),s=activeSheet(n); if(!s||count<=0)return w;at=Math.max(0,Math.floor(at));const end=at+count;
  const cells:Record<string,SheetCell>={};
  for(const [key,cell] of Object.entries(s.cells)){const p=parseKey(key)!;if(p.row>=at&&p.row<end)continue;const row=p.row>=end?p.row-count:p.row;cells[cellKey(row,p.col)]={...cell,formula:cell.formula?shiftFormulaReferences(cell.formula,-count,0):undefined};if(!cell.formula)delete cells[cellKey(row,p.col)].formula;}
  s.cells=cells;
  if(s.rowHeights){const next:Record<number,number>={};for(const [r,h] of Object.entries(s.rowHeights)){const rn=Number(r);if(rn>=at&&rn<end)continue;next[rn>=end?rn-count:rn]=h}s.rowHeights=next;}
  if(s.merges)s.merges=s.merges.map(m=>shiftRangeRows(m,at,-count)).filter(Boolean) as {start:string;end:string}[];
  if(s.conditionalFormats)s.conditionalFormats=s.conditionalFormats.map(cf=>({...cf,range:shiftRangeRowsText(cf.range,at,-count)}));
  if(s.tables)s.tables=s.tables.map(t=>({...t,start:shiftCellRow(t.start,at,-count),end:shiftCellRow(t.end,at,-count)}));
  return n;
}

/** Insert blank columns and shift cells/column metadata/formula references right. */
export function insertColumns(w:Workbook, at:number, count=1){
  const n=cloneWorkbook(w),s=activeSheet(n);if(!s||count<=0)return w;at=Math.max(0,Math.floor(at));
  const cells:Record<string,SheetCell>={};for(const [key,cell] of Object.entries(s.cells)){const p=parseKey(key)!;const col=p.col>=at?p.col+count:p.col;cells[cellKey(p.row,col)]={...cell,formula:cell.formula?shiftFormulaReferences(cell.formula,0,count):undefined};if(!cell.formula)delete cells[cellKey(p.row,col)].formula;}s.cells=cells;
  if(s.columnWidths){const next:Record<string,number>={};for(const [c,wid] of Object.entries(s.columnWidths)){const ci=colIndex(c);next[colName(ci>=at?ci+count:ci)]=wid}s.columnWidths=next;}
  if(s.merges)s.merges=s.merges.map(m=>shiftRangeCols(m,at,count));
  if(s.conditionalFormats)s.conditionalFormats=s.conditionalFormats.map(cf=>({...cf,range:shiftRangeColsText(cf.range,at,count)}));
  if(s.tables)s.tables=s.tables.map(t=>({...t,start:shiftCellCol(t.start,at,count),end:shiftCellCol(t.end,at,count)}));
  return n;
}

export function deleteColumns(w:Workbook,at:number,count=1){
  const n=cloneWorkbook(w),s=activeSheet(n);if(!s||count<=0)return w;at=Math.max(0,Math.floor(at));const end=at+count;const cells:Record<string,SheetCell>={};
  for(const [key,cell] of Object.entries(s.cells)){const p=parseKey(key)!;if(p.col>=at&&p.col<end)continue;const col=p.col>=end?p.col-count:p.col;cells[cellKey(p.row,col)]={...cell};if(cell.formula)cells[cellKey(p.row,col)].formula=shiftFormulaReferences(cell.formula,0,-count);}s.cells=cells;
  if(s.columnWidths){const next:Record<string,number>={};for(const [c,wid] of Object.entries(s.columnWidths)){const ci=colIndex(c);if(ci>=at&&ci<end)continue;next[colName(ci>=end?ci-count:ci)]=wid}s.columnWidths=next;}
  if(s.merges)s.merges=s.merges.map(m=>shiftRangeCols(m,at,-count)).filter(Boolean) as {start:string;end:string}[];
  if(s.conditionalFormats)s.conditionalFormats=s.conditionalFormats.map(cf=>({...cf,range:shiftRangeColsText(cf.range,at,-count)}));
  if(s.tables)s.tables=s.tables.map(t=>({...t,start:shiftCellCol(t.start,at,-count),end:shiftCellCol(t.end,at,-count)}));
  return n;
}

export function pasteRange(w:Workbook,start:string,values:string[][]){const n=cloneWorkbook(w),s=activeSheet(n);const p=parseKey(start);if(!s||!p)return w;values.forEach((row,r)=>row.forEach((value,c)=>{const key=cellKey(p.row+r,p.col+c);const raw=value??'';const existing=s.cells[key];if(raw.trimStart().startsWith('=')){s.cells[key]={...existing,value:null,formula:raw.trim()};}else{const error=validateValue(raw,existing?.validation);if(error)throw new Error(error);s.cells[key]={...existing,value:/^[-+]?\d+(\.\d+)?$/.test(raw)?Number(raw):raw};delete s.cells[key].formula;}}));return n;}
export function fillRange(w:Workbook,start:string,end:string){const n=cloneWorkbook(w),s=activeSheet(n);if(!s)return w;const a=parseKey(start),b=parseKey(end);if(!a||!b)return w;const src=s.cells[cellKey(a.row,a.col)];if(!src)return w;for(let r=Math.min(a.row,b.row);r<=Math.max(a.row,b.row);r++)for(let c=Math.min(a.col,b.col);c<=Math.max(a.col,b.col);c++){const deltaR=r-a.row,deltaC=c-a.col;s.cells[cellKey(r,c)]={...src,formula:src.formula?shiftFormulaReferences(src.formula,deltaR,deltaC):undefined};if(!src.formula)s.cells[cellKey(r,c)].formula=undefined;}return n;}

export function sortSheet(w:Workbook,column:string,direction:'asc'|'desc'){const n=cloneWorkbook(w),s=activeSheet(n);if(!s)return w;const rows=new Map<number,Record<string,SheetCell>>();for(const [k,v] of Object.entries(s.cells)){const p=parseKey(k)!;if(!rows.has(p.row))rows.set(p.row,{});rows.get(p.row)![k]=v}const ordered=[...rows.entries()].sort((a,b)=>{const av=a[1][`${column}${a[0]+1}`]?.value??'';const bv=b[1][`${column}${b[0]+1}`]?.value??'';return (av<bv?-1:av>bv?1:0)*(direction==='asc'?1:-1)});const cells:Record<string,SheetCell>={};ordered.forEach(([_,row],ri)=>Object.entries(row).forEach(([k,v])=>{const p=parseKey(k)!;cells[cellKey(ri,p.col)]=v}));s.cells=cells;s.sort={column,direction};return n}
export function setFilter(w:Workbook,column:string,query:string){const n=cloneWorkbook(w),s=activeSheet(n);if(s)s.filters={...(s.filters??{}),[column]:query};return n}
export function clearFilter(w:Workbook,column?:string){const n=cloneWorkbook(w),s=activeSheet(n);if(!s)return w;if(!column)s.filters=null;else{const f={...(s.filters??{})};delete f[column];s.filters=Object.keys(f).length?f:null}return n}
export function addNamedRange(w:Workbook,name:string,reference:string,scopeSheetId?:string){const n=cloneWorkbook(w);const clean=name.trim().replace(/\s+/g,'_').slice(0,80);if(!clean)return w;n.namedRanges=[...(n.namedRanges??[]).filter(x=>x.name.toLowerCase()!==clean.toLowerCase()),{name:clean,reference:reference.trim().toUpperCase().slice(0,200),scopeSheetId}];return n}
export function updateNamedRange(w:Workbook,oldName:string,name:string,reference:string,scopeSheetId?:string){const n=cloneWorkbook(w);n.namedRanges=(n.namedRanges??[]).filter(x=>x.name.toLowerCase()!==oldName.toLowerCase());const clean=name.trim().replace(/\s+/g,'_').slice(0,80);if(!clean)return w;n.namedRanges=[...(n.namedRanges??[]),{name:clean,reference:reference.trim().toUpperCase().slice(0,200),scopeSheetId}];return n}
export function deleteNamedRange(w:Workbook,name:string){const n=cloneWorkbook(w);n.namedRanges=(n.namedRanges??[]).filter(x=>x.name.toLowerCase()!==name.toLowerCase());return n}
export function updateConditionalFormat(w:Workbook,id:string,patch:Partial<import('./model').ConditionalFormat>){const n=cloneWorkbook(w),s=activeSheet(n);const rule=s?.conditionalFormats?.find(x=>x.id===id);if(rule)Object.assign(rule,patch);return n}
export function addTable(w:Workbook,start:string,end:string,name:string,hasHeader=true){const n=cloneWorkbook(w),s=activeSheet(n);if(!s)return w;const clean=name.trim().replace(/\s+/g,'_').slice(0,80);if(!clean)return w;s.tables=[...(s.tables??[]).filter(t=>t.name.toLowerCase()!==clean.toLowerCase()),{id:`table-${Date.now()}`,name:clean,start:start.toUpperCase(),end:end.toUpperCase(),hasHeader,style:'banded'}];return n}
export function deleteTable(w:Workbook,name:string){const n=cloneWorkbook(w),s=activeSheet(n);if(s)s.tables=(s.tables??[]).filter(t=>t.name.toLowerCase()!==name.toLowerCase());return n}
export function addPivotTable(w:Workbook,sourceRange:string,name:string,rowField?:string,valueField?:string,aggregation:'sum'|'count'|'average'|'min'|'max'='sum',destinationRange?:string){const n=cloneWorkbook(w),s=activeSheet(n);if(!s)return w;s.pivotTables=[...(s.pivotTables??[]),{id:`pivot-${Date.now()}`,name:name.trim().slice(0,80)||`Pivot${(s.pivotTables?.length??0)+1}`,sourceRange:sourceRange.toUpperCase(),destinationRange:destinationRange?.toUpperCase(),rowField:rowField?.trim(),valueField:valueField?.trim(),aggregation}];return n}
export function addConditionalFormat(w:Workbook, range:string, type:'cellIs'|'containsText', operator:'>'|'>='|'<'|'<='|'='|'!='|'contains', value:string, format:NonNullable<SheetCell['format']>){const n=cloneWorkbook(w),s=activeSheet(n);if(!s)return w;s.conditionalFormats=[...(s.conditionalFormats??[]),{id:`cf-${Date.now()}`,range:range.toUpperCase(),type,operator,value,format}];return n}
export function deleteConditionalFormat(w:Workbook,id:string){const n=cloneWorkbook(w),s=activeSheet(n);if(s)s.conditionalFormats=(s.conditionalFormats??[]).filter(x=>x.id!==id);return n}
export function shiftFormulaReferences(formula:string,rowDelta:number,colDelta:number):string {
  if(!formula||!formula.startsWith('='))return formula;
  const literals:string[]=[];
  const masked=formula.replace(/"(?:""|[^"])*"/g,m=>{const i=literals.push(m)-1;return `§${i}§`;});
  const shifted=masked.replace(/(\$?)([A-Z]+)(\$?)(\d+)/gi,(_m,colAbs,colLetters,rowAbs,rowDigits)=>{
    const col=colIndex(colLetters.toUpperCase()),row=Number(rowDigits)-1;
    const nextCol=colAbs?col:Math.max(0,col+colDelta), nextRow=rowAbs?row:Math.max(0,row+rowDelta);
    return `${colAbs?'$':''}${colName(nextCol)}${rowAbs?'$':''}${nextRow+1}`;
  });
  return shifted.replace(/§(\d+)§/g,(_,i)=>literals[Number(i)]);
}
function shiftCellRow(key:string,at:number,delta:number){const p=parseKey(key);if(!p)return key;if(p.row<at)return key;return cellKey(Math.max(0,p.row+delta),p.col)}
function shiftCellCol(key:string,at:number,delta:number){const p=parseKey(key);if(!p)return key;if(p.col<at)return key;return cellKey(p.row,Math.max(0,p.col+delta))}
function shiftRangeRows(m:{start:string;end:string},at:number,delta:number){return {start:shiftCellRow(m.start,at,delta),end:shiftCellRow(m.end,at,delta)}}
function shiftRangeCols(m:{start:string;end:string},at:number,delta:number){return {start:shiftCellCol(m.start,at,delta),end:shiftCellCol(m.end,at,delta)}}
function shiftRangeRowsText(range:string,at:number,delta:number){const [a,b]=range.split(':');return b?`${shiftCellRow(a,at,delta)}:${shiftCellRow(b,at,delta)}`:shiftCellRow(a,at,delta)}
function shiftRangeColsText(range:string,at:number,delta:number){const [a,b]=range.split(':');return b?`${shiftCellCol(a,at,delta)}:${shiftCellCol(b,at,delta)}`:shiftCellCol(a,at,delta)}

export function hideRows(w:Workbook, start:number, end=start){const n=cloneWorkbook(w),s=activeSheet(n);if(!s)return w;const set=new Set(s.hiddenRows??[]);for(let r=Math.min(start,end);r<=Math.max(start,end);r++)set.add(r);s.hiddenRows=[...set].sort((a,b)=>a-b);return n}
export function unhideRows(w:Workbook){const n=cloneWorkbook(w),s=activeSheet(n);if(s)s.hiddenRows=[];return n}
export function hideColumns(w:Workbook, start:string, end=start){const n=cloneWorkbook(w),s=activeSheet(n);if(!s)return w;const a=colIndex(start),b=colIndex(end),set=new Set(s.hiddenColumns??[]);for(let c=Math.min(a,b);c<=Math.max(a,b);c++)set.add(colName(c));s.hiddenColumns=[...set].sort((x,y)=>colIndex(x)-colIndex(y));return n}
export function unhideColumns(w:Workbook){const n=cloneWorkbook(w),s=activeSheet(n);if(s)s.hiddenColumns=[];return n}
