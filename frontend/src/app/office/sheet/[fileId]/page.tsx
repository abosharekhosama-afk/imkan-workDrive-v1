'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { closeOfficeSession, openOfficeSession, saveOfficeDocument, touchOfficeSession } from '@/lib/api/office';
import { useLocale } from '@/components/locale-provider';
import { OfficeTransferControls } from '@/components/office-transfer-controls';
import { addNamedRange, addPivotTable, addSheet, addTable, clearFilter, deleteActiveSheet, freeze, mergeRange, patchFormat, renameSheet, setActiveSheet, setColumnWidth, setFilter, setRowHeight, setValidation, sortSheet, unmergeRange, updateCell } from '@/office/sheet/commands';
import { activeSheet, cellKey, cloneWorkbook, formulaDisplay, parseKey, type Sheet, type SheetCell, type Workbook } from '@/office/sheet/model';
import { SheetToolbar } from '@/office/sheet/toolbar';
import { OfficeRibbon } from '@/components/office-ribbon';
import { OfficeTemplateFields } from '@/components/office-template-fields';
import { addChart, deleteChart, rangeValues, updateChart } from '@/office/sheet/charts';
import type { ChartType, SheetChart } from '@/office/sheet/charts';

const ROWS = 100, COLS = 26;

export default function SheetPage() {
  const { fileId } = useParams<{ fileId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const templateId = searchParams.get('templateId');
  const { locale } = useLocale();
  const ar = locale === 'ar';
  const [doc, setDoc] = useState<Workbook | null>(null);
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState('A1');
  const [anchor, setAnchor] = useState('A1');
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(true);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<Workbook[]>([]);
  const [future, setFuture] = useState<Workbook[]>([]);
  const session = useRef<string | null>(null);
  const ref = useRef<Workbook | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const t = (en: string, arText: string) => ar ? arText : en;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await openOfficeSession(fileId);
        if (!alive) return;
        session.current = r.sessionId;
        const w = r.document.content as Workbook;
        const safe: Workbook = w?.type === 'SHEET' ? w : { schema: 5, type: 'SHEET', title: 'Untitled spreadsheet', activeSheet: 'sheet-1', sheets: [{ id: 'sheet-1', name: 'Sheet1', cells: {} }] };
        ref.current = safe; setDoc(safe); setRevision(r.document.revision);
      } catch (e: any) { setError(e?.message || 'Failed to open sheet'); }
    })();
    return () => { alive = false; if (timer.current) clearTimeout(timer.current); if (session.current) closeOfficeSession(session.current).catch(() => {}); };
  }, [fileId]);

  useEffect(() => {
    if (!session.current) return;
    const i = setInterval(() => touchOfficeSession(session.current!).catch(() => {}), 30000);
    return () => clearInterval(i);
  }, [doc]);

  const persist = async (w: Workbook) => {
    setSaving(true);
    try { const r = await saveOfficeDocument(fileId, w, revision); setRevision(r.revision); setSaved(true); }
    catch (e: any) { setError(e?.message || 'Save failed'); }
    finally { setSaving(false); }
  };
  const commit = (w: Workbook, immediate = false) => {
    if (!doc || JSON.stringify(w) === JSON.stringify(doc)) return;
    setHistory(h => [...h.slice(-49), cloneWorkbook(doc)]); setFuture([]); ref.current = w; setDoc(w); setSaved(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => persist(w), immediate ? 20 : 700);
  };
  const insertTemplateField = (placeholder: string) => {
    if (!doc || !sheet) return;
    const current = sheet.cells[selected];
    commit(updateCell(doc, sheet.id, selected, { ...(current ?? { value: '' }), value: placeholder, formula: undefined }));
  };
  const undo = () => { if (!doc || !history.length) return; const prev = history[history.length - 1]; setFuture(f => [cloneWorkbook(doc), ...f.slice(0, 49)]); setHistory(h => h.slice(0, -1)); ref.current = prev; setDoc(prev); setSaved(false); };
  const redo = () => { if (!doc || !future.length) return; const next = future[0]; setHistory(h => [...h, cloneWorkbook(doc)]); setFuture(f => f.slice(1)); ref.current = next; setDoc(next); setSaved(false); };

  const sheet = useMemo(() => doc ? activeSheet(doc) : undefined, [doc]);
  const cell = sheet?.cells[selected];
  useEffect(() => setInput(cell?.formula ?? (cell?.value == null ? '' : String(cell.value))), [selected, doc]);
  if (!doc || !sheet) return <div className="flex h-screen items-center justify-center text-sm text-slate-500">{error || t('Opening IMKAN Sheet…', 'جارٍ فتح IMKAN Sheet…')}</div>;

  const selectedRange = () => { const a = parseKey(anchor)!, b = parseKey(selected)!; const out: string[] = []; for (let r = Math.min(a.row,b.row); r <= Math.max(a.row,b.row); r++) for (let c = Math.min(a.col,b.col); c <= Math.max(a.col,b.col); c++) out.push(cellKey(r,c)); return out; };
  const bounds = (() => { const a = parseKey(anchor)!, b = parseKey(selected)!; return { start: cellKey(Math.min(a.row,b.row),Math.min(a.col,b.col)), end: cellKey(Math.max(a.row,b.row),Math.max(a.col,b.col)) }; })();
  const display = formulaDisplay(cell, sheet, doc);
  const selectedCell = sheet.cells[selected];
  const isSelected = (key: string) => selectedRange().includes(key);
  const formatCell = (key: string): React.CSSProperties => { const f = sheet.cells[key]?.format ?? {}; return { fontWeight: f.bold ? 700 : 400, fontStyle: f.italic ? 'italic' : 'normal', color: f.color, background: f.background, textAlign: f.align === 'end' ? 'right' : f.align === 'center' ? 'center' : 'left', borderWidth: f.border ? 2 : 1 }; };
  const colNameFor = (n: number) => { let s=''; for (let x=n+1; x>0; x=Math.floor((x-1)/26)) s=String.fromCharCode(65+(x-1)%26)+s; return s; };
  const validate = (key: string, value: string) => { const rule = sheet.cells[key]?.validation; if (!rule) return true; if (rule.type === 'list') return (rule.values ?? []).includes(value); if (rule.type === 'number') { const n=Number(value); return Number.isFinite(n) && (rule.min===undefined||n>=rule.min) && (rule.max===undefined||n<=rule.max); } return true; };
  const finish = () => { const v=input.trim(), p=parseKey(selected)!; if (!validate(selected,v)) { setError(t('Value rejected by data validation','القيمة مرفوضة بواسطة التحقق من البيانات')); return; } setError(''); commit(updateCell(doc,p.row,p.col,v.startsWith('=')?null:v,v.startsWith('=')?v:undefined),true); setEditing(false); };
  const begin = (key: string) => { setSelected(key); setAnchor(key); setEditing(true); const c=sheet.cells[key]; setInput(c?.formula ?? (c?.value==null?'':String(c.value))); };
  const copy = async () => { const data=selectedRange().map(k=>sheet.cells[k]?.formula??(sheet.cells[k]?.value??'')).join('\t'); await navigator.clipboard?.writeText(data); };
  const paste = async () => { const txt=await navigator.clipboard?.readText(); if(!txt) return; const p=parseKey(selected)!; let w=cloneWorkbook(doc); txt.split(/\r?\n/).forEach((row,ri)=>row.split('\t').forEach((v,ci)=>{w=updateCell(w,p.row+ri,p.col+ci,v,v.trim().startsWith('=')?v.trim():undefined);})); commit(w,true); };
  const fillDown = () => { const a=parseKey(anchor)!,b=parseKey(selected)!; const minR=Math.min(a.row,b.row),maxR=Math.max(a.row,b.row),col=a.col; if(minR===maxR)return; const source=sheet.cells[cellKey(minR,col)]; if(!source)return; let w=cloneWorkbook(doc); for(let r=minR+1;r<=maxR;r++) w=updateCell(w,r,col,source.formula??String(source.value??''),source.formula); commit(w); };
  const keyDown = (e: React.KeyboardEvent) => { if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo();return;} if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo();return;} if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='c'){e.preventDefault();copy();return;} if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='v'){e.preventDefault();paste();return;} if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='d'){e.preventDefault();fillDown();return;} if(e.key==='Enter'){e.preventDefault(); editing?finish():setEditing(true);return;} if(e.key==='Escape'){setEditing(false);return;} if(!editing){const p=parseKey(selected)!;let r=p.row,c=p.col;if(e.key==='ArrowDown')r++;if(e.key==='ArrowUp')r--;if(e.key==='ArrowRight')c++;if(e.key==='ArrowLeft')c--;if(['ArrowDown','ArrowUp','ArrowRight','ArrowLeft'].includes(e.key)){e.preventDefault();if(r>=0&&c>=0)setSelected(cellKey(r,c));}} };
  const addNewNamedRange = () => { const name=window.prompt(t('Named range name','اسم النطاق المسمى'),'SalesData'); if(!name)return; commit(addNamedRange(doc,name,`${bounds.start}:${bounds.end}`,sheet.id),true); };
  const addNewTable = () => { const name=window.prompt(t('Table name','اسم الجدول'),'Table1'); if(!name)return; commit(addTable(doc,bounds.start,bounds.end,name,true),true); };
  const addNewPivot = () => { const name=window.prompt(t('Pivot name','اسم Pivot'),'Pivot1'); if(!name)return; const rowField=window.prompt(t('Row field/header','حقل الصف/اسم العمود'),''); const valueField=window.prompt(t('Value field/header','حقل القيمة/اسم العمود'),''); const agg=(window.prompt(t('Aggregation: sum, count, average','التجميع: sum, count, average'),'sum')||'sum') as 'sum'|'count'|'average'; if(!['sum','count','average'].includes(agg))return; commit(addPivotTable(doc,`${bounds.start}:${bounds.end}`,name,rowField||undefined,valueField||undefined,agg),true); };
  const addNewChart = () => { const type=(window.prompt(t('Chart type: column, bar, line, area, pie, doughnut','نوع الرسم: column, bar, line, area, pie, doughnut'),'column')||'column') as ChartType; if(!['column','bar','line','area','pie','doughnut'].includes(type)) return; const title=window.prompt(t('Chart title','عنوان الرسم'),'Chart')||'Chart'; commit(addChart(doc,type,bounds.start,bounds.end,title),true); };

  return <div dir={ar?'rtl':'ltr'} className="flex h-screen flex-col bg-slate-100 text-slate-800">
    <header className="flex h-14 items-center justify-between border-b bg-white px-4"><div className="flex items-center gap-3"><button onClick={()=>router.back()} className="rounded px-3 py-2 text-xs hover:bg-slate-100">← {t('Back','رجوع')}</button><div><div className="text-sm font-semibold">{doc.title}</div><div className="text-[10px] text-slate-400">{saving?t('Saving…','جارٍ الحفظ…'):saved?t('Saved','تم الحفظ'):t('Unsaved changes','تغييرات غير محفوظة')} · Revision {revision}</div></div></div><div className="flex gap-1"><button className="rounded border px-2 py-1 text-xs disabled:opacity-40" disabled={!history.length} onClick={undo}>↶</button><button className="rounded border px-2 py-1 text-xs disabled:opacity-40" disabled={!future.length} onClick={redo}>↷</button><OfficeTransferControls fileId={fileId} type="SHEET" ar={ar}/><button onClick={()=>persist(ref.current!)} className="rounded bg-[var(--wd-primary)] px-3 py-2 text-xs font-medium text-white">{t('Save','حفظ')}</button></div></header>
    <nav className="flex h-10 items-center gap-6 border-b bg-white px-5 text-xs text-slate-600"><b className="text-slate-900">File</b><span>Edit</span><span>View</span><span>Insert</span><span>Format</span><span>Data</span></nav>
    <OfficeRibbon type="SHEET" ar={ar} saved={saved} saving={saving} actions={{undo,redo,bold:()=>commit(patchFormat(doc,selected,{bold:!selectedCell?.format?.bold})),italic:()=>commit(patchFormat(doc,selected,{italic:!selectedCell?.format?.italic})),format:()=>setEditing(true),'filldown':fillDown,chart:addNewChart,table:addNewTable,pivot:addNewPivot,sheet:()=>commit(addSheet(doc),true),sort:()=>commit(sortSheet(doc,selected.replace(/\d+$/,''),'asc'),true),filter:()=>{const col=selected.replace(/\d+$/,'');const q=window.prompt(t('Filter value (empty clears)','قيمة التصفية (فارغة للإلغاء)'),sheet.filters?.[col]??'');commit(q?setFilter(doc,col,q):clearFilter(doc,col),true)},validation:()=>{},'namedrange':addNewNamedRange,freeze:()=>commit(freeze(doc,1,1),true),fullscreen:()=>document.documentElement.requestFullscreen?.(),save:()=>persist(ref.current!)}} />
    <OfficeTemplateFields templateId={templateId} ar={ar} onInsert={insertTemplateField} />
    <SheetToolbar cell={selectedCell} onBold={()=>commit(patchFormat(doc,selected,{bold:!selectedCell?.format?.bold}))} onItalic={()=>commit(patchFormat(doc,selected,{italic:!selectedCell?.format?.italic}))} onColor={v=>commit(patchFormat(doc,selected,{color:v}))} onBg={v=>commit(patchFormat(doc,selected,{background:v}))} onAlign={v=>commit(patchFormat(doc,selected,{align:v}))} onFormat={v=>commit(patchFormat(doc,selected,{numberFormat:v}))} onSort={()=>commit(sortSheet(doc,selected.replace(/\d+$/,''),'asc'),true)} onFilter={()=>{const col=selected.replace(/\d+$/,'');const q=window.prompt(t('Filter value (empty clears)','قيمة التصفية (فارغة للإلغاء)'),sheet.filters?.[col]??'');commit(q?setFilter(doc,col,q):clearFilter(doc,col),true);}} onValidation={()=>{const raw=window.prompt(t('Validation list values separated by commas, or empty to remove','قيم القائمة مفصولة بفواصل، أو فارغ للحذف'),(selectedCell?.validation?.values??[]).join(','));commit(raw?setValidation(doc,selected,{type:'list',values:raw.split(',').map(x=>x.trim()).filter(Boolean).slice(0,50)}):setValidation(doc,selected,undefined),true);}} onMerge={()=>commit(mergeRange(doc,bounds.start,bounds.end),true)} onNamedRange={addNewNamedRange} onTable={addNewTable} onPivot={addNewPivot} onUnmerge={()=>commit(unmergeRange(doc,bounds.start,bounds.end),true)} onAddSheet={()=>commit(addSheet(doc),true)} onDeleteSheet={()=>commit(deleteActiveSheet(doc),true)} onRename={()=>{const n=window.prompt(t('Sheet name','اسم الورقة'),sheet.name);if(n)commit(renameSheet(doc,n),true);}} onFreeze={()=>commit(freeze(doc,1,1),true)} onChart={addNewChart}/>
    <div className="flex h-9 items-center gap-2 border-b bg-white px-3 text-xs"><div className="w-16 rounded border bg-slate-50 px-2 py-1 font-mono">{selected}</div><div className="flex-1 rounded border px-3 py-1 text-slate-500">{editing?<input autoFocus className="w-full outline-none" value={input} onChange={e=>setInput(e.target.value)} onBlur={finish} onKeyDown={e=>e.key==='Enter'&&finish()}/>:display}</div><button className="rounded border px-2 py-1" onClick={fillDown}>Fill ↓</button></div>
    <div className="flex-1 overflow-auto bg-white" onKeyDown={keyDown} tabIndex={0}><div className="min-w-max"><div className="sticky top-0 z-20 flex"><div className="sticky left-0 z-30 h-8 w-12 shrink-0 border bg-slate-50"/><div className="flex">{Array.from({length:COLS},(_,c)=>{const col=colNameFor(c);return <div key={c} onDoubleClick={()=>{const n=window.prompt(t('Column width','عرض العمود'),String(sheet.columnWidths?.[col]??112));if(n)commit(setColumnWidth(doc,col,Number(n)),true);}} style={{width:sheet.columnWidths?.[col]??112}} className="flex h-8 items-center justify-center border bg-slate-50 text-[11px] font-medium text-slate-500">{col}</div>;})}</div></div>
      {Array.from({length:ROWS},(_,r)=><div className="flex" key={r}><div onDoubleClick={()=>{const n=window.prompt(t('Row height','ارتفاع الصف'),String(sheet.rowHeights?.[r]??28));if(n)commit(setRowHeight(doc,r,Number(n)),true);}} style={{height:sheet.rowHeights?.[r]??28}} className="sticky left-0 z-10 flex w-12 shrink-0 items-center justify-center border bg-slate-50 text-[10px] text-slate-500">{r+1}</div>{Array.from({length:COLS},(_,c)=>{const key=cellKey(r,c),filtered=sheet.filters?.[colNameFor(c)]&&sheet.cells[key]?.value!=null&&!String(sheet.cells[key]?.value).toLowerCase().includes(String(sheet.filters?.[colNameFor(c)]).toLowerCase());return <div key={key} onClick={e=>{if(e.shiftKey)setSelected(key);else{setAnchor(key);setSelected(key);}}} onDoubleClick={()=>begin(key)} style={{...formatCell(key),width:sheet.columnWidths?.[colNameFor(c)]??112,height:sheet.rowHeights?.[r]??28,opacity:filtered?0.35:1}} className={`overflow-hidden border px-1 text-xs leading-7 ${isSelected(key)?'outline outline-2 outline-[var(--wd-primary)] outline-offset-[-2px]':''}`}>{formulaDisplay(sheet.cells[key],sheet,doc)}</div>;})}</div>)}
    </div></div>
    <div className="border-t bg-slate-50 p-3"><div className="mb-2 flex items-center justify-between"><div className="text-xs font-semibold text-slate-700">{t('Charts','الرسوم البيانية')}</div><div className="text-[10px] text-slate-400">{t('Native visualization engine','محرك رسوم أصلي')}</div></div><div className="flex flex-wrap gap-3">{(sheet.charts??[]).map(chart=><ChartCard key={chart.id} chart={chart} sheet={sheet} workbook={doc} onChange={patch=>commit(updateChart(doc,chart.id,patch),true)} onDelete={()=>commit(deleteChart(doc,chart.id),true)} ar={ar}/>)}</div>{!(sheet.charts?.length)&&<div className="rounded border border-dashed bg-white p-4 text-xs text-slate-400">{t('Select a range and choose Chart to create a visualization.','حدد نطاقًا ثم اختر Chart لإنشاء رسم بياني.')}</div>}</div>
    <div className="flex h-9 items-center gap-1 overflow-x-auto border-t bg-white px-2">{doc.sheets.map(s=><button key={s.id} onClick={()=>commit(setActiveSheet(doc,s.id))} className={`rounded-t px-4 py-1.5 text-xs ${s.id===doc.activeSheet?'border border-b-0 bg-white font-semibold':'text-slate-500 hover:bg-slate-50'}`}>{s.name}</button>)}<button onClick={()=>commit(addSheet(doc),true)} className="px-2 text-lg text-slate-500">＋</button></div>
    {error&&<div className="border-t bg-amber-50 px-4 py-1 text-xs text-amber-800">{error}</div>}
  </div>;
}

