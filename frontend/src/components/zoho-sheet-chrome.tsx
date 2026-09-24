'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  FormulaAutocompletePopover,
  OfficeColorPicker,
  OfficeMenu,
  OfficePopover,
  officeMenuDivider,
  officeMenuItem,
  officeSubmenu,
  useFormulaAutocompleteKeyboard,
} from '@/office/shared/floating';
import {
  SHEET_FUNCTION_CATEGORIES,
  SHEET_FUNCTION_REGISTRY,
  searchSheetFunctions,
  type SheetFunctionCategory,
} from '@/office/sheet/function-registry';
import {
  applyAutocompleteInsert,
  buildAutocompleteInsert,
  formulaAutocompleteSuggestions,
} from '@/office/sheet/formula-autocomplete';
import { NUMBER_FORMAT_OPTIONS } from '@/office/sheet/format-display';
import type { NumberFormat } from '@/office/sheet/model';

type Menu = 'File' | 'Edit' | 'View' | 'Insert' | 'Format' | 'Data' | 'Review' | 'Tools' | 'Help' | null;

type Props = {
  title: string;
  selected: string;
  formulaValue: string;
  display: string;
  editing: boolean;
  saved: boolean;
  saving: boolean;
  ar?: boolean;
  gridlines: boolean;
  canUndo: boolean;
  canRedo: boolean;
  fontFamily: string;
  fontSize: number;
  numberFormat: NumberFormat;
  verticalAlign: 'top' | 'middle' | 'bottom';
  wrap: boolean;
  paintActive: boolean;
  onFontFamily: (v: string) => void;
  onFontSize: (v: number) => void;
  onNumberFormat: (v: NumberFormat) => void;
  onVerticalAlign: (v: 'top' | 'middle' | 'bottom') => void;
  onWrap: (v: boolean) => void;
  onFormulaChange: (v: string) => void;
  onFormulaCommit: (move?: 'enter' | 'tab' | 'shift-tab' | 'cancel') => void;
  onBeginEdit: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onPrint: () => void;
  onExport: () => void;
  onFind: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onClear: () => void;
  onPaint: () => void;
  onBorder: () => void;
  onBold: () => void;
  onItalic: () => void;
  onUnderline: () => void;
  onStrike: () => void;
  onColor: (v: string) => void;
  onBg: (v: string) => void;
  onAlign: (v: 'start' | 'center' | 'end') => void;
  onMerge: () => void;
  onSort: () => void;
  onFilter: () => void;
  onValidation: () => void;
  onConditional: () => void;
  onNamedRange: () => void;
  onTable: () => void;
  onPivot: () => void;
  onChart: () => void;
  onAddSheet: () => void;
  onDeleteSheet: () => void;
  onRename: () => void;
  onFreeze: () => void;
  onGridlines: () => void;
  onInsertRows: () => void;
  onDeleteRows: () => void;
  onInsertColumns: () => void;
  onDeleteColumns: () => void;
  onHideRow: () => void;
  onHideColumn: () => void;
  onUnhideRows: () => void;
  onUnhideColumns: () => void;
  onAddComment: () => void;
  onHelp: () => void;
  onInsertFunction: (fn: string) => void;
};

const fonts = ['Roboto', 'Zoho Puvi', 'Lato', 'Open Sans', 'Droid Sans', 'Droid Serif', 'Liberation Serif', 'Patrick Hand', 'Roboto Mono', 'Roboto Slab', 'Source Sans Pro', 'Ubuntu'];

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

function ToolButton({ label, title, onClick, disabled = false, active = false, children }: { label?: string; title?: string; onClick?: () => void; disabled?: boolean; active?: boolean; children: ReactNode }) {
  return (
    <button type="button" title={title || label} aria-label={title || label} disabled={disabled} onClick={onClick} className={`flex h-8 min-w-8 items-center justify-center rounded px-1.5 text-[#30343b] ${active ? 'bg-[#e7f0ff] text-[#1967d2]' : 'hover:bg-[#eef1f4]'} disabled:opacity-35`}>
      {children}
      {label ? <span className="ml-1 text-[11px]">{label}</span> : null}
    </button>
  );
}

