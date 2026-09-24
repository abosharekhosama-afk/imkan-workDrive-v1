'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { officeEqual } from '@/office/performance';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { closeOfficeSession, openOfficeDocument, openOfficeSession, saveOfficeDocument, touchOfficeSession, getOfficePresence, heartbeatOfficePresence, streamOfficeEvents, type OfficePresence } from '@/lib/api/office';
import { OfficePresence as OfficePresenceView } from '@/components/office-presence';
import { OfficeConflictDialog } from '@/components/office-conflict-dialog';
import { useLocale } from '@/components/locale-provider';
import { addConditionalFormat, addNamedRange, addPivotTable, addSheet, addTable, clearFilter, deleteActiveSheet, deleteColumns, deleteConditionalFormat, deleteNamedRange, deleteRows, freeze, insertColumns, insertRows, mergeRange, patchFormat, renameSheet, setActiveSheet, setColumnWidth, setFilter, setRowHeight, setValidation, shiftFormulaReferences, sortSheet, unmergeRange, updateCell, updateConditionalFormat, updateNamedRange, hideRows, hideColumns, unhideRows, unhideColumns } from '@/office/sheet/commands';
import { activeSheet, cellKey, cloneWorkbook, formulaDisplay, parseKey, type SheetCell, type Workbook } from '@/office/sheet/model';
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
import { SheetChartOverlay } from '@/office/sheet/charts/sheet-chart-overlay';
import type { SheetRibbonTab } from '@/office/sheet/sheet-ribbon';
import { OfficeShell } from '@/components/office-shell';
import { OfficeMobile } from '@/components/office-mobile';
import { OfficeTemplateFields } from '@/components/office-template-fields';
import { addChart, deleteChart, updateChart } from '@/office/sheet/charts';
import { downloadOfficeExport, exportOfficeFile } from '@/lib/api/office-conversion';
import { deletePivotTable, updateTable } from '@/office/sheet/table-pivot';
import { cacheOfficeSnapshot, readOfficeSnapshot, queueDocumentChange, offlineQueueCount, installOfflineSync, clearOfflineConflict, readOfflineConflict, prepareOfflineConflict, rebaseOfflineQueue, discardOfflineQueue } from '@/office/offline';
import { extractRangeData, type RangeCellData, type PasteMode } from '@/office/sheet/clipboard/paste-special-logic';
import { findTableAtCell } from '@/office/sheet/tables/table-logic';
import { findPivotAtCell, refreshPivotToSheet } from '@/office/sheet/pivot/pivot-render-logic';
import { applyTextToColumns, deleteTableById, pasteSpecialWorkbook, removeDuplicates, setCellNote, sortTableWorkbook, updatePivot } from '@/office/sheet/data/sheet-data-commands';
import {
  duplicateColumnsForSheet,
  hiddenTableRowsForSheet,
  textOverwriteCountForSheet,
  textSplitPreviewForSheet,
} from '@/office/sheet/sheet-page-derived-logic';
import { SheetWorkspacePanels, type SheetDialogState } from '@/office/sheet/panels/sheet-workspace-panels';

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
  const [dialogs, setDialogs] = useState<SheetDialogState>({
    createTable: false,
    createPivot: false,
    pasteSpecial: false,
    removeDuplicates: false,
    textToColumns: false,
    cellNote: false,
    chartPanel: false,
    namedRange: false,
    conditionalFormat: false,
    dataValidation: false,
    renameSheet: false,
    help: false,
    selectedPivotId: null,
    selectedTableId: null,
  });
  const internalClipboard = useRef<RangeCellData[][] | null>(null);
  const setDialog = (patch: Partial<SheetDialogState>) => setDialogs((d) => ({ ...d, ...patch }));
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
  const cancelPainter = () => setPaintFormatActive(null);
  const commitAction = (w: Workbook, immediate = false, keepPainter = false) => {
    if (!keepPainter) cancelPainter();
    commit(w, immediate);
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
    if (!sheet) return;
    const table = findTableAtCell(sheet, selected);
    const pivot = findPivotAtCell(sheet, selected);
    setDialog({
      selectedTableId: table?.id ?? null,
      selectedPivotId: pivot?.id ?? null,
    });
  }, [selected, sheet?.tables, sheet?.pivotTables, sheet?.id]);

  useEffect(() => {
    document.body.classList.toggle('sheet-format-painter-active', !!paintFormatActive);
    return () => document.body.classList.remove('sheet-format-painter-active');
  }, [paintFormatActive]);

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

  const colNameFor = (n: number) => { let s=''; for (let x=n+1; x>0; x=Math.floor((x-1)/26)) s=String.fromCharCode(65+(x-1)%26)+s; return s; };
  const duplicateColumns = useMemo(() => duplicateColumnsForSheet(sheet, anchor, selected), [sheet, anchor, selected]);
  const textSplitPreview = useMemo(() => textSplitPreviewForSheet(sheet, selected), [sheet, selected]);
  const textOverwriteCount = useMemo(() => textOverwriteCountForSheet(sheet, selected), [sheet, selected, dialogs.textToColumns]);
  const tableHiddenRows = useMemo(() => hiddenTableRowsForSheet(sheet, doc), [sheet, doc]);

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
    internalClipboard.current = extractRangeData(sheet, doc, bounds.start, bounds.end);
    try {
      await navigator.clipboard?.writeText(rows.join('\n'));
    } catch {
      setError(t('Clipboard access denied. Internal copy is still available for Paste Special.', 'تم رفض الوصول إلى الحافظة. لا يزال النسخ الداخلي متاحًا للصق الخاص.'));
    }
  };
  const pasteSpecial = (mode: PasteMode) => {
    if (editing) finish();
    const matrix = internalClipboard.current;
    if (!matrix?.length) {
      setError(t('Copy a range first, then use Paste Special.', 'انسخ نطاقًا أولاً، ثم استخدم اللصق الخاص.'));
      return;
    }
    setError('');
    commit(pasteSpecialWorkbook(doc, selected, matrix, mode), true);
  };
  const paste = async () => {
    if (editing) finish();
    try {
      const txt = await navigator.clipboard?.readText();
      if (!txt) {
        if (internalClipboard.current?.length) pasteSpecial('all');
        else setError(t('Clipboard is empty. Copy cells first.', 'الحافظة فارغة. انسخ الخلايا أولاً.'));
        return;
      }
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
    } catch {
      if (internalClipboard.current?.length) pasteSpecial('all');
      else setError(t('Clipboard permission denied. Use Copy then Paste Special.', 'تم رفض إذن الحافظة. استخدم نسخ ثم لصق خاص.'));
    }
  };
  const cut = async () => { if (editing) finish(); await copy(); commit(clearRange(doc, bounds.start, bounds.end), true); };
  const clearSelected = () => commit(clearRange(doc,bounds.start,bounds.end),true);
  const openCellNote = () => setDialog({ cellNote: true });
  const saveCellNote = (note: string) => {
    commit(setCellNote(doc, selected, note.trim() || undefined), true);
    setDialog({ cellNote: false });
  };
  const toggleColumnFilter = () => {
    const col = selected.replace(/\d+$/, '');
    const value = String(selectedCell?.value ?? formulaDisplay(selectedCell, sheet, doc) ?? '').trim();
    if (!value) {
      commit(clearFilter(doc, col), true);
      return;
    }
    commit(sheet.filters?.[col] === value ? clearFilter(doc, col) : setFilter(doc, col, value), true);
  };
  const insertFunction = (name: string) => { begin(selected, `=${name}(`); window.setTimeout(() => document.querySelector<HTMLInputElement>('[aria-label="Formula bar"]')?.focus(), 0); };
  const applyFontFamily = (family:string) => { setFontFamily(family); commitAction(patchRangeFormat(doc,bounds.start,bounds.end,{fontFamily:family} as any),true); };
  const applyFontSize = (size:number) => { setFontSize(size); commitAction(patchRangeFormat(doc,bounds.start,bounds.end,{fontSize:size} as any),true); };
  const applyNumberFormat = (format: NumberFormat) => { setNumberFormat(format); commitAction(patchRangeFormat(doc, bounds.start, bounds.end, { numberFormat: format }), true); };
  const applyVerticalAlign = (align: 'top' | 'middle' | 'bottom') => { setVerticalAlign(align); commitAction(patchRangeFormat(doc, bounds.start, bounds.end, { verticalAlign: align }), true); };
  const applyWrap = (next: boolean) => { setWrap(next); commitAction(patchRangeFormat(doc, bounds.start, bounds.end, { wrap: next }), true); };
  const startFormatPainter = () => {
    if (paintFormatActive) { cancelPainter(); return; }
    if (selectedCell?.format) setPaintFormatActive({ ...selectedCell.format });
    else setError(t('Select a formatted cell first.', 'حدد خلية منسّقة أولاً.'));
  };
  const applyPaintedFormat = (nextAnchor: string, nextFocus: string) => {
    if (!paintFormatActive) return;
    const target = rangeBounds(nextAnchor, nextFocus);
    commit(patchRangeFormat(doc, target.start, target.end, paintFormatActive), true);
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
    if (e.key === 'Escape') {
      e.preventDefault();
      if (paintFormatActive) { setPaintFormatActive(null); return; }
      if (selectedChartId) { setSelectedChartId(null); setDialog({ chartPanel: false }); return; }
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      if (selectedChartId) {
        commit(deleteChart(doc, selectedChartId), true);
        setSelectedChartId(null);
        setDialog({ chartPanel: false });
        return;
      }
      clearSelected();
      return;
    }
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
  const addNewNamedRange = () => setDialog({ namedRange: true });
  const addConditional = () => setDialog({ conditionalFormat: true });
  const openDataValidation = () => setDialog({ dataValidation: true });
  const openRenameSheet = () => setDialog({ renameSheet: true });
  const openHelp = () => setDialog({ help: true });

  return <div id="office-main" dir={ar?'rtl':'ltr'} className="flex h-dvh flex-col overflow-hidden bg-slate-100 text-slate-800">
    <OfficeShell type="SHEET" fileId={fileId} title={doc.title} revision={revision} saved={saved} saving={saving} ar={ar} presence={<OfficePresenceView items={presence} ar={ar}/>}/>
    <ZohoSheetChrome title={doc.title} selected={selected} formulaValue={input} display={display} editing={editing} saved={saved} saving={saving} gridlines={gridlines} canUndo={!!history.length} canRedo={!!future.length} fontFamily={fontFamily} fontSize={fontSize} numberFormat={numberFormat} verticalAlign={verticalAlign} wrap={wrap} paintActive={!!paintFormatActive} cellFormat={selectedCell?.format} ribbonTab={sheetTab} onRibbonTabChange={setSheetTab} onFindReplace={openFind} onAutoSum={autoSum} onSortAsc={sortAsc} onSortDesc={sortDesc} onDecimalIncrease={() => adjustDecimals(1)} onDecimalDecrease={() => adjustDecimals(-1)} onUnmerge={() => commit(unmergeRange(doc, bounds.start, bounds.end), true)} onFillDown={fillDown} onChartType={addChartOfType} onFreezeTopRow={() => commit(freeze(doc, 1, 0), true)} onFreezeFirstColumn={() => commit(freeze(doc, 0, 1), true)} onAutoFitColumn={() => { const p = parseKey(selected)!; onAutoFitColumn(p.col); }} onFontFamily={applyFontFamily} onFontSize={applyFontSize} onNumberFormat={applyNumberFormat} onVerticalAlign={applyVerticalAlign} onWrap={applyWrap} onFormulaChange={setInput} onFormulaCommit={(move)=>{if(move==='cancel'){cancelEdit();return;}if(editing)finish(move);else begin(selected);}} onBeginEdit={()=>begin(selected)} onUndo={undo} onRedo={redo} onSave={saveNow} onPrint={()=>window.print()} onExport={exportXlsx} onFind={() => openFind('find')} onCopy={()=>void copy()} onCut={()=>void cut()} onPaste={()=>void paste()} onPasteSpecial={()=>setDialog({ pasteSpecial: true })} onClear={clearSelected} onPaint={paintFormat} onBorder={addBorder} onBold={()=>commit(patchRangeFormat(doc,bounds.start,bounds.end,{bold:!selectedCell?.format?.bold}))} onItalic={()=>commit(patchRangeFormat(doc,bounds.start,bounds.end,{italic:!selectedCell?.format?.italic}))} onUnderline={()=>commit(patchRangeFormat(doc,bounds.start,bounds.end,{underline:!selectedCell?.format?.underline}))} onStrike={()=>commit(patchRangeFormat(doc,bounds.start,bounds.end,{strike:!selectedCell?.format?.strike}))} onColor={v=>commit(patchRangeFormat(doc,bounds.start,bounds.end,{color:v}))} onBg={v=>commit(patchRangeFormat(doc,bounds.start,bounds.end,{background:v}))} onAlign={v=>commit(patchRangeFormat(doc,bounds.start,bounds.end,{align:v}))} onMerge={()=>commit(mergeRange(doc,bounds.start,bounds.end),true)} onSort={()=>sortAsc()} onFilter={toggleColumnFilter} onValidation={openDataValidation} onConditional={addConditional} onNamedRange={addNewNamedRange} onTable={()=>setDialog({ createTable: true })} onPivot={()=>setDialog({ createPivot: true })} onChart={()=>addChartOfType('column')} onAddSheet={()=>commit(addSheet(doc),true)} onDeleteSheet={()=>commit(deleteActiveSheet(doc),true)} onRename={openRenameSheet} onFreeze={()=>commit(toggleFreeze(doc,1,1),true)} onGridlines={()=>setGridlines(v=>!v)} onInsertRows={()=>{const p=parseKey(selected)!;commit(insertRows(doc,p.row,1),true)}} onDeleteRows={()=>{const p=parseKey(selected)!;commit(deleteRows(doc,p.row,1),true)}} onInsertColumns={()=>{const p=parseKey(selected)!;commit(insertColumns(doc,p.col,1),true)}} onDeleteColumns={()=>{const p=parseKey(selected)!;commit(deleteColumns(doc,p.col,1),true)}} onHideRow={()=>{const p=parseKey(selected)!;commit(hideRows(doc,p.row,p.row),true)}} onHideColumn={()=>{const p=parseKey(selected)!;commit(hideColumns(doc,colNameFor(parseKey(selected)!.col)),true)}} onUnhideRows={()=>commit(unhideRows(doc),true)} onUnhideColumns={()=>commit(unhideColumns(doc),true)} onAddComment={openCellNote} onRemoveDuplicates={()=>setDialog({ removeDuplicates: true })} onTextToColumns={()=>setDialog({ textToColumns: true })} onCellNote={openCellNote} onHelp={openHelp} onInsertFunction={insertFunction}/>
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
          onSelect={(nextAnchor, nextFocus) => {
            applyPaintedFormat(nextAnchor, nextFocus);
            setSelectedChartId(null);
            const pivot = findPivotAtCell(sheet, nextFocus);
            setDialog({
              chartPanel: false,
              selectedPivotId: pivot?.id ?? null,
            });
            setAnchor(nextAnchor);
            setSelected(nextFocus);
            gridFocusRef.current?.focus();
          }}
          onBeginEdit={begin}
          onEditValueChange={setInput}
          onCommitEdit={finish}
          onCancelEdit={cancelEdit}
          onContextMenu={(key, x, y) => setContextMenu({ x, y, key })}
          onColumnWidthChange={onColumnWidthChange}
          onRowHeightChange={onRowHeightChange}
          onAutoFitColumn={onAutoFitColumn}
          formatCell={formatCell}
          hiddenTableRows={tableHiddenRows}
          chartOverlay={(
            <SheetChartOverlay
              sheet={sheet}
              workbook={doc}
              charts={sheet.charts ?? []}
              selectedChartId={selectedChartId}
              maxRow={ROWS - 1}
              maxCol={COLS - 1}
              onSelectChart={(id) => { setSelectedChartId(id); if (id) setDialog({ chartPanel: true }); }}
              onCommitLayout={(id, patch) => commit(updateChart(doc, id, patch), true)}
              onDeleteChart={(id) => { commit(deleteChart(doc, id), true); if (selectedChartId === id) { setSelectedChartId(null); setDialog({ chartPanel: false }); } }}
              onEditChart={(id) => { setSelectedChartId(id); setDialog({ chartPanel: true }); }}
            />
          )}
        />
      </div>
      <div className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-t bg-white px-2">{doc.sheets.map(s=><button key={s.id} onClick={()=>commit(setActiveSheet(doc,s.id))} className={`rounded-t px-4 py-1.5 text-xs ${s.id===doc.activeSheet?'border border-b-0 bg-white font-semibold':'text-slate-500 hover:bg-slate-50'}`}>{s.name}</button>)}<button onClick={()=>commit(addSheet(doc),true)} className="px-2 text-lg text-slate-500">＋</button></div>
    </div>
    {contextMenu ? (
      <OfficeContextMenu open x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)}>
        {contextItem(t('Cut','قص'), () => void cut(), 'Ctrl+X')}
        {contextItem(t('Copy','نسخ'), () => void copy(), 'Ctrl+C')}
        {contextItem(t('Paste','لصق'), () => void paste(), 'Ctrl+V')}
        {contextItem(t('Paste Values','لصق القيم'), () => pasteSpecial('values'))}
        {contextItem(t('Paste Formulas','لصق الصيغ'), () => pasteSpecial('formulas'))}
        {contextItem(t('Paste Formats','لصق التنسيق'), () => pasteSpecial('formats'))}
        {contextItem(t('Paste Special…','لصق خاص…'), () => setDialog({ pasteSpecial: true }))}
        {contextItem(t('Clear','مسح'), clearSelected)}
        <div className="my-1 h-px bg-[#e8eaed]" />
        {contextItem(t('Merge','دمج'), () => commit(mergeRange(doc, bounds.start, bounds.end), true))}
        {contextItem(t('Unmerge','إلغاء الدمج'), () => commit(unmergeRange(doc, bounds.start, bounds.end), true))}
        {contextItem(t('Sort A→Z','ترتيب تصاعدي'), sortAsc)}
        {contextItem(t('Sort Z→A','ترتيب تنازلي'), sortDesc)}
        {contextItem(t('Filter','تصفية'), toggleColumnFilter)}
        {contextItem(t('Cell Note…','ملاحظة…'), openCellNote)}
        <div className="my-1 h-px bg-[#e8eaed]" />
        {contextItem(t('Insert Row','إدراج صف'), () => { const p = parseKey(contextMenu.key)!; commit(insertRows(doc, p.row, 1), true); })}
        {contextItem(t('Delete Row','حذف صف'), () => { const p = parseKey(contextMenu.key)!; commit(deleteRows(doc, p.row, 1), true); })}
        {contextItem(t('Insert Column','إدراج عمود'), () => { const p = parseKey(contextMenu.key)!; commit(insertColumns(doc, p.col, 1), true); })}
        {contextItem(t('Delete Column','حذف عمود'), () => { const p = parseKey(contextMenu.key)!; commit(deleteColumns(doc, p.col, 1), true); })}
      </OfficeContextMenu>
    ) : null}
    <SheetWorkspacePanels
      doc={doc}
      sheet={sheet}
      selected={selected}
      rangeStart={bounds.start}
      rangeEnd={bounds.end}
      selectedChartId={selectedChartId}
      dialogs={dialogs}
      textPreview={textSplitPreview}
      textOverwriteCount={textOverwriteCount}
      duplicateColumns={duplicateColumns}
      noteText={selectedCell?.note ?? ''}
      namedRanges={doc.namedRanges ?? []}
      conditionalRules={sheet.conditionalFormats ?? []}
      validationRule={selectedCell?.validation}
      sheetName={sheet.name}
      sheetNames={doc.sheets.map((s) => s.name)}
      ar={ar}
      onCloseDialog={setDialog}
      onCreateTable={({ range, name, hasHeader, style }) => {
        const parts = range.split(':');
        let w = addTable(doc, parts[0], parts[1] ?? parts[0], name, hasHeader);
        const created = activeSheet(w)?.tables?.find((tbl) => tbl.name.toLowerCase() === name.trim().replace(/\s+/g, '_').toLowerCase());
        if (created && style) w = updateTable(w, created.id, { style });
        commit(w, true);
        if (created) setDialog({ selectedTableId: created.id });
      }}
      onCreatePivot={(input) => {
        let w = addPivotTable(
          doc,
          input.sourceRange,
          input.name,
          input.rowField,
          input.valueField,
          input.aggregation ?? 'sum',
          input.destinationRange,
        );
        const created = activeSheet(w)?.pivotTables?.at(-1);
        if (created) {
          w = refreshPivotToSheet(w, created.id);
          commit(w, true);
          setDialog({ selectedPivotId: created.id });
        } else {
          commit(w, true);
        }
      }}
      onPasteSpecial={(mode) => pasteSpecial(mode)}
      onRemoveDuplicates={({ range, columnIndexes, hasHeader }) => {
        const parts = range.split(':');
        const { workbook: next, removed } = removeDuplicates(doc, parts[0], parts[1] ?? parts[0], columnIndexes, hasHeader);
        commit(next, true);
        setError(t(`Removed ${removed} duplicate row(s).`, `تمت إزالة ${removed} صف(وف) مكرر.`));
        return removed;
      }}
      onTextToColumns={({ delimiter, custom }) => {
        if (textOverwriteCount > 0) {
          setError(t('Text to Columns would overwrite existing data. Clear destination cells first.', 'سيؤدي تقسيم النص إلى أعمدة إلى الكتابة فوق بيانات موجودة. امسح الخلايا الهدف أولاً.'));
          return;
        }
        commit(applyTextToColumns(doc, selected, delimiter, custom), true);
        setDialog({ textToColumns: false });
      }}
      onSaveNote={saveCellNote}
      onChartChange={(patch) => { if (selectedChartId) commit(updateChart(doc, selectedChartId, patch), true); }}
      onTableChange={(id, patch) => commit(updateTable(doc, id, patch), true)}
      onTableSort={(id, direction, colOffset) => commit(sortTableWorkbook(doc, id, colOffset, direction), true)}
      onTableFilter={(id, column, values) => {
        const table = sheet.tables?.find((tbl) => tbl.id === id);
        if (!table) return;
        const nextFilter = { ...(table.filter ?? {}) };
        if (values === null) delete nextFilter[column];
        else nextFilter[column] = values.join('\u0001');
        commit(updateTable(doc, id, { filter: Object.keys(nextFilter).length ? nextFilter : undefined }), true);
      }}
      onTableDelete={(id) => { commit(deleteTableById(doc, id), true); setDialog({ selectedTableId: null }); }}
      onPivotChange={(id, patch) => {
        let w = updatePivot(doc, id, patch);
        w = refreshPivotToSheet(w, id);
        commit(w, true);
      }}
      onPivotRefresh={(id) => commit(refreshPivotToSheet(doc, id), true)}
      onPivotDelete={(id) => { commit(deletePivotTable(doc, id), true); setDialog({ selectedPivotId: null }); }}
      onNamedRangeCreate={({ name, reference }) => {
        commit(addNamedRange(doc, name, reference, sheet.id), true);
        setDialog({ namedRange: false });
      }}
      onNamedRangeUpdate={(oldName, { name, reference }) => {
        commit(updateNamedRange(doc, oldName, name, reference, sheet.id), true);
      }}
      onNamedRangeDelete={(name) => commit(deleteNamedRange(doc, name), true)}
      onConditionalAdd={(input) => {
        commit(
          addConditionalFormat(doc, input.range, input.type, input.operator, input.value, input.format),
          true,
        );
        setDialog({ conditionalFormat: false });
      }}
      onConditionalUpdate={(id, patch) => commit(updateConditionalFormat(doc, id, patch), true)}
      onConditionalDelete={(id) => commit(deleteConditionalFormat(doc, id), true)}
      onValidationApply={(values) => {
        commit(
          values === null
            ? setValidation(doc, selected, undefined)
            : setValidation(doc, selected, { type: 'list', values }),
          true,
        );
        setDialog({ dataValidation: false });
      }}
      onRenameSheet={(name) => {
        commit(renameSheet(doc, name), true);
        setDialog({ renameSheet: false });
      }}
    />
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
