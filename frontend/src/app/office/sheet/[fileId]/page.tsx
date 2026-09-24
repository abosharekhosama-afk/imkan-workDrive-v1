'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { officeEqual } from '@/office/performance';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { closeOfficeSession, openOfficeDocument, openOfficeSession, saveOfficeDocument, touchOfficeSession, getOfficePresence, heartbeatOfficePresence, streamOfficeEvents, type OfficePresence } from '@/lib/api/office';
import { OfficePresence as OfficePresenceView } from '@/components/office-presence';
import { OfficeConflictDialog } from '@/components/office-conflict-dialog';
import { useLocale } from '@/components/locale-provider';
import { addConditionalFormat, addNamedRange, addPivotTable, addSheet, addTable, clearFilter, deleteActiveSheet, deleteColumns, deleteRows, freeze, insertColumns, insertRows, mergeRange, patchFormat, renameSheet, setActiveSheet, setColumnWidth, setFilter, setRowHeight, setValidation, shiftFormulaReferences, sortSheet, unmergeRange, updateCell, hideRows, hideColumns, unhideRows, unhideColumns } from '@/office/sheet/commands';
import { activeSheet, cellKey, cloneWorkbook, formulaDisplay, parseKey, type Sheet, type SheetCell, type Workbook } from '@/office/sheet/model';
import { clearRange, patchRangeFormat, toggleFreeze } from '@/office/sheet/phase2-commands';
import { decodeClipboard, parseClipboardValue } from '@/office/sheet/clipboard';
import { autoFitColumnWidth } from '@/office/sheet/dimension-logic';
import { SheetGrid } from '@/office/sheet/sheet-grid';
import type { CellFormat, NumberFormat } from '@/office/sheet/model';
import { isPrintableInputKey, moveAfterEnter, moveAfterTab, moveCell, rangeBounds } from '@/office/sheet/selection-logic';
import { OfficeContextMenu, OfficeFindReplace } from '@/office/shared/floating';
import { ZohoSheetChrome } from '@/components/zoho-sheet-chrome';
import { findNextCell, findPreviousCell, replaceCellText, sheetCellKeys, autoSumRange, type FindScope } from '@/office/sheet/find-replace-logic';
import { navigateSelection } from '@/office/sheet/navigation-logic';
import { SheetChartOverlay } from '@/office/sheet/sheet-chart-overlay';
import type { SheetRibbonTab } from '@/office/sheet/sheet-ribbon';
import { addFileComment } from '@/lib/api/comments';
import { OfficeShell } from '@/components/office-shell';
import { OfficeMobile } from '@/components/office-mobile';
import { OfficeTemplateFields } from '@/components/office-template-fields';
import { addChart, deleteChart, exportChartPng, exportChartSvg, updateChart } from '@/office/sheet/charts';
import { downloadOfficeExport, exportOfficeFile } from '@/lib/api/office-conversion';
import { buildPivot, deletePivotTable, updateTable } from '@/office/sheet/table-pivot';
import { cacheOfficeSnapshot, readOfficeSnapshot, queueDocumentChange, offlineQueueCount, installOfflineSync, clearOfflineConflict, readOfflineConflict, prepareOfflineConflict, rebaseOfflineQueue, discardOfflineQueue } from '@/office/offline';
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
  const [sheetTab, setSheetTab] = useState<SheetRibbonTab>('home');
  const [findOpen, setFindOpen] = useState(false);
  const [findMode, setFindMode] = useState<'find' | 'replace'>('find');
  const [selectedChartId, setSelectedChartId] = useState<string | null>(null);
  const [fontFamily, setFontFamily] = useState('Roboto');
  const [fontSize, setFontSize] = useState(10);
  const [numberFormat, setNumberFormat] = useState<NumberFormat>('general');
  const [verticalAlign, setVerticalAlign] = useState<'top' | 'middle' | 'bottom'>('middle');
  const [wrap, setWrap] = useState(false);
  const [paintFormatActive, setPaintFormatActive] = useState<CellFormat | null>(null);
  const [gridlines, setGridlines] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [input, setInput] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; key: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(true);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<Workbook[]>([]);
  const [future, setFuture] = useState<Workbook[]>([]);
  const [presence, setPresence] = useState<OfficePresence[]>([]);
  const [remoteRevision, setRemoteRevision] = useState<number | null>(null);
  const [conflict, setConflict] = useState<any>(() => readOfflineConflict(fileId));
  const session = useRef<string | null>(null);
  const ref = useRef<Workbook | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gridFocusRef = useRef<HTMLDivElement>(null);
  const t = (en: string, arText: string) => ar ? arText : en;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await openOfficeSession(fileId);
        if (!alive) return;
        session.current = r.sessionId;
        const w = r.document.content as Workbook;
        const safe: Workbook = w?.type === 'SHEET' ? w : { schema: 7, type: 'SHEET', title: 'Untitled spreadsheet', activeSheet: 'sheet-1', sheets: [{ id: 'sheet-1', name: 'Sheet1', cells: {} }] };
        ref.current = safe; setDoc(safe); setRevision(r.document.revision); cacheOfficeSnapshot(fileId,'SHEET',r.document.revision,safe);
      } catch (e: any) {
        const cached = readOfficeSnapshot(fileId);
        if (cached?.document?.type === 'SHEET') { const local = cached.document as Workbook; ref.current=local; setDoc(local); setRevision(cached.revision); setSaved(offlineQueueCount(fileId)===0); setError('Offline mode: using the latest local copy.'); }
        else setError(e?.message || 'Failed to open sheet');
      }
    })();
    return () => { alive = false; if (timer.current) clearTimeout(timer.current); if (session.current) closeOfficeSession(session.current).catch(() => {}); };
  }, [fileId]);

  useEffect(() => installOfflineSync(fileId,()=>session.current||undefined,{onOnline:()=>{setError(''); void import('@/office/collaboration-v2').then(({flushOfficeQueue})=>flushOfficeQueue(fileId,session.current||undefined,r=>setRevision(r),async e=>{if(e?.status===409){const c=await prepareOfflineConflict(fileId,'SHEET',e?.code||'OFFICE_OPERATION_CONFLICT');setConflict(c);setError(t('Sync conflict: choose how to reconcile your work.','تعارض في المزامنة: اختر طريقة المصالحة.'));}else setError(t('Sync failed; retrying when connection returns.','فشلت المزامنة؛ ستتم إعادة المحاولة عند عودة الاتصال.'));})).catch(()=>{})},onOffline:()=>setError(t('Offline. Changes will sync automatically.','أنت غير متصل. ستتم مزامنة التغييرات تلقائيًا.'))}),[fileId]);

  useEffect(() => {
    if (!session.current) return;
    const i = setInterval(() => touchOfficeSession(session.current!).catch(() => {}), 30000);
    return () => clearInterval(i);
  }, [doc]);

  useEffect(() => { if (!session.current) return; const beat=()=>heartbeatOfficePresence(session.current!,{status:document.hidden?'IDLE':'ACTIVE',cursor:{sheetId:doc?.activeSheet,cell:selected},selection:{sheetId:doc?.activeSheet,start:anchor,end:selected}}).catch(()=>{}); beat(); const timer=setInterval(beat,2500); const vis=()=>beat(); document.addEventListener('visibilitychange',vis); return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',vis)}; }, [doc?.activeSheet,selected,anchor]);
  useEffect(() => { if (!fileId || !session.current) return; let dead=false; const refresh=()=>getOfficePresence(fileId).then(x=>{if(!dead)setPresence(x)}).catch(()=>{}); refresh(); const timer=setInterval(refresh,4000); const controller=new AbortController(); streamOfficeEvents(fileId,e=>{ if(e.type==='document-saved' && e.sessionId!==session.current && e.revision){ setRemoteRevision(e.revision); if(saved && !saving){ openOfficeDocument(fileId).then(r=>{ if(dead)return; const w=r.content as Workbook; if(w?.type==='SHEET'){ref.current=w;setDoc(w);setRevision(r.revision);setRemoteRevision(null);setSaved(true);} }).catch(()=>{}); } } },controller.signal).catch(()=>{}); return()=>{dead=true;clearInterval(timer);controller.abort()}; }, [fileId, saved, saving]);

  const persist = async (w: Workbook) => {
    if (!doc) return;
    setSaving(true); setSaved(false);
    const op = queueDocumentChange(fileId,'SHEET',revision,doc,w);
    cacheOfficeSnapshot(fileId,'SHEET',revision,w);
    if (!op) { setSaving(false); setSaved(offlineQueueCount(fileId)===0); return; }
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) { setError(t('Offline. Changes are stored locally and will sync when you reconnect.','أنت غير متصل. تم حفظ التغييرات محليًا وستتم مزامنتها عند عودة الاتصال.')); setSaving(false); return; }
      const { flushOfficeQueue } = await import('@/office/collaboration-v2');
      await flushOfficeQueue(fileId,session.current||undefined,r=>{setRevision(r);cacheOfficeSnapshot(fileId,'SHEET',r,w);},e=>{if(e?.status===409){void prepareOfflineConflict(fileId,'SHEET',e?.code||'OFFICE_OPERATION_CONFLICT').then(setConflict);setError(t('Sync conflict: choose how to reconcile your work.','تعارض في المزامنة: اختر طريقة المصالحة.'));}else setError(t('Sync failed; local work is preserved.','فشلت المزامنة؛ تم الاحتفاظ بعملك محليًا.'));});
      setSaved(offlineQueueCount(fileId)===0);
    } finally { setSaving(false); }
  };
  const commit = (w: Workbook, immediate = false) => {
    if (!doc || officeEqual(w, doc)) return;
    setHistory(h => [...h.slice(-49), cloneWorkbook(doc)]); setFuture([]); ref.current = w; setDoc(w); setSaved(false); cacheOfficeSnapshot(fileId,'SHEET',revision,w);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => persist(w), immediate ? 20 : 700);
  };
  const saveNow = async () => {
    if (timer.current) clearTimeout(timer.current);
    if (ref.current) await persist(ref.current);
    try {
      const { flushOfficeQueue } = await import('@/office/collaboration-v2');
      await flushOfficeQueue(fileId, session.current || undefined, r => setRevision(r));
      setSaved(offlineQueueCount(fileId) === 0);
    } catch (e: any) {
      setError(e?.message || t('Save failed', 'فشل الحفظ'));
    }
  };

  const exportXlsx = async () => {
    try {
      const result = await exportOfficeFile(fileId, 'xlsx');
      downloadOfficeExport(result);
    } catch (e: any) {
      setError(e?.message || t('Export failed', 'فشل التصدير'));
    }
  };

  const openFind = (mode: 'find' | 'replace') => { setFindMode(mode); setFindOpen(true); };

  const handleFindNext = (query: string, scope: FindScope, caseSensitive: boolean) => {
    const w = ref.current;
    const s = w ? activeSheet(w) : undefined;
    if (!w || !s) return;
    const hit = findNextCell(s, w, query, selected, ROWS, COLS, scope, caseSensitive);
    if (hit) { setAnchor(hit); setSelected(hit); setError(''); }
    else setError(t(`"${query}" was not found in this sheet.`, `لم يتم العثور على "${query}" في هذه الورقة.`));
  };

  const handleFindPrevious = (query: string, scope: FindScope, caseSensitive: boolean) => {
    const w = ref.current;
    const s = w ? activeSheet(w) : undefined;
    if (!w || !s) return;
    const hit = findPreviousCell(s, w, query, selected, ROWS, COLS, scope, caseSensitive);
    if (hit) { setAnchor(hit); setSelected(hit); setError(''); }
    else setError(t(`"${query}" was not found in this sheet.`, `لم يتم العثور على "${query}" في هذه الورقة.`));
  };

  const handleReplace = (find: string, replace: string, scope: FindScope, caseSensitive: boolean) => {
    const w = ref.current;
    const s = w ? activeSheet(w) : undefined;
    if (!w || !s) return;
    const next = replaceCellText(s, w, selected, find, replace, scope, caseSensitive);
    if (!next) { handleFindNext(find, scope, caseSensitive); return; }
    const p = parseKey(selected)!;
    commit(updateCell(w, p.row, p.col, next.formula ? '' : next.value, next.formula), true);
    handleFindNext(find, scope, caseSensitive);
  };

  const handleReplaceAll = (find: string, replace: string, scope: FindScope, caseSensitive: boolean) => {
    if (!doc) return;
    let w = cloneWorkbook(doc);
    for (const key of sheetCellKeys(ROWS, COLS)) {
      const active = activeSheet(w)!;
      const next = replaceCellText(active, w, key, find, replace, scope, caseSensitive);
      if (!next) continue;
      const p = parseKey(key)!;
      w = updateCell(w, p.row, p.col, next.formula ? '' : next.value, next.formula);
    }
    commit(w, true);
  };

  const insertTemplateField = (placeholder: string) => {
    if (!doc || !sheet) return;
    const current = sheet.cells[selected];
    const p=parseKey(selected)!; commit(updateCell(doc,p.row,p.col,placeholder),true);
  };
  const undo = () => { if (!doc || !history.length) return; const prev = history[history.length - 1]; setFuture(f => [cloneWorkbook(doc), ...f.slice(0, 49)]); setHistory(h => h.slice(0, -1)); ref.current = prev; setDoc(prev); setSaved(false); };
  const redo = () => { if (!doc || !future.length) return; const next = future[0]; setHistory(h => [...h, cloneWorkbook(doc)]); setFuture(f => f.slice(1)); ref.current = next; setDoc(next); setSaved(false); };

  const sheet = useMemo(() => doc ? activeSheet(doc) : undefined, [doc]);
  const cell = sheet?.cells[selected];
  useEffect(() => {
    if (editing) return;
    setInput(cell?.formula ?? (cell?.value == null ? '' : String(cell.value)));
    const f = cell?.format;
    if (f?.fontFamily) setFontFamily(f.fontFamily);
    if (f?.fontSize) setFontSize(f.fontSize);
    if (f?.numberFormat) setNumberFormat(f.numberFormat);
    if (f?.verticalAlign) setVerticalAlign(f.verticalAlign);
    if (f?.wrap != null) setWrap(!!f.wrap);
  }, [selected, doc, editing, cell?.formula, cell?.value, cell?.format]);
  const resolveConflict = async (choice:'local'|'remote') => {
    if(choice==='remote' && conflict?.remote){ discardOfflineQueue(fileId); setDoc(conflict.remote as Workbook); ref.current=conflict.remote as Workbook; setRevision(conflict.remoteRevision); cacheOfficeSnapshot(fileId,'SHEET',conflict.remoteRevision,conflict.remote); setSaved(true); setConflict(null); setError(''); return; }
    const result=await rebaseOfflineQueue(fileId); if(result.ok){ setDoc(result.document as Workbook); ref.current=result.document as Workbook; setRevision(result.revision); setConflict(null); setError(t('Local work was rebased onto the latest remote revision.','تمت إعادة بناء عملك المحلي فوق أحدث إصدار بعيد.')); const {flushOfficeQueue}=await import('@/office/collaboration-v2'); await flushOfficeQueue(fileId,session.current||undefined,r=>setRevision(r),async e=>{if(e?.status===409)setConflict(await prepareOfflineConflict(fileId,'SHEET',e?.code||'OFFICE_OPERATION_CONFLICT'));}); setSaved(offlineQueueCount(fileId)===0); } else setError(t('These changes overlap the remote edit. Keep the conflict open and reconcile manually.','هذه التغييرات تتداخل مع التعديل البعيد. أبقِ التعارض مفتوحًا وقم بالمصالحة يدويًا.'));
  };
  if (!doc || !sheet) return <div className="flex h-screen items-center justify-center text-sm text-slate-500">{error || t('Opening IMKAN Sheet…', 'جارٍ فتح IMKAN Sheet…')}</div>;

  const bounds = rangeBounds(anchor, selected);
  const display = formulaDisplay(cell, sheet, doc);
  const selectedCell = sheet.cells[selected];
  const autoSum = () => begin(selected, autoSumRange(bounds.start, bounds.end));
  const sortAsc = () => commit(sortSheet(doc, selected.replace(/\d+$/, ''), 'asc'), true);
  const sortDesc = () => commit(sortSheet(doc, selected.replace(/\d+$/, ''), 'desc'), true);
  const adjustDecimals = (delta: number) => {
    const base = selectedCell?.format?.decimals ?? 2;
    commit(patchRangeFormat(doc, bounds.start, bounds.end, { decimals: Math.max(0, Math.min(10, base + delta)) }), true);
  };
  const addChartOfType = (type: 'column' | 'bar' | 'line' | 'pie' | 'area' | 'scatter') => {
    commit(addChart(doc, type, bounds.start, bounds.end, `${type.charAt(0).toUpperCase()}${type.slice(1)} Chart`), true);
  };
  const formatCell = (key: string): React.CSSProperties => {
    const f = sheet.cells[key]?.format ?? {};
    let conditional: Partial<CellFormat> = {};
    const value = sheet.cells[key]?.value;
    for (const rule of sheet.conditionalFormats ?? []) {
      const parts = rule.range.split(':');
      const a = parseKey(parts[0]), b = parseKey(parts[1] ?? parts[0]), k = parseKey(key);
      if (!a || !b || !k || k.row < Math.min(a.row, b.row) || k.row > Math.max(a.row, b.row) || k.col < Math.min(a.col, b.col) || k.col > Math.max(a.col, b.col)) continue;
      const left = String(value ?? '');
      const right = Number(rule.value);
      const lv = Number(value);
      const hit = rule.type === 'containsText' ? left.toLowerCase().includes(rule.value.toLowerCase()) : rule.operator === '>' ? lv > right : rule.operator === '>=' ? lv >= right : rule.operator === '<' ? lv < right : rule.operator === '<=' ? lv <= right : rule.operator === '!=' ? left !== rule.value : left === rule.value;
      if (hit) conditional = rule.format;
    }
    return {
      fontFamily: f.fontFamily,
      fontSize: f.fontSize ? `${f.fontSize}px` : undefined,
      fontWeight: f.bold ? 700 : 400,
      fontStyle: f.italic ? 'italic' : 'normal',
      color: conditional.color ?? f.color,
      background: conditional.background ?? f.background,
      textAlign: f.align === 'end' ? 'right' : f.align === 'center' ? 'center' : 'left',
      verticalAlign: f.verticalAlign === 'top' ? 'top' : f.verticalAlign === 'bottom' ? 'bottom' : 'middle',
      whiteSpace: f.wrap ? 'normal' : 'nowrap',
      textDecoration: `${f.underline ? 'underline' : ''}${f.strike ? `${f.underline ? ' ' : ''}line-through` : ''}` || 'none',
      borderWidth: f.border ? 2 : 1,
      borderColor: f.borderColor,
      borderStyle: f.border ? 'solid' : undefined,
    };
  };
  const colNameFor = (n: number) => { let s=''; for (let x=n+1; x>0; x=Math.floor((x-1)/26)) s=String.fromCharCode(65+(x-1)%26)+s; return s; };
  const validate = (key: string, value: string) => { const rule = sheet.cells[key]?.validation; if (!rule) return true; if (rule.type === 'list') return (rule.values ?? []).includes(value); if (rule.type === 'number') { const n=Number(value); return Number.isFinite(n) && (rule.min===undefined||n>=rule.min) && (rule.max===undefined||n<=rule.max); } if (rule.type === 'text') { const len=value.length; return (rule.min===undefined||len>=rule.min) && (rule.max===undefined||len<=rule.max); } return true; };
  const validationMessage = (key: string, value: string) => { const rule = sheet.cells[key]?.validation; if (!rule) return ''; if (rule.type === 'list') return t(`Allowed values: ${(rule.values ?? []).join(', ')}`, `القيم المسموحة: ${(rule.values ?? []).join('، ')}`); if (rule.type === 'number') return t(`Enter a number${rule.min!==undefined?` from ${rule.min}`:''}${rule.max!==undefined?` to ${rule.max}`:''}.`, `أدخل رقمًا${rule.min!==undefined?` من ${rule.min}`:''}${rule.max!==undefined?` إلى ${rule.max}`:''}.`); if (rule.type === 'text') return t(`Text length must be${rule.min!==undefined?` at least ${rule.min}`:''}${rule.max!==undefined?` and at most ${rule.max}`:''} characters.`, `يجب أن يكون طول النص${rule.min!==undefined?` ${rule.min} أحرف على الأقل`:''}${rule.max!==undefined?` و${rule.max} حرفًا كحد أقصى`:''}.`); return ''; };
  const assertValid = (key:string,value:string) => { if(validate(key,value)) return true; setError(validationMessage(key,value) || t('Value rejected by data validation','القيمة مرفوضة بواسطة التحقق من البيانات')); return false; };
  const finish = (move?: 'enter' | 'tab' | 'shift-tab') => {
    const key = editingKey ?? selected;
    const parsed = parseKey(key);
    if (!parsed) return;
    const value = input.trim();
    if (!assertValid(key, value)) return;
    setError('');
    commit(updateCell(doc, parsed.row, parsed.col, value.startsWith('=') ? '' : value, value.startsWith('=') ? value : undefined), true);
    setEditing(false);
    setEditingKey(null);
    if (move === 'enter') {
      const next = moveAfterEnter(key);
      setAnchor(next);
      setSelected(next);
    } else if (move === 'tab' || move === 'shift-tab') {
      const next = moveAfterTab(key, move === 'shift-tab');
      setAnchor(next);
      setSelected(next);
    }
    gridFocusRef.current?.focus();
  };
  const cancelEdit = () => {
    setInput(editDraft);
    setEditing(false);
    setEditingKey(null);
    gridFocusRef.current?.focus();
  };
  const begin = (key: string, initialValue?: string) => {
    const current = sheet.cells[key];
    const value = initialValue ?? (current?.formula ?? (current?.value == null ? '' : String(current.value)));
    setAnchor(key);
    setSelected(key);
    setEditingKey(key);
    setEditing(true);
    setEditDraft(value);
    setInput(value);
  };
  const copy = async () => {
    const a = parseKey(anchor)!, b = parseKey(selected)!;
    const rows: string[] = [];
    for (let r = Math.min(a.row, b.row); r <= Math.max(a.row, b.row); r++) {
      const cols: string[] = [];
      for (let c = Math.min(a.col, b.col); c <= Math.max(a.col, b.col); c++) {
        const key = cellKey(r, c);
        if (editing && editingKey === key) cols.push(input);
        else {
          const cellData = sheet.cells[key];
          cols.push(cellData?.formula ?? (cellData?.value == null ? '' : String(cellData.value)));
        }
      }
      rows.push(cols.join('\t'));
    }
    await navigator.clipboard?.writeText(rows.join('\n'));
  };
  const paste = async () => {
    if (editing) finish();
    const txt = await navigator.clipboard?.readText();
    if (!txt) return;
    const matrix = decodeClipboard(txt);
    const p = parseKey(selected)!;
    for (let ri = 0; ri < matrix.length; ri++) {
      for (let ci = 0; ci < matrix[ri].length; ci++) {
        const target = cellKey(p.row + ri, p.col + ci);
        const parsed = parseClipboardValue(matrix[ri][ci]);
        const probe = parsed.formula ?? parsed.value;
        if (!assertValid(target, probe)) return;
      }
    }
    let w = cloneWorkbook(doc);
    matrix.forEach((row, ri) => row.forEach((raw, ci) => {
      const parsed = parseClipboardValue(raw);
      w = updateCell(w, p.row + ri, p.col + ci, parsed.formula ? '' : parsed.value, parsed.formula);
    }));
    setError('');
    commit(w, true);
  };
  const cut = async () => { if (editing) finish(); await copy(); commit(clearRange(doc, bounds.start, bounds.end), true); };
  const clearSelected = () => commit(clearRange(doc,bounds.start,bounds.end),true);
  const addComment = async () => { const body = window.prompt(t('Comment','تعليق'), `${selected}: `); if (!body?.trim()) return; try { await addFileComment(fileId, body.trim()); setError(''); } catch (e:any) { setError(e?.message || t('Unable to add comment','تعذر إضافة التعليق')); } };
  const insertFunction = (name: string) => { begin(selected, `=${name}(`); window.setTimeout(() => document.querySelector<HTMLInputElement>('[aria-label="Formula bar"]')?.focus(), 0); };
  const applyFontFamily = (family:string) => { setFontFamily(family); commit(patchRangeFormat(doc,bounds.start,bounds.end,{fontFamily:family} as any),true); };
  const applyFontSize = (size:number) => { setFontSize(size); commit(patchRangeFormat(doc,bounds.start,bounds.end,{fontSize:size} as any),true); };
  const applyNumberFormat = (format: NumberFormat) => { setNumberFormat(format); commit(patchRangeFormat(doc, bounds.start, bounds.end, { numberFormat: format }), true); };
  const applyVerticalAlign = (align: 'top' | 'middle' | 'bottom') => { setVerticalAlign(align); commit(patchRangeFormat(doc, bounds.start, bounds.end, { verticalAlign: align }), true); };
  const applyWrap = (next: boolean) => { setWrap(next); commit(patchRangeFormat(doc, bounds.start, bounds.end, { wrap: next }), true); };
  const startFormatPainter = () => { if (selectedCell?.format) setPaintFormatActive({ ...selectedCell.format }); };
  const applyPaintedFormat = (nextAnchor: string, nextFocus: string) => {
    if (!paintFormatActive) return;
    const target = rangeBounds(nextAnchor, nextFocus);
    commit(patchRangeFormat(doc, target.start, target.end, paintFormatActive), true);
    setPaintFormatActive(null);
  };
  const onColumnWidthChange = (col: number, width: number) => commit(setColumnWidth(doc, colNameFor(col), width), true);
  const onRowHeightChange = (row: number, height: number) => commit(setRowHeight(doc, row, height), true);
  const onAutoFitColumn = (col: number) => commit(setColumnWidth(doc, colNameFor(col), autoFitColumnWidth(sheet, col, doc, ROWS)), true);
  const paintFormat = startFormatPainter;
  const addBorder = () => commit(patchRangeFormat(doc,bounds.start,bounds.end,{border:true}),true);
  const fillDown = () => { const a=parseKey(anchor)!,b=parseKey(selected)!; const minR=Math.min(a.row,b.row),maxR=Math.max(a.row,b.row),col=a.col; if(minR===maxR)return; const source=sheet.cells[cellKey(minR,col)]; if(!source)return; let w=cloneWorkbook(doc); for(let r=minR+1;r<=maxR;r++){const formula=source.formula?shiftFormulaReferences(source.formula,r-minR,0):undefined; w=updateCell(w,r,col,formula?'':String(source.value??''),formula);} commit(w,true); };
  const gridKeyDown = (e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('[aria-label="Formula bar"]')) return;
    if (target.closest('[aria-label^="Edit "]')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); redo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') { e.preventDefault(); void copy(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') { e.preventDefault(); void cut(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') { e.preventDefault(); void paste(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); fillDown(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); openFind('find'); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'h') { e.preventDefault(); openFind('replace'); return; }
    if (e.key === 'F2') { e.preventDefault(); begin(selected); return; }
    if (editing) {
      if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); return; }
      if (e.key === 'Enter') { e.preventDefault(); finish('enter'); return; }
      if (e.key === 'Tab') { e.preventDefault(); finish(e.shiftKey ? 'shift-tab' : 'tab'); return; }
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); clearSelected(); return; }
    if (e.key === 'Home' || e.key === 'End' || e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      const action = e.key === 'Home'
        ? (e.ctrlKey || e.metaKey ? 'ctrl-home' : 'home')
        : e.key === 'End'
          ? (e.ctrlKey || e.metaKey ? 'ctrl-end' : 'end')
          : e.key === 'PageUp'
            ? 'page-up'
            : 'page-down';
      const next = navigateSelection(selected, action, ROWS - 1, COLS - 1);
      if (!e.shiftKey) setAnchor(next);
      setSelected(next);
      return;
    }
    if (isPrintableInputKey(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); begin(selected, e.key); return; }
    if (e.key === 'Enter') { e.preventDefault(); begin(selected); return; }
    const delta = e.key === 'ArrowDown' ? [1, 0] : e.key === 'ArrowUp' ? [-1, 0] : e.key === 'ArrowRight' ? [0, 1] : e.key === 'ArrowLeft' ? [0, -1] : null;
    if (delta) {
      e.preventDefault();
      const next = moveCell(selected, delta[0], delta[1], ROWS - 1, COLS - 1);
      if (!next) return;
      if (!e.shiftKey) setAnchor(next);
      setSelected(next);
    }
  };
  const contextItem = (label: string, action?: () => void, shortcut?: string, disabled = false) => (
    <button type="button" disabled={disabled || !action} onClick={() => { action?.(); setContextMenu(null); }} className="flex w-full items-center justify-between gap-4 px-3 py-2 text-left text-[13px] text-[#30343b] hover:bg-[#f3f5f7] disabled:text-[#a7a7a7]">
      <span>{label}</span>
      {shortcut ? <span className="text-[11px] text-[#8b8f94]">{shortcut}</span> : null}
    </button>
  );
  const addNewNamedRange = () => { const name=window.prompt(t('Named range name','اسم النطاق المسمى'),'SalesData'); if(!name)return; commit(addNamedRange(doc,name,`${bounds.start}:${bounds.end}`,sheet.id),true); };
  const addNewTable = () => { const name=window.prompt(t('Table name','اسم الجدول'),'Table1'); if(!name)return; commit(addTable(doc,bounds.start,bounds.end,name,true),true); };
  const deleteSelectedTable = (id:string) => commit({ ...doc, sheets: doc.sheets.map(s => s.id===doc.activeSheet ? { ...s, tables:(s.tables??[]).filter(t=>t.id!==id) } : s) }, true);
  const addNewPivot = () => { const name=window.prompt(t('Pivot name','اسم Pivot'),'Pivot1'); if(!name)return; const rowField=window.prompt(t('Row field/header','حقل الصف/اسم العمود'),''); const valueField=window.prompt(t('Value field/header','حقل القيمة/اسم العمود'),''); const agg=(window.prompt(t('Aggregation: sum, count, average','التجميع: sum, count, average'),'sum')||'sum') as 'sum'|'count'|'average'; if(!['sum','count','average'].includes(agg))return; commit(addPivotTable(doc,`${bounds.start}:${bounds.end}`,name,rowField||undefined,valueField||undefined,agg),true); };
  const addConditional = () => { const range=window.prompt(t('Range','النطاق'),`${bounds.start}:${bounds.end}`); if(!range)return; const type=(window.prompt(t('Rule type: cellIs or containsText','نوع القاعدة: cellIs أو containsText'),'cellIs')||'cellIs') as 'cellIs'|'containsText'; const operator=(window.prompt(t('Operator: >, >=, <, <=, =, !=, contains','المعامل: >، >=، <، <=، =، !=، contains'),' >'.trim())||'>') as any; const value=window.prompt(t('Compare value','قيمة المقارنة'),'0'); if(value===null)return; commit(addConditionalFormat(doc,range,type,operator,value,{background:'#FEF3C7',color:'#92400E'}),true); };
  const addNewChart = () => { const type=(window.prompt(t('Chart type: column, bar, line, area, pie, doughnut, scatter, combo','نوع الرسم: column, bar, line, area, pie, doughnut, scatter, combo'),'column')||'column') as ChartType; if(!['column','bar','line','area','pie','doughnut','scatter','combo'].includes(type)) return; const title=window.prompt(t('Chart title','عنوان الرسم'),'Chart')||'Chart'; commit(addChart(doc,type,bounds.start,bounds.end,title),true); };

  return <div id="office-main" dir={ar?'rtl':'ltr'} className="flex h-dvh flex-col overflow-hidden bg-slate-100 text-slate-800">
    <OfficeShell type="SHEET" fileId={fileId} title={doc.title} revision={revision} saved={saved} saving={saving} ar={ar} presence={<OfficePresenceView items={presence} ar={ar}/>}/>
    <ZohoSheetChrome title={doc.title} selected={selected} formulaValue={input} display={display} editing={editing} saved={saved} saving={saving} gridlines={gridlines} canUndo={!!history.length} canRedo={!!future.length} fontFamily={fontFamily} fontSize={fontSize} numberFormat={numberFormat} verticalAlign={verticalAlign} wrap={wrap} paintActive={!!paintFormatActive} cellFormat={selectedCell?.format} ribbonTab={sheetTab} onRibbonTabChange={setSheetTab} onFindReplace={openFind} onAutoSum={autoSum} onSortAsc={sortAsc} onSortDesc={sortDesc} onDecimalIncrease={() => adjustDecimals(1)} onDecimalDecrease={() => adjustDecimals(-1)} onUnmerge={() => commit(unmergeRange(doc, bounds.start, bounds.end), true)} onFillDown={fillDown} onChartType={addChartOfType} onFreezeTopRow={() => commit(freeze(doc, 1, 0), true)} onFreezeFirstColumn={() => commit(freeze(doc, 0, 1), true)} onAutoFitColumn={() => { const p = parseKey(selected)!; onAutoFitColumn(p.col); }} onFontFamily={applyFontFamily} onFontSize={applyFontSize} onNumberFormat={applyNumberFormat} onVerticalAlign={applyVerticalAlign} onWrap={applyWrap} onFormulaChange={setInput} onFormulaCommit={(move)=>{if(move==='cancel'){cancelEdit();return;}if(editing)finish(move);else begin(selected);}} onBeginEdit={()=>begin(selected)} onUndo={undo} onRedo={redo} onSave={saveNow} onPrint={()=>window.print()} onExport={exportXlsx} onFind={() => openFind('find')} onCopy={()=>void copy()} onCut={()=>void cut()} onPaste={()=>void paste()} onClear={clearSelected} onPaint={paintFormat} onBorder={addBorder} onBold={()=>commit(patchRangeFormat(doc,bounds.start,bounds.end,{bold:!selectedCell?.format?.bold}))} onItalic={()=>commit(patchRangeFormat(doc,bounds.start,bounds.end,{italic:!selectedCell?.format?.italic}))} onUnderline={()=>commit(patchRangeFormat(doc,bounds.start,bounds.end,{underline:!selectedCell?.format?.underline}))} onStrike={()=>commit(patchRangeFormat(doc,bounds.start,bounds.end,{strike:!selectedCell?.format?.strike}))} onColor={v=>commit(patchRangeFormat(doc,bounds.start,bounds.end,{color:v}))} onBg={v=>commit(patchRangeFormat(doc,bounds.start,bounds.end,{background:v}))} onAlign={v=>commit(patchRangeFormat(doc,bounds.start,bounds.end,{align:v}))} onMerge={()=>commit(mergeRange(doc,bounds.start,bounds.end),true)} onSort={()=>sortAsc()} onFilter={()=>{const col=selected.replace(/\d+$/,'');const q=window.prompt(t('Filter value (empty clears)','قيمة التصفية (فارغة للإلغاء)'),sheet.filters?.[col]??'');commit(q?setFilter(doc,col,q):clearFilter(doc,col),true);}} onValidation={()=>{const raw=window.prompt(t('Validation list values separated by commas, or empty to remove','قيم القائمة مفصولة بفواصل، أو فارغ للحذف'),(selectedCell?.validation?.values??[]).join(','));commit(raw?setValidation(doc,selected,{type:'list',values:raw.split(',').map(x=>x.trim()).filter(Boolean).slice(0,50)}):setValidation(doc,selected,undefined),true);}} onConditional={addConditional} onNamedRange={addNewNamedRange} onTable={addNewTable} onPivot={addNewPivot} onChart={addNewChart} onAddSheet={()=>commit(addSheet(doc),true)} onDeleteSheet={()=>commit(deleteActiveSheet(doc),true)} onRename={()=>{const n=window.prompt(t('Sheet name','اسم الورقة'),sheet.name);if(n)commit(renameSheet(doc,n),true);}} onFreeze={()=>commit(toggleFreeze(doc,1,1),true)} onGridlines={()=>setGridlines(v=>!v)} onInsertRows={()=>{const p=parseKey(selected)!;commit(insertRows(doc,p.row,1),true)}} onDeleteRows={()=>{const p=parseKey(selected)!;commit(deleteRows(doc,p.row,1),true)}} onInsertColumns={()=>{const p=parseKey(selected)!;commit(insertColumns(doc,p.col,1),true)}} onDeleteColumns={()=>{const p=parseKey(selected)!;commit(deleteColumns(doc,p.col,1),true)}} onHideRow={()=>{const p=parseKey(selected)!;commit(hideRows(doc,p.row,p.row),true)}} onHideColumn={()=>{const p=parseKey(selected)!;commit(hideColumns(doc,colNameFor(parseKey(selected)!.col)),true)}} onUnhideRows={()=>commit(unhideRows(doc),true)} onUnhideColumns={()=>commit(unhideColumns(doc),true)} onAddComment={()=>void addComment()} onHelp={()=>window.alert(t('IMKAN Sheet\nZoho-style spreadsheet workspace with editing, formulas, tables, pivots, charts, filters, validation, freeze panes, collaboration and XLSX export.','IMKAN Sheet\nواجهة جداول بيانات بأسلوب Zoho مع التحرير والصيغ والجداول والجداول المحورية والرسوم والمرشحات والتحقق والتجميد والتعاون وتصدير XLSX.'))} onInsertFunction={insertFunction}/>
    <OfficeTemplateFields templateId={templateId} ar={ar} onInsert={insertTemplateField} />
    <OfficeMobile type="SHEET" ar={ar} undo={undo} redo={redo} bold={()=>commit(patchFormat(doc,selected,{bold:!selectedCell?.format?.bold}))} italic={()=>commit(patchFormat(doc,selected,{italic:!selectedCell?.format?.italic}))} underline={()=>commit(patchFormat(doc,selected,{underline:!selectedCell?.format?.underline}))} selectedCell={selected} formulaValue={input} editingCell={editing} onFormulaChange={setInput} onFormulaCommit={(move)=>{if(move==='cancel'){cancelEdit();return;}if(editing)finish(move);else begin(selected);}} onBeginCellEdit={()=>begin(selected)} save={()=>persist(ref.current!)} />
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={gridFocusRef} className="relative flex min-h-0 flex-1 flex-col outline-none" tabIndex={0} onKeyDown={gridKeyDown}>
        <SheetGrid
          sheet={sheet}
          workbook={doc}
          rows={ROWS}
          cols={COLS}
          gridlines={gridlines}
          anchor={anchor}
          focus={selected}
          editing={editing}
          editingKey={editingKey}
          editValue={input}
          onSelect={(nextAnchor, nextFocus) => { applyPaintedFormat(nextAnchor, nextFocus); setAnchor(nextAnchor); setSelected(nextFocus); gridFocusRef.current?.focus(); }}
          onBeginEdit={begin}
          onEditValueChange={setInput}
          onCommitEdit={finish}
          onCancelEdit={cancelEdit}
          onContextMenu={(key, x, y) => setContextMenu({ x, y, key })}
          onColumnWidthChange={onColumnWidthChange}
          onRowHeightChange={onRowHeightChange}
          onAutoFitColumn={onAutoFitColumn}
          formatCell={formatCell}
          chartOverlay={(
            <SheetChartOverlay
              sheet={sheet}
              workbook={doc}
              charts={sheet.charts ?? []}
              selectedChartId={selectedChartId}
              onSelectChart={setSelectedChartId}
              onMoveChart={() => {}}
              onDeleteChart={(id) => commit(deleteChart(doc, id), true)}
            />
          )}
        />
      </div>
      <details className="shrink-0 border-t bg-white">
        <summary className="cursor-pointer px-4 py-2 text-xs font-semibold text-slate-700">{t('Data tools (Tables, Pivot, Charts)','أدوات البيانات (جداول، Pivot، رسوم)')}</summary>
        <div className="border-t bg-white p-3"><div className="mb-2 flex items-center justify-between"><div className="text-xs font-semibold text-slate-700">{t('Tables & Pivot Tables','الجداول والجداول المحورية')}</div><div className="text-[10px] text-slate-400">{t('Structured data tools','أدوات البيانات المنظمة')}</div></div><div className="grid gap-3 lg:grid-cols-2"><div className="rounded-lg border bg-slate-50 p-2"><div className="mb-2 text-[11px] font-semibold">{t('Tables','الجداول')}</div>{(sheet.tables??[]).map(table=><div key={table.id} className="mb-2 rounded border bg-white p-2"><div className="flex items-center gap-2"><input className="min-w-0 flex-1 rounded border px-2 py-1 text-xs font-semibold" value={table.name} onChange={e=>commit(updateTable(doc,table.id,{name:e.target.value.replace(/\s+/g,'_').slice(0,80)}),true)}/><select className="rounded border px-1 py-1 text-[10px]" value={table.style??'banded'} onChange={e=>commit(updateTable(doc,table.id,{style:e.target.value as any}),true)}><option value="banded">Banded</option><option value="plain">Plain</option><option value="minimal">Minimal</option></select><label className="text-[10px]"><input type="checkbox" checked={!!table.totalRow} onChange={e=>commit(updateTable(doc,table.id,{totalRow:e.target.checked}),true)}/> Total</label><button className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50" onClick={()=>deleteSelectedTable(table.id)}>×</button></div><div className="text-[10px] text-slate-400">{table.start}:{table.end}</div></div>)}{!(sheet.tables?.length)&&<div className="rounded border border-dashed bg-white p-3 text-[10px] text-slate-400">{t('Select a range and choose Table.','حدد نطاقًا ثم اختر Table.')}</div>}</div><div className="rounded-lg border bg-slate-50 p-2"><div className="mb-2 text-[11px] font-semibold">{t('Pivot Tables','الجداول المحورية')}</div>{(sheet.pivotTables??[]).map(pivot=>{const result=buildPivot(sheet,pivot,doc);return <div key={pivot.id} className="mb-2 rounded border bg-white p-2"><div className="mb-2 flex items-center gap-2"><span className="min-w-0 flex-1 text-xs font-semibold">{pivot.name}</span><span className="text-[10px] text-slate-400">{pivot.aggregation}</span><button className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50" onClick={()=>commit(deletePivotTable(doc,pivot.id),true)}>×</button></div><div className="overflow-auto"><table className="min-w-full border-collapse text-[10px]"><thead><tr>{result.headers.map(h=><th key={h} className="border bg-slate-100 px-2 py-1 text-left">{h}</th>)}</tr></thead><tbody>{result.rows.map((r,i)=><tr key={i}>{r.map((v,j)=><td key={j} className="border px-2 py-1">{typeof v==='number'?Number(v.toFixed(4)):v}</td>)}</tr>)}<tr className="font-semibold"><td className="border px-2 py-1">Grand Total</td><td className="border px-2 py-1">{Number(result.grandTotal.toFixed(4))}</td></tr></tbody></table></div></div>})}{!(sheet.pivotTables?.length)&&<div className="rounded border border-dashed bg-white p-3 text-[10px] text-slate-400">{t('Select a range and choose Pivot.','حدد نطاقًا ثم اختر Pivot.')}</div>}</div></div></div>
        <div className="border-t bg-slate-50 p-3"><div className="mb-2 flex items-center justify-between"><div className="text-xs font-semibold text-slate-700">{t('Charts','الرسوم البيانية')}</div><div className="text-[10px] text-slate-400">{t('Native visualization engine','محرك رسوم أصلي')}</div></div><div className="flex flex-wrap gap-3">{(sheet.charts??[]).map(chart=><ChartCard key={chart.id} chart={chart} sheet={sheet} workbook={doc} onChange={patch=>commit(updateChart(doc,chart.id,patch),true)} onDelete={()=>commit(deleteChart(doc,chart.id),true)} ar={ar}/>)}</div>{!(sheet.charts?.length)&&<div className="rounded border border-dashed bg-white p-4 text-xs text-slate-400">{t('Select a range and choose Chart to create a visualization.','حدد نطاقًا ثم اختر Chart لإنشاء رسم بياني.')}</div>}</div>
      </details>
      <div className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-t bg-white px-2">{doc.sheets.map(s=><button key={s.id} onClick={()=>commit(setActiveSheet(doc,s.id))} className={`rounded-t px-4 py-1.5 text-xs ${s.id===doc.activeSheet?'border border-b-0 bg-white font-semibold':'text-slate-500 hover:bg-slate-50'}`}>{s.name}</button>)}<button onClick={()=>commit(addSheet(doc),true)} className="px-2 text-lg text-slate-500">＋</button></div>
    </div>
    {contextMenu ? (
      <OfficeContextMenu open x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)}>
        {contextItem(t('Cut','قص'), () => void cut(), 'Ctrl+X')}
        {contextItem(t('Copy','نسخ'), () => void copy(), 'Ctrl+C')}
        {contextItem(t('Paste','لصق'), () => void paste(), 'Ctrl+V')}
        {contextItem(t('Clear','مسح'), clearSelected)}
        <div className="my-1 h-px bg-[#e8eaed]" />
        {contextItem(t('Merge','دمج'), () => commit(mergeRange(doc, bounds.start, bounds.end), true))}
        {contextItem(t('Unmerge','إلغاء الدمج'), () => commit(unmergeRange(doc, bounds.start, bounds.end), true))}
        {contextItem(t('Sort A→Z','ترتيب تصاعدي'), sortAsc)}
        {contextItem(t('Sort Z→A','ترتيب تنازلي'), sortDesc)}
        {contextItem(t('Filter…','تصفية…'), () => { const col = selected.replace(/\d+$/, ''); const q = window.prompt(t('Filter value (empty clears)', 'قيمة التصفية (فارغة للإلغاء)'), sheet.filters?.[col] ?? ''); commit(q ? setFilter(doc, col, q) : clearFilter(doc, col), true); })}
        <div className="my-1 h-px bg-[#e8eaed]" />
        {contextItem(t('Insert Row','إدراج صف'), () => { const p = parseKey(contextMenu.key)!; commit(insertRows(doc, p.row, 1), true); })}
        {contextItem(t('Delete Row','حذف صف'), () => { const p = parseKey(contextMenu.key)!; commit(deleteRows(doc, p.row, 1), true); })}
        {contextItem(t('Insert Column','إدراج عمود'), () => { const p = parseKey(contextMenu.key)!; commit(insertColumns(doc, p.col, 1), true); })}
        {contextItem(t('Delete Column','حذف عمود'), () => { const p = parseKey(contextMenu.key)!; commit(deleteColumns(doc, p.col, 1), true); })}
      </OfficeContextMenu>
    ) : null}
    <OfficeFindReplace
      open={findOpen}
      mode={findMode}
      onClose={() => setFindOpen(false)}
      onFindNext={handleFindNext}
      onFindPrevious={handleFindPrevious}
      onReplace={handleReplace}
      onReplaceAll={handleReplaceAll}
    />
    {error&&<div className="border-t bg-amber-50 px-4 py-1 text-xs text-amber-800">{error}</div>}
    {conflict&&<OfficeConflictDialog conflict={conflict} queuedCount={offlineQueueCount(fileId)} ar={ar} onKeepLocal={()=>void resolveConflict('local')} onUseRemote={()=>void resolveConflict('remote')} onDismiss={()=>setConflict(null)}/>}
  </div>;
}

