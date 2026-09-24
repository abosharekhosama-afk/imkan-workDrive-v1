export type CellValue = string | number | boolean | null;
export type NumberFormat = 'general'|'number'|'currency'|'accounting'|'percent'|'date'|'time'|'datetime'|'scientific';
export type ValidationRule = { type:'list'|'number'|'text'; values?:string[]; min?:number; max?:number };
export type ConditionalFormat = { id:string; range:string; type:'cellIs'|'containsText'; operator:'>'|'>='|'<'|'<='|'='|'!='|'contains'; value:string; format:CellFormat };
export type CellFormat = { fontFamily?: string; fontSize?: number; bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; color?: string; background?: string; align?: 'start'|'center'|'end'; verticalAlign?: 'top'|'middle'|'bottom'; wrap?: boolean; numberFormat?: NumberFormat; decimals?: number; border?: boolean; borderColor?: string };
export type SheetCell = { value: CellValue; formula?: string; format?: CellFormat; validation?: ValidationRule; mergedInto?: string; note?: string };
export type NamedRange = { name:string; reference:string; scopeSheetId?:string };
export type SheetTable = { id:string; name:string; start:string; end:string; hasHeader:boolean; style?:'plain'|'banded'|'minimal'; totalRow?:boolean; filter?:Record<string,string>; };
export type PivotTable = { id:string; name:string; sourceRange:string; rowField?:string; columnField?:string; valueField?:string; filterField?:string; aggregation?:'sum'|'count'|'average'|'min'|'max' };
export type ChartType = 'column'|'bar'|'line'|'area'|'pie'|'doughnut'|'scatter'|'combo';
export type ChartStackMode = 'none'|'stacked'|'percent';
export type ChartAxis = { min?:number; max?:number; tick?:number; title?:string; labels?:boolean; grid?:boolean };
export type ChartTrendline = { enabled:boolean; type:'linear'; seriesIndex?:number };
export type SheetChart = { id:string; type:ChartType; title:string; rangeStart:string; rangeEnd:string; position:{row:number;col:number}; x?:number; y?:number; width:number;height:number;legend:boolean;showLabels:boolean;series?:string[]; seriesTypes?:('column'|'line'|'bar')[]; stackMode?:ChartStackMode; theme?:string; colors?:string[]; xAxis?:ChartAxis; yAxis?:ChartAxis; trendline?:ChartTrendline; showMarkers?:boolean; showValues?:boolean };
export type Sheet = { id:string; name:string; cells:Record<string,SheetCell>; hiddenRows?:number[]; hiddenColumns?:string[]; conditionalFormats?:ConditionalFormat[]; tables?:SheetTable[]; pivotTables?:PivotTable[]; rowHeights?:Record<number,number>; columnWidths?:Record<string,number>; frozenRows?:number; frozenColumns?:number; filters?:Record<string,string>|null; sort?:{column:string;direction:'asc'|'desc'}|null; merges?:{start:string;end:string}[]; charts?:SheetChart[] };
export type Workbook = { schema:7; type:'SHEET'; title:string; activeSheet:string; sheets:Sheet[]; namedRanges?:NamedRange[]; };
export const colName=(n:number)=>{let s='';for(let x=n+1;x>0;x=Math.floor((x-1)/26))s=String.fromCharCode(65+(x-1)%26)+s;return s};
export const colIndex=(s:string)=>{let n=0;for(const c of s.toUpperCase())n=n*26+c.charCodeAt(0)-64;return n-1};
export const cellKey=(r:number,c:number)=>`${colName(c)}${r+1}`;
export const parseKey=(key:string)=>{const m=/^\$?([A-Z]+)\$?(\d+)$/i.exec(key);return m?{row:Number(m[2])-1,col:colIndex(m[1])}:null};
export function defaultWorkbook():Workbook{const cells:Record<string,SheetCell>={A1:{value:'Welcome to IMKAN Sheet',format:{bold:true}},A3:{value:'Try =SUM(A1:A5), =IF(A1>0,"Yes","No")'}};return{schema:7,type:'SHEET',title:'Untitled spreadsheet',activeSheet:'sheet-1',sheets:[{id:'sheet-1',name:'Sheet1',cells}]};}
export const cloneWorkbook=(w:Workbook):Workbook=>JSON.parse(JSON.stringify(w));
export const activeSheet=(w:Workbook)=>w.sheets.find(s=>s.id===w.activeSheet)??w.sheets[0];
export function setCell(w:Workbook,sheetId:string,key:string,cell:SheetCell|null){const n=cloneWorkbook(w),s=n.sheets.find(x=>x.id===sheetId);if(!s)return w;if(cell===null)delete s.cells[key];else s.cells[key]=cell;return n;}
function splitArgs(s:string){const out:string[]=[];let q=false,depth=0,start=0;for(let i=0;i<s.length;i++){const ch=s[i];if(ch==='"')q=!q;else if(!q&&ch==='(')depth++;else if(!q&&ch===')')depth--;else if(!q&&depth===0&&ch===','){out.push(s.slice(start,i).trim());start=i+1}}out.push(s.slice(start).trim());return out.filter(Boolean)}
function unquoteSheet(s:string){return s.replace(/^'|'$/g,'').replace(/''/g,"'")}
function refInfo(token:string,current:Sheet){const m=/^(?:'((?:[^']|'')+)'|([A-Za-z_][\w ]*))!\$?([A-Z]+)\$?(\d+)$/i.exec(token);if(m){const name=unquoteSheet(m[1]??m[2]);return {sheetName:name,key:`${m[3].toUpperCase()}${m[4]}`,absoluteRow:/\$\d+/.test(token),absoluteCol:/\$[A-Z]+/.test(token)}}const p=parseKey(token);return p?{sheetName:current.name,key:`${colName(p.col)}${p.row+1}`,absoluteRow:/\$\d+/.test(token),absoluteCol:/\$[A-Z]+/.test(token)}:null}
function rawValue(token:string,w:Workbook,current:Sheet,stack:Set<string>):any{const ri=refInfo(token,current);if(ri){const s=w.sheets.find(x=>x.name===ri.sheetName)||w.sheets.find(x=>x.name.toLowerCase()===ri.sheetName.toLowerCase())||current;const id=`${s.id}!${ri.key}`;if(stack.has(id))throw new Error('cycle');const c=s.cells[ri.key];if(!c)return 0;if(c.formula){const n=new Set(stack);n.add(id);return evalFormula(c.formula,s,n,w)}return c.value??0}return undefined}
function scalar(a:string,w:Workbook,sheet:Sheet,stack:Set<string>):any{const x=a.trim(); const nr=w.namedRanges?.find(n=>n.name.toLowerCase()===x.toLowerCase() && (!n.scopeSheetId || n.scopeSheetId===sheet.id)); if(nr){ const rr=rangeRefs(nr.reference,sheet,w,stack); return rr.keys.length>1?rawValue(rr.keys[0],w,rr.sheet,stack):rawValue(rr.keys[0]??nr.reference,w,rr.sheet,stack); }if(/^".*"$/.test(x))return x.slice(1,-1);if(/^TRUE$/i.test(x))return true;if(/^FALSE$/i.test(x))return false;if(/^[-+]?\d+(\.\d+)?$/.test(x))return Number(x);if(/^(?:'[^']+'|[A-Za-z_][\w ]*)!\$?[A-Z]+\$?\d+$/i.test(x)||/^\$?[A-Z]+\$?\d+$/i.test(x))return rawValue(x,w,sheet,stack);return evalFormula('='+x,sheet,stack,w)}
function expandRange(token:string,sheet:Sheet,w:Workbook,stack:Set<string>):any[]{const named=w.namedRanges?.find(n=>n.name.toLowerCase()===token.trim().toLowerCase() && (!n.scopeSheetId || n.scopeSheetId===sheet.id)); if(named) token=named.reference; const parts=token.split(':');if(parts.length!==2)return [scalar(token,w,sheet,stack)];const a=refInfo(parts[0],sheet),b=refInfo(parts[1],sheet);if(!a||!b)return [scalar(token,w,sheet,stack)];const target=w.sheets.find(s=>s.name.toLowerCase()===a.sheetName.toLowerCase())||sheet;const p1=parseKey(a.key)!,p2=parseKey(b.key)!;const out:any[]=[];for(let r=Math.min(p1.row,p2.row);r<=Math.max(p1.row,p2.row);r++)for(let c=Math.min(p1.col,p2.col);c<=Math.max(p1.col,p2.col);c++)out.push(rawValue(cellKey(r,c),w,target,stack));return out}
function rangeRefs(token:string,sheet:Sheet,w:Workbook,stack:Set<string>):{sheet:Sheet;keys:string[]} {
  const parts=token.split(':');
  if(parts.length!==2) return {sheet,keys:[token.trim()]};
  const a=refInfo(parts[0].trim(),sheet), b=refInfo(parts[1].trim(),sheet);
  if(!a||!b) return {sheet,keys:[]};
  const target=w.sheets.find(x=>x.name.toLowerCase()===a.sheetName.toLowerCase())||sheet;
  const p1=parseKey(a.key)!,p2=parseKey(b.key)!; const keys:string[]=[];
  for(let r=Math.min(p1.row,p2.row);r<=Math.max(p1.row,p2.row);r++) for(let c=Math.min(p1.col,p2.col);c<=Math.max(p1.col,p2.col);c++) keys.push(cellKey(r,c));
  return {sheet:target,keys};
}
function textScalar(a:string,w:Workbook,sheet:Sheet,stack:Set<string>):string { return String(scalar(a,w,sheet,stack)??''); }
function criterionMatch(value:any,criterion:any):boolean {
  const c=String(criterion??''); const m=c.match(/^(<=|>=|<>|=|<|>)(.*)$/);
  if(!m) return String(value??'').toLowerCase()===c.toLowerCase();
  const rhs=m[2], nv=Number(value), nr=Number(rhs); const numeric=rhs!==''&&Number.isFinite(nv)&&Number.isFinite(nr); const a=numeric?nv:String(value??'').toLowerCase(), b=numeric?nr:rhs.toLowerCase();
  switch(m[1]){case '=':return a===b;case '<>':return a!==b;case '<':return a<b;case '>':return a>b;case '<=':return a<=b;default:return a>=b;}
}
export function evalFormula(formula:string,sheet:Sheet,stack=new Set<string>(),workbook?:Workbook):any{
  const w=workbook??({schema:7,type:'SHEET',title:'',activeSheet:sheet.id,sheets:[sheet]} as Workbook); let f=formula.trim(); if(!f.startsWith('=')) return formula; f=f.slice(1).trim();
  const fn=f.match(/^([A-Z][A-Z0-9_.]*)\((.*)\)$/i);
  if(fn){ const name=fn[1].toUpperCase(),args=splitArgs(fn[2]);
    if(name==='IF'){if(args.length<2)throw Error('IF');return scalar(args[0],w,sheet,stack)?scalar(args[1],w,sheet,stack):(args[2]?scalar(args[2],w,sheet,stack):false)}
    if(name==='AND')return args.every(a=>Boolean(scalar(a,w,sheet,stack))); if(name==='OR')return args.some(a=>Boolean(scalar(a,w,sheet,stack))); if(name==='NOT')return !Boolean(scalar(args[0]??'FALSE',w,sheet,stack));
    if(['LEFT','RIGHT','MID','LEN','UPPER','LOWER','TRIM'].includes(name)){const str=textScalar(args[0]??'""',w,sheet,stack); if(name==='LEN')return str.length;if(name==='UPPER')return str.toUpperCase();if(name==='LOWER')return str.toLowerCase();if(name==='TRIM')return str.trim();if(name==='LEFT')return str.slice(0,Math.max(0,Number(scalar(args[1]??'1',w,sheet,stack))));if(name==='RIGHT')return str.slice(-Math.max(0,Number(scalar(args[1]??'1',w,sheet,stack))));return str.slice(Math.max(0,Number(scalar(args[1]??'1',w,sheet,stack))-1),Math.max(0,Number(scalar(args[1]??'1',w,sheet,stack))-1)+Math.max(0,Number(scalar(args[2]??'1',w,sheet,stack))));}
    if(name==='CONCAT'||name==='CONCATENATE')return args.map(a=>textScalar(a,w,sheet,stack)).join('');
    if(['ABS','POWER','MOD','ROUND','ROUNDUP','ROUNDDOWN'].includes(name)){const a=Number(scalar(args[0]??'0',w,sheet,stack));const b=Number(scalar(args[1]??'0',w,sheet,stack));if(name==='ABS')return Math.abs(a);if(name==='POWER')return Math.pow(a,b);if(name==='MOD')return b===0?0:a%b;if(name==='ROUND')return Math.round(a*10**b)/10**b;if(name==='ROUNDUP')return Math.ceil(a*10**b)/10**b;return Math.floor(a*10**b)/10**b;}
    if(name==='IFERROR'){ try { const value=scalar(args[0]??'0',w,sheet,stack); return value===undefined||String(value).startsWith('#') ? (args[1]?scalar(args[1],w,sheet,stack):'') : value; } catch { return args[1]?scalar(args[1],w,sheet,stack):''; } }
    if(name==='DATE'){ const y=Number(scalar(args[0]??'0',w,sheet,stack)),m=Number(scalar(args[1]??'1',w,sheet,stack)),d=Number(scalar(args[2]??'1',w,sheet,stack)); return new Date(Date.UTC(y,m-1,d)).toISOString().slice(0,10); }
    if(name==='TODAY'||name==='NOW'){ const d=new Date(); return name==='TODAY'?d.toISOString().slice(0,10):d.toISOString(); }
    if(name==='YEAR'||name==='MONTH'||name==='DAY'){ const raw=scalar(args[0]??'0',w,sheet,stack); const d=new Date(String(raw)); if(Number.isNaN(d.getTime())) return '#VALUE!'; if(name==='YEAR') return d.getUTCFullYear(); if(name==='MONTH') return d.getUTCMonth()+1; return d.getUTCDate(); }
    if(name==='SUMPRODUCT'){ const arrays=args.map(a=>expandRange(a,sheet,w,stack)); const len=Math.max(0,...arrays.map(a=>a.length)); let total=0; for(let i=0;i<len;i++){ let product=1; for(const arr of arrays) product*=Number(arr[i]??0)||0; total+=product; } return total; }
    if(name==='COUNTIF'||name==='SUMIF'){const rr=rangeRefs(args[0]??'',sheet,w,stack);const crit=scalar(args[1]??'""',w,sheet,stack);const vals=rr.keys.map(k=>rawValue(k,w,rr.sheet,stack));const matched=vals.map((v,i)=>({v,k:rr.keys[i]})).filter(x=>criterionMatch(x.v,crit));if(name==='COUNTIF')return matched.length;const sumRange=args[2]?rangeRefs(args[2],sheet,w,stack):rr;return matched.reduce((n,x)=>n+Number(rawValue(sumRange.keys[rr.keys.indexOf(x.k)]??x.k,w,sumRange.sheet,stack)||0),0);}
    if(name==='COUNTIFS'||name==='SUMIFS'){const offset=name==='SUMIFS'?1:0;if(args.length<offset+2||(args.length-offset)%2!==0)throw Error(name);const target=name==='SUMIFS'?rangeRefs(args[0],sheet,w,stack):null;const pairs:number[][]=[];for(let i=offset;i<args.length;i+=2){const rr=rangeRefs(args[i],sheet,w,stack);const crit=scalar(args[i+1],w,sheet,stack);pairs.push(rr.keys.map(k=>criterionMatch(rawValue(k,w,rr.sheet,stack),crit)?1:-1));}const len=pairs[0]?.length??0;const matched:number[]=[];for(let i=0;i<len;i++)if(pairs.every(p=>p[i]>=0))matched.push(i);if(name==='COUNTIFS')return matched.length;return matched.reduce((n,i)=>n+Number(rawValue(target!.keys[i]??'',w,target!.sheet,stack)||0),0);}
    if(name==='AVERAGEIF'||name==='MAXIFS'||name==='MINIFS'){const offset=name==='AVERAGEIF'?0:1;const rr=name==='AVERAGEIF'?rangeRefs(args[0]??'',sheet,w,stack):rangeRefs(args[1]??'',sheet,w,stack);const crit=name==='AVERAGEIF'?scalar(args[1]??'""',w,sheet,stack):scalar(args[2]??'""',w,sheet,stack);const target=name==='AVERAGEIF'?(args[2]?rangeRefs(args[2],sheet,w,stack):rr):rangeRefs(args[0]??'',sheet,w,stack);const vals=rr.keys.map(k=>rawValue(k,w,rr.sheet,stack));const matched=vals.map((v,i)=>criterionMatch(v,crit)?i:-1).filter(i=>i>=0);const nums=matched.map(i=>Number(rawValue(target.keys[i]??'',w,target.sheet,stack))).filter(Number.isFinite);if(!nums.length)return 0;if(name==='AVERAGEIF')return nums.reduce((a,b)=>a+b,0)/nums.length;return name==='MAXIFS'?Math.max(...nums):Math.min(...nums);}
    if(name==='IFNA'){try{const value=scalar(args[0]??'',w,sheet,stack);return String(value)==='#N/A'?(args[1]?scalar(args[1],w,sheet,stack):''):value;}catch{return args[1]?scalar(args[1],w,sheet,stack):'';}}
    if(name==='RANK'||name==='RANK.EQ'){const value=Number(scalar(args[0]??'0',w,sheet,stack));const rr=expandRange(args[1]??'',sheet,w,stack).map(Number).filter(Number.isFinite).sort((a,b)=>Number(scalar(args[2]??'0',w,sheet,stack))?a-b:b-a);const idx=rr.findIndex(x=>x===value);return idx<0?'#N/A':idx+1;}
    if(name==='LARGE'||name==='SMALL'){const rr=expandRange(args[0]??'',sheet,w,stack).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);const k=Math.max(1,Number(scalar(args[1]??'1',w,sheet,stack)));return rr.length>=k?(name==='LARGE'?rr[rr.length-k]:rr[k-1]):'#NUM!';}
    if(name==='VALUE'){const value=textScalar(args[0]??'""',w,sheet,stack).replace(/[$,% ,]/g,'');const n=Number(value);return Number.isFinite(n)?n:'#VALUE!';}
    if(name==='TEXT'){const value=scalar(args[0]??'0',w,sheet,stack);const pattern=textScalar(args[1]??'"General"',w,sheet,stack);if(pattern.includes('%'))return `${(Number(value)*100).toFixed(Math.max(0,(pattern.split('.')[1]||'').replace(/[^0#]/g,'').length))}%`;if(/0\.0+/.test(pattern))return Number(value).toFixed((pattern.match(/0\.(0+)/)?.[1].length)??1);return String(value??'');}

    if(name==='VLOOKUP'||name==='HLOOKUP'||name==='XLOOKUP'||name==='INDEX'||name==='MATCH'){
      if(name==='MATCH'){const needle=scalar(args[0]??'""',w,sheet,stack), rr=rangeRefs(args[1]??'',sheet,w,stack);const exact=Number(scalar(args[2]??'0',w,sheet,stack))===0;for(let i=0;i<rr.keys.length;i++){const v=rawValue(rr.keys[i],w,rr.sheet,stack);if(exact?String(v??'').toLowerCase()===String(needle??'').toLowerCase():Number(v)<=Number(needle))return i+1;}return '#N/A';}
      if(name==='INDEX'){const rr=rangeRefs(args[0]??'',sheet,w,stack);const row=Math.max(1,Number(scalar(args[1]??'1',w,sheet,stack))),col=Math.max(1,Number(scalar(args[2]??'1',w,sheet,stack)));const a=parseKey(rr.keys[0]);if(!a)return '#N/A';return rawValue(cellKey(a.row+row-1,a.col+col-1),w,rr.sheet,stack);}
      const needle=scalar(args[0]??'""',w,sheet,stack); if(name==='XLOOKUP'){const lookup=rangeRefs(args[1]??'',sheet,w,stack),ret=rangeRefs(args[2]??'',sheet,w,stack);for(let i=0;i<lookup.keys.length;i++)if(String(rawValue(lookup.keys[i],w,lookup.sheet,stack)??'').toLowerCase()===String(needle??'').toLowerCase())return rawValue(ret.keys[i]??'',w,ret.sheet,stack)??(args[3]?scalar(args[3],w,sheet,stack):'#N/A');return args[3]?scalar(args[3],w,sheet,stack):'#N/A';}
      const rr=rangeRefs(args[1]??'',sheet,w,stack);const p=parseKey(rr.keys[0]);if(!p)return '#N/A';const idx=Number(scalar(args[2]??'1',w,sheet,stack));if(name==='HLOOKUP'){const row=parseKey(rr.keys[Math.min(idx-1,rr.keys.length-1)])?.row??p.row;for(let c=p.col;c<=p.col+30;c++){const v=rawValue(cellKey(p.row,c),w,rr.sheet,stack);if(String(v).toLowerCase()===String(needle).toLowerCase())return rawValue(cellKey(row,c),w,rr.sheet,stack);}return '#N/A';}for(let r=p.row;r<=p.row+100;r++){const v=rawValue(cellKey(r,p.col),w,rr.sheet,stack);if(String(v).toLowerCase()===String(needle).toLowerCase())return rawValue(cellKey(r,p.col+idx-1),w,rr.sheet,stack);}return '#N/A';
    }
    const vals:any[]=[]; for(const a of args) vals.push(...expandRange(a,sheet,w,stack)); const nums=vals.filter(v=>typeof v==='number'||(typeof v==='string'&&v!==''&&!Number.isNaN(Number(v)))).map(Number);
    if(name==='SUM')return nums.reduce((a,b)=>a+b,0);if(name==='AVERAGE')return nums.length?nums.reduce((a,b)=>a+b,0)/nums.length:0;if(name==='MIN')return nums.length?Math.min(...nums):0;if(name==='MAX')return nums.length?Math.max(...nums):0;if(name==='COUNT')return nums.length;if(name==='COUNTA')return vals.filter(v=>v!==null&&v!==undefined&&v!=='').length;
    throw Error('function');
  }
  const tokens=f.match(/"[^"]*"|'(?:[^']|'')+'![A-Z]+\$?\d+:[A-Z]+\$?\d+|'(?:[^']|'')+'![A-Z]+\$?\d+|[A-Za-z_][\w ]*![A-Z]+\$?\d+:[A-Z]+\$?\d+|[A-Za-z_][\w ]*![A-Z]+\$?\d+|\$?[A-Z]+\$?\d+(?::\$?[A-Z]+\$?\d+)?|\d+(?:\.\d+)?|[+\-*/><=()]|<>|<=|>=/gi);if(!tokens)throw Error('formula');let expr='';for(const t of tokens){if(/^"/.test(t))expr+=JSON.stringify(t.slice(1,-1));else if(/(?:!|\$?[A-Z]+\$?\d+)/i.test(t)){const v=t.includes(':')?expandRange(t,sheet,w,stack)[0]:rawValue(t,w,sheet,stack);expr+=typeof v==='number'?String(v):JSON.stringify(v??0);}else expr+=t;}if(!/^[0-9+\-*/><=()." A-Za-z_]+$/.test(expr))throw Error('unsafe');return Function(`"use strict";return (${expr.replace(/<>/g,'!==')})`)();
}
export { formulaDisplay } from './formula-display.ts';
export function listDependencies(formula:string):string[]{
  if(!formula)return [];
  const out:string[]=[];
  // Ignore quoted strings; capture cell refs and the individual endpoints of ranges.
  const cleaned=formula.replace(/"(?:""|[^"])*"/g,'""');
  const re=/(?:(?:'((?:[^']|'')+)'|([A-Za-z_][\w ]*))!)?\$?([A-Z]+)\$?(\d+)/gi;
  for(const m of cleaned.matchAll(re)) out.push(`${m[1]??m[2] ? `${m[1]??m[2]}!` : ''}${m[3].toUpperCase()}${m[4]}`);
  return [...new Set(out)];
}

