import { Workbook, SheetCell, activeSheet, cellKey, cloneWorkbook, parseKey } from './model';

export function clearRange(w: Workbook, start: string, end: string) {
  const n = cloneWorkbook(w), s = activeSheet(n); const a = parseKey(start), b = parseKey(end);
  if (!s || !a || !b) return w;
  for (let r=Math.min(a.row,b.row); r<=Math.max(a.row,b.row); r++) for (let c=Math.min(a.col,b.col); c<=Math.max(a.col,b.col); c++) delete s.cells[cellKey(r,c)];
  return n;
}

export function patchRangeFormat(w: Workbook, start: string, end: string, format: Partial<NonNullable<SheetCell['format']>>) {
  const n = cloneWorkbook(w), s = activeSheet(n); const a = parseKey(start), b = parseKey(end);
  if (!s || !a || !b) return w;
  for (let r=Math.min(a.row,b.row); r<=Math.max(a.row,b.row); r++) for (let c=Math.min(a.col,b.col); c<=Math.max(a.col,b.col); c++) {
    const key=cellKey(r,c); s.cells[key]={...(s.cells[key]??{value:null}),format:{...(s.cells[key]?.format??{}),...format}};
  }
  return n;
}

export function setRangeValidation(w: Workbook, start: string, end: string, validation: SheetCell['validation']|undefined) {
  const n=cloneWorkbook(w),s=activeSheet(n);const a=parseKey(start),b=parseKey(end);if(!s||!a||!b)return w;
  for(let r=Math.min(a.row,b.row);r<=Math.max(a.row,b.row);r++)for(let c=Math.min(a.col,b.col);c<=Math.max(a.col,b.col);c++){
    const key=cellKey(r,c); if(!s.cells[key] && !validation) continue; s.cells[key]={...(s.cells[key]??{value:null}),validation}; if(!validation && s.cells[key].value===null && !s.cells[key].formula && !s.cells[key].format) delete s.cells[key];
  }
  return n;
}

export function toggleFreeze(w: Workbook, rows: number, cols: number) {
  const n=cloneWorkbook(w),s=activeSheet(n);if(!s)return w;
  if ((s.frozenRows??0)>0 || (s.frozenColumns??0)>0) { s.frozenRows=0; s.frozenColumns=0; }
  else { s.frozenRows=Math.max(0,Math.min(20,rows)); s.frozenColumns=Math.max(0,Math.min(10,cols)); }
  return n;
}