function ChartCard({chart,sheet,workbook,onChange,onDelete,ar}:{chart:SheetChart;sheet:Sheet;workbook:Workbook;onChange:(p:Partial<SheetChart>)=>void;onDelete:()=>void;ar:boolean}) {
  const [advanced,setAdvanced]=useState(false);
  const setAxis=(axis:'xAxis'|'yAxis',key:string,value:string)=>{const n=Number(value);onChange({[axis]:{...(chart[axis]??{}),[key]:key==='title'?value:(Number.isFinite(n)?n:undefined)}} as Partial<SheetChart>)};
  const toggle=(key:'legend'|'showLabels'|'showValues'|'showMarkers')=>onChange({[key]:!chart[key]} as Partial<SheetChart>);
  return <div className="rounded-lg border bg-white p-2 shadow-sm" style={{width:chart.width+16}}>
    <div className="mb-2 flex items-center gap-2"><input className="min-w-0 flex-1 rounded border px-2 py-1 text-xs font-semibold" value={chart.title} onChange={e=>onChange({title:e.target.value})}/><select className="rounded border px-1 py-1 text-[10px]" value={chart.type} onChange={e=>onChange({type:e.target.value as ChartType})}><option value="column">Column</option><option value="bar">Bar</option><option value="line">Line</option><option value="area">Area</option><option value="pie">Pie</option><option value="doughnut">Doughnut</option><option value="scatter">Scatter</option><option value="combo">Combo</option></select><button className="rounded border px-2 py-1 text-[10px]" onClick={()=>setAdvanced(!advanced)}>{ar?'خيارات':'Options'}</button><button className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50" onClick={onDelete}>×</button></div>
    <div className="rounded border bg-slate-50 p-1"><ChartSvgPreview chart={chart} sheet={sheet} workbook={workbook}/></div>
    <div className="mt-2 flex flex-wrap gap-1 text-[10px]"><button className="rounded border px-2 py-1" onClick={()=>toggle('legend')}>{ar?(chart.legend?'إخفاء المفتاح':'إظهار المفتاح'):(chart.legend?'Hide legend':'Show legend')}</button><button className="rounded border px-2 py-1" onClick={()=>toggle('showLabels')}>{ar?'التسميات':'Labels'}</button><button className="rounded border px-2 py-1" onClick={()=>toggle('showValues')}>{ar?'القيم':'Values'}</button><button className="rounded border px-2 py-1" onClick={()=>toggle('showMarkers')}>{ar?'النقاط':'Markers'}</button><button className="rounded border px-2 py-1" onClick={()=>{const n=window.prompt(ar?'السمة':'Theme',chart.theme??'office');if(n&&['office','mono','ocean','nature','sunset'].includes(n))onChange({theme:n});}}>{ar?'السمة':'Theme'}</button><button className="rounded border px-2 py-1" onClick={()=>exportChartSvg(chart,sheet,workbook)}>{ar?'SVG':'Export SVG'}</button><button className="rounded border px-2 py-1" onClick={()=>exportChartPng(chart,sheet,workbook)}>{ar?'PNG':'Export PNG'}</button></div>
    {advanced&&<div className="mt-2 grid grid-cols-2 gap-2 rounded border bg-slate-50 p-2 text-[10px]"><label>{ar?'نمط التكديس':'Stack'}<select className="ml-1 rounded border px-1" value={chart.stackMode??'none'} onChange={e=>onChange({stackMode:e.target.value as any})}><option value="none">None</option><option value="stacked">Stacked</option><option value="percent">100% Stacked</option></select></label><label>{ar?'خط الاتجاه':'Trendline'}<input className="ml-1" type="checkbox" checked={!!chart.trendline?.enabled} onChange={e=>onChange({trendline:{...(chart.trendline??{type:'linear',seriesIndex:0}),enabled:e.target.checked,type:'linear'}})}/></label><label>{ar?'عنوان المحور X':'X axis title'}<input className="ml-1 w-24 rounded border px-1" value={chart.xAxis?.title??''} onChange={e=>setAxis('xAxis','title',e.target.value)}/></label><label>{ar?'عنوان المحور Y':'Y axis title'}<input className="ml-1 w-24 rounded border px-1" value={chart.yAxis?.title??''} onChange={e=>setAxis('yAxis','title',e.target.value)}/></label><label>{ar?'Y min':'Y min'}<input className="ml-1 w-16 rounded border px-1" value={chart.yAxis?.min??''} onChange={e=>setAxis('yAxis','min',e.target.value)}/></label><label>{ar?'Y max':'Y max'}<input className="ml-1 w-16 rounded border px-1" value={chart.yAxis?.max??''} onChange={e=>setAxis('yAxis','max',e.target.value)}/></label><label>{ar?'Y step':'Y step'}<input className="ml-1 w-16 rounded border px-1" value={chart.yAxis?.tick??''} onChange={e=>setAxis('yAxis','tick',e.target.value)}/></label><label>{ar?'نوع السلاسل في Combo':'Combo series'}<select className="ml-1 rounded border px-1" value={(chart.seriesTypes?.[0]??'column')} onChange={e=>onChange({seriesTypes:[e.target.value as any]})}><option value="column">Column</option><option value="line">Line</option><option value="bar">Bar</option></select></label></div>}
    <div className="mt-1 text-[10px] text-slate-400">{chart.rangeStart}:{chart.rangeEnd}</div>
  </div>;
}

function ChartSvgPreview({chart,sheet,workbook}:{chart:SheetChart;sheet:Sheet;workbook:Workbook}) {
  const [markup,setMarkup]=useState('');
  useEffect(()=>{import('@/office/sheet/charts').then(m=>setMarkup(m.chartSvgMarkup(chart,sheet,workbook))).catch(()=>setMarkup(''));},[chart,sheet,workbook]);
  return markup ? <div className="overflow-auto" dangerouslySetInnerHTML={{__html:markup}}/> : <div className="flex h-[330px] items-center justify-center text-xs text-slate-400">Loading chart…</div>;
}