export function ZohoSheetChrome(p: Props) {
  const [menu, setMenu] = useState<Menu>(null);
  const [fontOpen, setFontOpen] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);
  const [formatOpen, setFormatOpen] = useState(false);
  const [fnOpen, setFnOpen] = useState(false);
  const [textColorOpen, setTextColorOpen] = useState(false);
  const [fillColorOpen, setFillColorOpen] = useState(false);
  const [fnQuery, setFnQuery] = useState('');
  const [fnCategory, setFnCategory] = useState<SheetFunctionCategory | 'All'>('All');
  const [activeFn, setActiveFn] = useState('SUM');
  const [acOpen, setAcOpen] = useState(false);
  const [acIndex, setAcIndex] = useState(0);
  const menuAnchorRef = useRef<HTMLButtonElement>(null);
  const fontAnchorRef = useRef<HTMLButtonElement>(null);
  const sizeAnchorRef = useRef<HTMLButtonElement>(null);
  const formatAnchorRef = useRef<HTMLButtonElement>(null);
  const fnAnchorRef = useRef<HTMLButtonElement>(null);
  const textColorAnchorRef = useRef<HTMLButtonElement>(null);
  const fillColorAnchorRef = useRef<HTMLButtonElement>(null);
  const formulaAnchorRef = useRef<HTMLDivElement>(null);
  const formulaInputRef = useRef<HTMLInputElement>(null);

  const pick = (fn: () => void) => { fn(); setMenu(null); };
  const filteredFns = useMemo(
    () => searchSheetFunctions(fnQuery, fnCategory === 'All' ? undefined : fnCategory),
    [fnQuery, fnCategory],
  );
  const fnDetail = filteredFns.find((x) => x.name === activeFn) ?? filteredFns[0] ?? SHEET_FUNCTION_REGISTRY[0];
  const ac = formulaAutocompleteSuggestions(p.formulaValue, formulaInputRef.current?.selectionStart ?? p.formulaValue.length);
  const acHandleKey = useFormulaAutocompleteKeyboard(acOpen, ac.matches.length, acIndex, setAcIndex, () => {
    const match = ac.matches[acIndex];
    if (!match) return;
    const built = buildAutocompleteInsert(p.formulaValue, formulaInputRef.current?.selectionStart ?? p.formulaValue.length, match.name);
    p.onFormulaChange(applyAutocompleteInsert(p.formulaValue, built));
    setAcOpen(false);
  }, () => setAcOpen(false));

  const menuItems = useMemo(() => {
    if (menu === 'File') {
      return [
        officeMenuItem('file-new', 'New Spreadsheet', () => pick(p.onAddSheet)),
        officeMenuItem('file-save', 'Save', () => pick(p.onSave), 'Ctrl+S'),
        officeMenuItem('file-print', 'Print', () => pick(p.onPrint), 'Ctrl+P'),
        officeMenuItem('file-export', 'Export', () => pick(p.onExport)),
      ];
    }
    if (menu === 'Edit') {
      return [
        officeMenuItem('edit-undo', 'Undo', () => pick(p.onUndo), 'Ctrl+Z', !p.canUndo),
        officeMenuItem('edit-redo', 'Redo', () => pick(p.onRedo), 'Ctrl+Y', !p.canRedo),
        officeMenuDivider('edit-div'),
        officeMenuItem('edit-cut', 'Cut', () => pick(p.onCut), 'Ctrl+X'),
        officeMenuItem('edit-copy', 'Copy', () => pick(p.onCopy), 'Ctrl+C'),
        officeMenuItem('edit-paste', 'Paste', () => pick(p.onPaste), 'Ctrl+V'),
        officeMenuItem('edit-clear', 'Clear', () => pick(p.onClear)),
      ];
    }
    if (menu === 'View') {
      return [
        officeMenuItem('view-grid', 'Gridlines', () => pick(p.onGridlines), undefined, false),
        officeMenuItem('view-freeze', 'Freeze', () => pick(p.onFreeze)),
        officeMenuItem('view-hide-row', 'Hide Rows', () => pick(p.onHideRow)),
        officeMenuItem('view-hide-col', 'Hide Columns', () => pick(p.onHideColumn)),
        officeMenuItem('view-unhide-row', 'Unhide Rows', () => pick(p.onUnhideRows)),
        officeMenuItem('view-unhide-col', 'Unhide Columns', () => pick(p.onUnhideColumns)),
      ];
    }
    if (menu === 'Insert') {
      return [
        officeMenuItem('ins-rows', 'Rows', () => pick(p.onInsertRows)),
        officeMenuItem('ins-cols', 'Columns', () => pick(p.onInsertColumns)),
        officeMenuItem('ins-table', 'Table', () => pick(p.onTable)),
        officeMenuItem('ins-pivot', 'Pivot Table', () => pick(p.onPivot)),
        officeSubmenu('ins-chart', 'Chart', [
          officeMenuItem('chart-col', 'Column', () => pick(p.onChart)),
          officeMenuItem('chart-bar', 'Bar', () => pick(p.onChart)),
          officeMenuItem('chart-line', 'Line', () => pick(p.onChart)),
        ]),
        officeMenuItem('ins-sheet', 'New Sheet', () => pick(p.onAddSheet)),
      ];
    }
    if (menu === 'Format') {
      return [
        officeSubmenu('fmt-number', 'Number', NUMBER_FORMAT_OPTIONS.map((opt) =>
          officeMenuItem(`fmt-${opt.value}`, opt.label, () => pick(() => p.onNumberFormat(opt.value))),
        )),
        officeMenuDivider('fmt-div'),
        officeMenuItem('fmt-bold', 'Bold', () => pick(p.onBold), 'Ctrl+B'),
        officeMenuItem('fmt-italic', 'Italic', () => pick(p.onItalic), 'Ctrl+I'),
        officeMenuItem('fmt-underline', 'Underline', () => pick(p.onUnderline), 'Ctrl+U'),
        officeMenuItem('fmt-strike', 'Strikethrough', () => pick(p.onStrike)),
        officeMenuItem('fmt-conditional', 'Conditional Formatting…', () => pick(p.onConditional)),
      ];
    }
    if (menu === 'Data') {
      return [
        officeMenuItem('data-sort', 'Sort', () => pick(p.onSort)),
        officeMenuItem('data-filter', 'Filter', () => pick(p.onFilter)),
        officeMenuItem('data-validation', 'Data Validation', () => pick(p.onValidation)),
        officeMenuItem('data-named', 'Named Range', () => pick(p.onNamedRange)),
      ];
    }
    if (menu === 'Review') return [officeMenuItem('review-comment', 'Add Comment…', () => pick(p.onAddComment))];
    if (menu === 'Tools') {
      return [
        officeMenuItem('tools-find', 'Find', () => pick(p.onFind), 'Ctrl+F'),
        officeMenuItem('tools-fn', 'Functions', () => { setMenu(null); setFnOpen(true); }),
      ];
    }
    if (menu === 'Help') return [officeMenuItem('help-center', 'Help Center', () => pick(p.onHelp))];
    return [];
  }, [menu, p]);

  return (
    <div className="print:hidden shrink-0 bg-white text-[#242424]" dir="ltr">
      <div className="flex h-[52px] items-center border-b border-[#e5e5e5] bg-white">
        <button type="button" className="flex h-full w-[124px] shrink-0 items-center gap-3 bg-[#0fa85a] px-4 text-white" onClick={() => { window.location.href = '/office/new'; }}>
          <span className="grid h-7 w-7 place-items-center rounded-sm border-2 border-white text-[17px] font-semibold">▦</span>
          <span className="text-[20px] font-medium">Sheet</span>
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-3 px-4">
          <span className="truncate text-[16px] font-semibold">{p.title || 'Untitled Spreadsheet'}</span>
        </div>
        <div className="flex items-center gap-2 px-3">
          <button type="button" onClick={p.onFind} className="flex h-8 w-[205px] items-center gap-2 rounded-md bg-[#f5f6f7] px-3 text-left text-[12px] text-[#6d7278]"><span>⌕</span><span>Search in this sheet</span></button>
          <button type="button" onClick={p.onHelp} className="grid h-8 w-8 place-items-center rounded hover:bg-[#f3f5f7]">⚙</button>
        </div>
      </div>

      <div className="flex h-[34px] items-center border-b border-[#dfe2e5] px-2 text-[13px]">
        {(['File', 'Edit', 'View', 'Insert', 'Format', 'Data', 'Review', 'Tools', 'Help'] as const).map((label) => (
          <button
            key={label}
            ref={menu === label ? menuAnchorRef : undefined}
            type="button"
            onClick={(e) => { menuAnchorRef.current = e.currentTarget; setMenu(menu === label ? null : label); }}
            className={`h-full px-3 hover:bg-[#f3f5f7] ${menu === label ? 'font-medium text-[#111]' : ''}`}
          >
            {label}
          </button>
        ))}
        <OfficeMenu open={!!menu} onClose={() => setMenu(null)} anchorRef={menuAnchorRef} items={menuItems} minWidth={240} />
      </div>

      <div className="flex h-[42px] items-center gap-1 border-b border-[#d9dde1] bg-white px-2 shadow-[0_1px_2px_rgba(0,0,0,.08)]">
        <ToolButton title="Print" onClick={p.onPrint}><Svg><path d="M6 9V4h12v5M6 18H4V10h16v8h-2M7 15h10v5H7z" /></Svg></ToolButton>
        <ToolButton title="Undo" onClick={p.onUndo} disabled={!p.canUndo}><Svg><path d="M9 8 4 12l5 4M4 12h9a6 6 0 0 1 6 6" /></Svg></ToolButton>
        <ToolButton title="Redo" onClick={p.onRedo} disabled={!p.canRedo}><Svg><path d="m15 8 5 4-5 4M20 12h-9a6 6 0 0 0-6 6" /></Svg></ToolButton>
        <div className="relative">
          <button ref={fontAnchorRef} type="button" onClick={() => { setFontOpen((v) => !v); setSizeOpen(false); setFormatOpen(false); }} className="flex h-8 min-w-[124px] items-center justify-between rounded border border-[#d8dce1] bg-white px-2 text-[13px]">{p.fontFamily}<span>⌄</span></button>
          <OfficePopover open={fontOpen} onClose={() => setFontOpen(false)} anchorRef={fontAnchorRef} className="max-h-[280px] overflow-auto py-1">
            {fonts.map((f) => (
              <button key={f} type="button" onClick={() => { p.onFontFamily(f); setFontOpen(false); }} className={`block w-full px-3 py-2 text-left text-[14px] hover:bg-[#f2f4f6] ${f === p.fontFamily ? 'font-semibold' : ''}`}>{f}</button>
            ))}
          </OfficePopover>
        </div>
        <div className="relative">
          <button ref={sizeAnchorRef} type="button" onClick={() => { setSizeOpen((v) => !v); setFontOpen(false); setFormatOpen(false); }} className="flex h-8 min-w-[54px] items-center justify-between rounded border border-[#d8dce1] bg-white px-2 text-[13px]">{p.fontSize}<span>⌄</span></button>
          <OfficePopover open={sizeOpen} onClose={() => setSizeOpen(false)} anchorRef={sizeAnchorRef} className="p-1">
            <div className="grid w-[140px] grid-cols-4">
              {[8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32].map((s) => (
                <button key={s} type="button" onClick={() => { p.onFontSize(s); setSizeOpen(false); }} className="rounded px-2 py-2 text-[12px] hover:bg-[#f2f4f6]">{s}</button>
              ))}
            </div>
          </OfficePopover>
        </div>
        <ToolButton title="Bold" onClick={p.onBold}><b className="text-[16px]">B</b></ToolButton>
        <ToolButton title="Italic" onClick={p.onItalic}><i className="text-[16px]">I</i></ToolButton>
        <ToolButton title="Underline" onClick={p.onUnderline}><u className="text-[16px]">U</u></ToolButton>
        <ToolButton title="Strikethrough" onClick={p.onStrike}><s className="text-[16px]">S</s></ToolButton>
        <button ref={textColorAnchorRef} type="button" title="Text color" className="grid h-8 w-8 place-items-center rounded hover:bg-[#eef1f4]" onClick={() => setTextColorOpen(true)}><span className="text-[17px] font-bold" style={{ color: '#e21d3e' }}>A</span></button>
        <button ref={fillColorAnchorRef} type="button" title="Fill color" className="grid h-8 w-8 place-items-center rounded hover:bg-[#eef1f4]" onClick={() => setFillColorOpen(true)}><span className="h-4 w-5 border-b-2 border-[#e6c900] bg-white" /></button>
        <OfficeColorPicker open={textColorOpen} onClose={() => setTextColorOpen(false)} anchorRef={textColorAnchorRef} title="Text Color" onPick={p.onColor} />
        <OfficeColorPicker open={fillColorOpen} onClose={() => setFillColorOpen(false)} anchorRef={fillColorAnchorRef} title="Fill Color" onPick={p.onBg} />
        <div className="mx-1 h-6 w-px bg-[#e2e5e8]" />
        <ToolButton title="Format Painter" onClick={p.onPaint} active={p.paintActive}><Svg><path d="M14 3l7 7-9 9H5v-7z" /></Svg></ToolButton>
        <ToolButton title="Borders" onClick={p.onBorder}><Svg><rect x="5" y="5" width="14" height="14" /><path d="M5 10h14M10 5v14" /></Svg></ToolButton>
        <ToolButton title="Merge Cells" onClick={p.onMerge}><Svg><rect x="5" y="7" width="14" height="10" /><path d="M10 12h4" /></Svg></ToolButton>
        <select title="Alignment" aria-label="Alignment" className="h-8 rounded border border-[#d8dce1] bg-white px-2 text-[12px]" value={p.verticalAlign === 'top' ? 'start-top' : p.verticalAlign === 'bottom' ? 'start-bottom' : 'start'} onChange={(e) => {
          const v = e.target.value;
          if (v.endsWith('-top')) p.onVerticalAlign('top');
          else if (v.endsWith('-bottom')) p.onVerticalAlign('bottom');
          else { p.onAlign(v.replace('-top', '').replace('-bottom', '') as 'start' | 'center' | 'end'); p.onVerticalAlign('middle'); }
        }}>
          <option value="start">≡ Left</option>
          <option value="center">≡ Center</option>
          <option value="end">≡ Right</option>
          <option value="start-top">↖ Top</option>
          <option value="center-top">↑ Middle</option>
          <option value="end-bottom">↘ Bottom</option>
        </select>
        <ToolButton title="Wrap" onClick={() => p.onWrap(!p.wrap)} active={p.wrap}>↩</ToolButton>
        <div className="relative">
          <button ref={formatAnchorRef} type="button" onClick={() => { setFormatOpen((v) => !v); setFontOpen(false); setSizeOpen(false); }} className="flex h-8 min-w-[96px] items-center justify-between rounded border border-[#d8dce1] bg-white px-2 text-[12px]">
            {NUMBER_FORMAT_OPTIONS.find((x) => x.value === p.numberFormat)?.label ?? 'General'}<span>⌄</span>
          </button>
          <OfficePopover open={formatOpen} onClose={() => setFormatOpen(false)} anchorRef={formatAnchorRef} className="py-1">
            {NUMBER_FORMAT_OPTIONS.map((opt) => (
              <button key={opt.value} type="button" onClick={() => { p.onNumberFormat(opt.value); setFormatOpen(false); }} className={`block w-full px-3 py-2 text-left text-[13px] hover:bg-[#f2f4f6] ${opt.value === p.numberFormat ? 'bg-[#e8f5ed] font-semibold text-[#0b9f4b]' : ''}`}>{opt.label}</button>
            ))}
          </OfficePopover>
        </div>
        <button ref={fnAnchorRef} type="button" onClick={() => setFnOpen((v) => !v)} className="ml-auto rounded border border-[#18a957] px-2 py-1 text-[11px] font-semibold text-[#0b9f4b]">ƒx Functions</button>
        <span className="text-[11px] text-[#73777c]">{p.saving ? 'Saving…' : p.saved ? 'Saved' : 'Unsaved'}</span>
      </div>

      <div className="flex h-[34px] items-center border-b border-[#d9dde1] bg-[#fbfbfb] px-2">
        <div className="flex h-7 w-[96px] items-center rounded border border-[#d4d7da] bg-white px-2 font-mono text-[12px] font-semibold">{p.selected}</div>
        <div className="mx-2 text-[16px] font-serif italic text-[#444]">fx</div>
        <div ref={formulaAnchorRef} className="relative flex min-w-0 flex-1 items-center rounded border border-[#d4d7da] bg-white px-2">
          <input
            ref={formulaInputRef}
            aria-label="Formula bar"
            className="h-6 min-w-0 flex-1 bg-transparent text-[12px] outline-none"
            value={p.formulaValue}
            placeholder={p.display || 'Enter value or formula'}
            onFocus={() => { p.onBeginEdit(); setAcOpen(shouldShowAutocomplete(p.formulaValue)); }}
            onChange={(e) => {
              p.onFormulaChange(e.target.value);
              setAcOpen(shouldShowAutocomplete(e.target.value));
              setAcIndex(0);
            }}
            onKeyDown={(e) => {
              if (acHandleKey(e)) return;
              if (e.key === 'Enter') { e.preventDefault(); p.onFormulaCommit('enter'); setAcOpen(false); }
              else if (e.key === 'Escape') { e.preventDefault(); p.onFormulaCommit('cancel'); setAcOpen(false); }
              else if (e.key === 'Tab') { e.preventDefault(); p.onFormulaCommit(e.shiftKey ? 'shift-tab' : 'tab'); setAcOpen(false); }
            }}
          />
          <FormulaAutocompletePopover
            open={acOpen}
            anchorEl={formulaAnchorRef.current}
            matches={ac.matches}
            activeIndex={acIndex}
            onPick={(fn) => {
              const built = buildAutocompleteInsert(p.formulaValue, formulaInputRef.current?.selectionStart ?? p.formulaValue.length, fn.name);
              p.onFormulaChange(applyAutocompleteInsert(p.formulaValue, built));
              setAcOpen(false);
              formulaInputRef.current?.focus();
            }}
            onHover={setAcIndex}
            onClose={() => setAcOpen(false)}
          />
        </div>
        <button type="button" onClick={() => p.onFormulaCommit()} className="ml-2 rounded border px-2 text-[11px]">✓</button>
      </div>

      <OfficePopover open={fnOpen} onClose={() => setFnOpen(false)} anchorRef={fnAnchorRef} placement="bottom-end" className="flex w-[420px] flex-col overflow-hidden">
        <div className="flex h-10 items-center justify-between border-b px-3"><span className="text-[17px] font-semibold">Functions</span><button type="button" onClick={() => setFnOpen(false)} className="text-[#9aa0a6]">×</button></div>
        <div className="border-b px-3 py-2"><div className="flex h-8 items-center rounded border bg-white px-2"><span className="mr-2 text-[#7d8389]">⌕</span><input value={fnQuery} onChange={(e) => setFnQuery(e.target.value)} placeholder="Search function" className="min-w-0 flex-1 text-[12px] outline-none" /></div></div>
        <div className="flex border-b px-2 py-1 text-[10px]">
          <button type="button" onClick={() => setFnCategory('All')} className={`rounded px-2 py-1 ${fnCategory === 'All' ? 'bg-[#e8f5ed] text-[#0b9f4b]' : ''}`}>All</button>
          {SHEET_FUNCTION_CATEGORIES.map((cat) => (
            <button key={cat} type="button" onClick={() => setFnCategory(cat)} className={`rounded px-2 py-1 ${fnCategory === cat ? 'bg-[#e8f5ed] text-[#0b9f4b]' : ''}`}>{cat.split(' ')[0]}</button>
          ))}
        </div>
        <div className="max-h-[220px] overflow-auto">{filteredFns.map((fn) => (
          <button key={fn.name} type="button" onMouseEnter={() => setActiveFn(fn.name)} onClick={() => { p.onInsertFunction(fn.name); setFnOpen(false); }} className="flex w-full items-center justify-between border-b px-3 py-2 text-left hover:bg-[#f3f5f7]"><span className="font-mono text-[12px]">{fn.name}</span><span className="text-[10px] text-[#7b8086]">{fn.category}</span></button>
        ))}</div>
        <div className="border-t bg-white p-4">
          <div className="text-[12px] font-semibold text-[#18a957]">ƒx {fnDetail?.name}</div>
          <div className="mt-1 text-[10px] text-[#8b8f94]">{fnDetail?.category}</div>
          <div className="mt-3 text-[12px] leading-5 text-[#333]">{fnDetail?.description}</div>
          <div className="mt-4 text-[12px] text-[#777]">Syntax</div>
          <div className="mt-1 rounded border bg-[#fafafa] px-2 py-2 font-mono text-[11px]">{fnDetail?.syntax}</div>
          <button type="button" className="mt-3 rounded border border-[#18a957] px-3 py-1 text-[11px] font-semibold text-[#0b9f4b]" onClick={() => { p.onInsertFunction(fnDetail.name); setFnOpen(false); }}>Insert Function</button>
        </div>
      </OfficePopover>
    </div>
  );
}

function shouldShowAutocomplete(value: string): boolean {
  return formulaAutocompleteSuggestions(value).matches.length > 0;
}