export type DependencyGraph = Record<string,string[]>;

/** Build a workbook-wide dependency graph. Keys are sheet-id!A1; edges point to referenced cells. */
export function buildDependencyGraph(w:Workbook):DependencyGraph{
  const graph:DependencyGraph={};
  for(const s of w.sheets){
    for(const [key,cell] of Object.entries(s.cells)){
      if(!cell.formula) continue;
      const deps=listDependencies(cell.formula);
      const resolved:string[]=[];
      for(const dep of deps){
        const bang=dep.lastIndexOf('!');
        const sheetName=bang>=0?dep.slice(0,bang).replace(/^'|'$/g,'').replace(/''/g,"'"):s.name;
        const ref=bang>=0?dep.slice(bang+1):dep;
        const target=w.sheets.find(x=>x.name.toLowerCase()===sheetName.toLowerCase());
        if(target && parseKey(ref)) resolved.push(`${target.id}!${ref.toUpperCase()}`);
      }
      graph[`${s.id}!${key}`]=[...new Set(resolved)];
    }
  }
  return graph;
}

/** Return every cycle as an ordered path of workbook cell ids. */
export function findCircularReferences(w:Workbook):string[][]{
  const graph=buildDependencyGraph(w), state=new Map<string,0|1|2>(), stack:string[]=[], cycles:string[][]=[];
  const visit=(node:string)=>{
    if(state.get(node)===1){const i=stack.indexOf(node);if(i>=0)cycles.push([...stack.slice(i),node]);return;}
    if(state.get(node)===2)return;
    state.set(node,1);stack.push(node);
    for(const dep of graph[node]??[]) visit(dep);
    stack.pop();state.set(node,2);
  };
  Object.keys(graph).forEach(visit);
  return cycles;
}