function ChartCard({chart,sheet,workbook,onChange,onDelete,ar}:{chart:SheetChart;sheet:Sheet;workbook:Workbook;onChange:(p:Partial<SheetChart>)=>void;onDelete:()=>void;ar:boolean}) {
  const data=rangeValues(sheet,chart.rangeStart,chart.rangeEnd,workbook); const w=chart.width,h=chart.height; const vals=data.series; const max=Math.max(1,...vals.flat().map(Math.abs)); const colors=['#2563eb','#16a34a','#f59e0b','#9333ea','#dc2626','#0891b2']; const labels=data.labels.slice(0,12); const count=labels.length;
  const svg=()=>{ if(chart.type==='pie'||chart.type==='doughnut'){ const v=(vals[0]??[]).slice(0,count),total=Math.max(1,v.reduce((a,b)=>a+Math.max(0,b),0)); let angle=-Math.PI/2; const cx=w/2,cy=h/2,r=Math.min(w,h)*.28; return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={chart.title}>{v.map((value,i)=>{const start=angle,end=angle+(Math.max(0,value)/total)*Math.PI*2;angle=end;const x1=cx+r*Math.cos(start),y1=cy+r*Math.sin(start),x2=cx+r*Math.cos(end),y2=cy+r*Math.sin(end),large=end-start>Math.PI,inner=r*.52;const d=chart.type==='doughnut'?`M ${x1} ${y1} A ${r} ${r} 0 ${large?1:0} 1 ${x2} ${y2} L ${cx+inner*Math.cos(end)} ${cy+inner*Math.sin(end)} A ${inner} ${inner} 0 ${large?1:0} 0 ${cx+inner*Math.cos(start)} ${cy+inner*Math.sin(start)} Z`:`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large?1:0} 1 ${x2} ${y2} Z`;return <path key={i} d={d} fill={colors[i%colors.length]} stroke="white" strokeWidth="1"/>;})}</svg>; } const pad=38,gw=w-pad*2,gh=h-70,step=count>1?gw/(count-1):gw; return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={chart.title}><line x1={pad} y1={gh} x2={w-pad} y2={gh} stroke="#94a3b8"/><line x1={pad} y1="20" x2={pad} y2={gh} stroke="#94a3b8"/>{vals.slice(0,6).map((series,si)=>{const points=series.slice(0,count).map((v,i)=>[pad+i*step,gh-(Math.max(0,v)/max)*(gh-25)] as [number,number]);if(chart.type==='line'||chart.type==='area'){const path=points.map((p,i)=>(i?'L':'M')+` ${p[0]} ${p[1]}`).join(' ');const last=points[points.length-1]??[pad,gh];return <g key={si}>{chart.type==='area'&&<path d={`${path} L ${last[0]} ${gh} L ${pad} ${gh} Z`} fill={colors[si%colors.length]} opacity=".15"/>}<path d={path} fill="none" stroke={colors[si%colors.length]} strokeWidth="2"/>{points.map((p,i)=><circle key={i} cx={p[0]} cy={p[1]} r="3" fill={colors[si%colors.length]}/>)}</g>;}return <g key={si}>{points.map((p,i)=><rect key={i} x={p[0]-Math.max(2,step/(vals.length+1))*(vals.length-si)/2} y={p[1]} width={Math.max(4,step/(vals.length+1)-3)} height={gh-p[1]} fill={colors[si%colors.length]}/>)}</g>;})}<g>{labels.map((l,i)=><text key={i} x={pad+i*step} y={gh+18} textAnchor="middle" fontSize="9">{String(l).slice(0,14)}</text>)}</g></svg>; };
  return <div className="rounded-lg border bg-white p-2 shadow-sm" style={{width:w+16}}><div className="mb-1 flex items-center justify-between gap-2"><input className="min-w-0 flex-1 rounded border px-2 py-1 text-xs font-semibold" value={chart.title} onChange={e=>onChange({title:e.target.value})}/><select className="rounded border px-1 py-1 text-[10px]" value={chart.type} onChange={e=>onChange({type:e.target.value as ChartType})}><option value="column">Column</option><option value="bar">Bar</option><option value="line">Line</option><option value="area">Area</option><option value="pie">Pie</option><option value="doughnut">Doughnut</option></select><button className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50" onClick={onDelete}>×</button></div>{svg()}<div className="mt-1 flex gap-2 text-[10px] text-slate-400"><span>{chart.rangeStart}:{chart.rangeEnd}</span><button className="underline" onClick={()=>onChange({showLabels:!chart.showLabels})}>{ar?(chart.showLabels?'إخفاء التسميات':'إظهار التسميات'):(chart.showLabels?'Hide labels':'Show labels')}</button></div></div>;
}
