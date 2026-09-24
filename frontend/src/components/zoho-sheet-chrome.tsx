'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  FormulaAutocompletePopover,
  OfficeColorPicker,
  OfficeMenu,
  OfficeModal,
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
import type { CellFormat, NumberFormat } from '@/office/sheet/model';
import { SheetRibbon, type SheetRibbonTab } from '@/office/sheet/sheet-ribbon';

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
  cellFormat?: CellFormat;
  ribbonTab: SheetRibbonTab;
  onRibbonTabChange: (tab: SheetRibbonTab) => void;
  onFindReplace?: (mode: 'find' | 'replace') => void;
  onAutoSum: () => void;
  onSortAsc: () => void;
  onSortDesc: () => void;
  onDecimalIncrease: () => void;
  onDecimalDecrease: () => void;
  onUnmerge: () => void;
  onFillDown: () => void;
  onChartType: (type: 'column' | 'bar' | 'line' | 'pie' | 'area' | 'scatter') => void;
  onFreezeTopRow: () => void;
  onFreezeFirstColumn: () => void;
  onAutoFitColumn: () => void;
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
  onPasteSpecial: () => void;
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
  onRemoveDuplicates: () => void;
  onTextToColumns: () => void;
  onCellNote: () => void;
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
        officeMenuItem('edit-paste-special', 'Paste Special…', () => pick(p.onPasteSpecial)),
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
        officeMenuItem('tools-find', 'Find', () => pick(() => p.onFindReplace?.('find') ?? p.onFind()), 'Ctrl+F'),
        officeMenuItem('tools-replace', 'Replace', () => pick(() => p.onFindReplace?.('replace')), 'Ctrl+H'),
        officeMenuItem('tools-fn', 'Functions', () => { setMenu(null); setFnOpen(true); }),
      ];
    }
    if (menu === 'Help') return [officeMenuItem('help-center', 'Help Center', () => pick(p.onHelp))];
    return [];
  }, [menu, p]);

  return (
    <div className="print:hidden shrink-0" dir="ltr">
      <div className="sheet-appbar">
        <button type="button" className="sheet-appbar-mark" title="IMKAN Office" onClick={() => { window.location.href = '/office/new'; }}>S</button>
        <span className="sheet-appbar-title">{p.title || 'Untitled Spreadsheet'}</span>
        <span className="sheet-appbar-status">{p.saving ? 'Saving' : p.saved ? 'Saved' : 'Unsaved'}</span>
        <div className="sheet-appbar-actions">
          <button type="button" className="sheet-icon-btn" title="Undo" aria-label="Undo" disabled={!p.canUndo} onClick={p.onUndo}>↺</button>
          <button type="button" className="sheet-icon-btn" title="Redo" aria-label="Redo" disabled={!p.canRedo} onClick={p.onRedo}>↻</button>
          <button type="button" className="sheet-icon-btn" title="Find" aria-label="Find" onClick={() => p.onFindReplace?.('find') ?? p.onFind()}>Find</button>
          <button type="button" className="sheet-icon-btn" title="Help" aria-label="Help" onClick={p.onHelp}>?</button>
        </div>
      </div>

      <div className="sheet-menubar">
        {(['File', 'Edit', 'View', 'Insert', 'Format', 'Data', 'Review', 'Tools', 'Help'] as const).map((label) => (
          <button
            key={label}
            type="button"
            onClick={(e) => { menuAnchorRef.current = e.currentTarget; setMenu(menu === label ? null : label); }}
            onMouseEnter={(e) => { if (menu && menu !== label) { menuAnchorRef.current = e.currentTarget; setMenu(label); } }}
            className=""
            aria-expanded={menu === label}
          >
            {label}
          </button>
        ))}
        <OfficeMenu open={!!menu} onClose={() => setMenu(null)} anchorRef={menuAnchorRef} items={menuItems} minWidth={240} />
      </div>

      <SheetRibbon
        tab={p.ribbonTab}
        onTabChange={p.onRibbonTabChange}
        format={p.cellFormat}
        canUndo={p.canUndo}
        canRedo={p.canRedo}
        gridlines={p.gridlines}
        paintActive={p.paintActive}
        fontFamily={p.fontFamily}
        fontSize={p.fontSize}
        numberFormat={p.numberFormat}
        verticalAlign={p.verticalAlign}
        wrap={p.wrap}
        onUndo={p.onUndo}
        onRedo={p.onRedo}
        onCopy={p.onCopy}
        onCut={p.onCut}
        onPaste={p.onPaste}
        onPasteSpecial={p.onPasteSpecial}
        onClear={p.onClear}
        onPaint={p.onPaint}
        onBold={p.onBold}
        onItalic={p.onItalic}
        onUnderline={p.onUnderline}
        onStrike={p.onStrike}
        onColor={p.onColor}
        onBg={p.onBg}
        onAlign={p.onAlign}
        onVerticalAlign={p.onVerticalAlign}
        onWrap={p.onWrap}
        onNumberFormat={p.onNumberFormat}
        onDecimalIncrease={p.onDecimalIncrease}
        onDecimalDecrease={p.onDecimalDecrease}
        onBorder={p.onBorder}
        onMerge={p.onMerge}
        onUnmerge={p.onUnmerge}
        onAutoSum={p.onAutoSum}
        onFillDown={p.onFillDown}
        onFind={() => p.onFindReplace?.('find') ?? p.onFind()}
        onReplace={() => p.onFindReplace?.('replace')}
        onOpenFunctions={() => setFnOpen(true)}
        onTable={p.onTable}
        onPivot={p.onPivot}
        onChart={p.onChartType}
        onInsertRows={p.onInsertRows}
        onDeleteRows={p.onDeleteRows}
        onInsertColumns={p.onInsertColumns}
        onDeleteColumns={p.onDeleteColumns}
        onSortAsc={p.onSortAsc}
        onSortDesc={p.onSortDesc}
        onFilter={p.onFilter}
        onValidation={p.onValidation}
        onConditional={p.onConditional}
        onNamedRange={p.onNamedRange}
        onRemoveDuplicates={p.onRemoveDuplicates}
        onTextToColumns={p.onTextToColumns}
        onCellNote={p.onCellNote}
        onFreezeTopRow={p.onFreezeTopRow}
        onFreezeFirstColumn={p.onFreezeFirstColumn}
        onFreezePanes={p.onFreeze}
        onGridlines={p.onGridlines}
        onHideRow={p.onHideRow}
        onHideColumn={p.onHideColumn}
        onUnhideRows={p.onUnhideRows}
        onUnhideColumns={p.onUnhideColumns}
        onAutoFitColumn={p.onAutoFitColumn}
        fontFamilyControl={(
          <div className="relative">
            <button ref={fontAnchorRef} type="button" onClick={() => { setFontOpen((v) => !v); setSizeOpen(false); setFormatOpen(false); }} className="sheet-combo min-w-[108px] justify-between">{p.fontFamily}</button>
            <OfficePopover open={fontOpen} onClose={() => setFontOpen(false)} anchorRef={fontAnchorRef} className="max-h-[280px] overflow-auto py-1">
              {fonts.map((f) => (
                <button key={f} type="button" onClick={() => { p.onFontFamily(f); setFontOpen(false); }} className={`block w-full px-3 py-2 text-left text-[14px] hover:bg-[#f2f4f6] ${f === p.fontFamily ? 'font-semibold' : ''}`}>{f}</button>
              ))}
            </OfficePopover>
          </div>
        )}
        fontSizeControl={(
          <div className="relative">
            <button ref={sizeAnchorRef} type="button" onClick={() => { setSizeOpen((v) => !v); setFontOpen(false); setFormatOpen(false); }} className="sheet-combo min-w-[48px] justify-center">{p.fontSize}</button>
            <OfficePopover open={sizeOpen} onClose={() => setSizeOpen(false)} anchorRef={sizeAnchorRef} className="p-1">
              <div className="grid w-[140px] grid-cols-4">
                {[8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32].map((s) => (
                  <button key={s} type="button" onClick={() => { p.onFontSize(s); setSizeOpen(false); }} className="rounded px-2 py-2 text-[12px] hover:bg-[#f2f4f6]">{s}</button>
                ))}
              </div>
            </OfficePopover>
          </div>
        )}
        textColorControl={(
          <>
            <button ref={textColorAnchorRef} type="button" title="Text color" className="grid h-8 w-8 place-items-center rounded hover:bg-[#eef1f4]" onClick={() => setTextColorOpen(true)}><span className="text-[15px] font-bold" style={{ color: p.cellFormat?.color ?? '#e21d3e' }}>A</span></button>
            <OfficeColorPicker open={textColorOpen} onClose={() => setTextColorOpen(false)} anchorRef={textColorAnchorRef} title="Text Color" onPick={p.onColor} />
          </>
        )}
        fillColorControl={(
          <>
            <button ref={fillColorAnchorRef} type="button" title="Fill color" className="grid h-8 w-8 place-items-center rounded hover:bg-[#eef1f4]" onClick={() => setFillColorOpen(true)}><span className="h-4 w-5 border-b-2 border-[#e6c900]" style={{ background: p.cellFormat?.background ?? '#fff' }} /></button>
            <OfficeColorPicker open={fillColorOpen} onClose={() => setFillColorOpen(false)} anchorRef={fillColorAnchorRef} title="Fill Color" onPick={p.onBg} />
          </>
        )}
      />

      <div className="sheet-formula">
        <div className="sheet-namebox" aria-label="Name box">{p.selected}</div>
        <div className="sheet-fx">fx</div>
        <div ref={formulaAnchorRef} className="sheet-formula-input relative">
          <input
            ref={formulaInputRef}
            aria-label="Formula bar"
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
        <button type="button" className="sheet-formula-action" title="Enter" onClick={() => p.onFormulaCommit()}>OK</button>
        <button type="button" className="sheet-formula-action" title="Cancel" onClick={() => p.onFormulaCommit('cancel')}>Cancel</button>
        <button ref={fnAnchorRef} type="button" className="sheet-formula-action" title="Insert function" onClick={() => setFnOpen((v) => !v)}>fx</button>
      </div>

      <OfficeModal open={fnOpen} onClose={() => setFnOpen(false)} title="Insert Function" panelClassName="w-[560px] max-w-[92vw]">
        <div className="space-y-3 p-3 text-[12px] text-[#242424]">
          <label className="block">
            Search for a function
            <input value={fnQuery} onChange={(e) => setFnQuery(e.target.value)} placeholder="Type a brief description or a function name" className="mt-1 h-7 w-full border border-[#b4b8bd] px-2 outline-none focus:border-[#217346]" />
          </label>
          <div className="grid grid-cols-[160px_1fr] gap-3">
            <label className="block">
              Category
              <select value={fnCategory} onChange={(e) => setFnCategory(e.target.value as SheetFunctionCategory | 'All')} className="mt-1 h-7 w-full border border-[#b4b8bd] bg-white px-1">
                <option value="All">All</option>
                {SHEET_FUNCTION_CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </label>
            <div>
              <div className="mb-1">Select a function</div>
              <div className="h-[180px] overflow-auto border border-[#b4b8bd] bg-white" role="listbox" aria-label="Functions">
                {filteredFns.map((fn) => (
                  <button
                    key={fn.name}
                    type="button"
                    role="option"
                    aria-selected={fn.name === fnDetail?.name}
                    onClick={() => setActiveFn(fn.name)}
                    onDoubleClick={() => { p.onInsertFunction(fn.name); setFnOpen(false); }}
                    className={`block w-full px-2 py-1 text-left font-mono ${fn.name === fnDetail?.name ? 'bg-[#217346] text-white' : 'hover:bg-[#e8f2ec]'}`}
                  >
                    {fn.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="border border-[#d0d4d9] bg-[#fafafa] p-2">
            <div className="font-semibold">{fnDetail?.name}</div>
            <div className="mt-1 text-[#444]">{fnDetail?.description}</div>
            <div className="mt-2 font-mono text-[11px]">{fnDetail?.syntax}</div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="h-7 border border-[#b4b8bd] bg-white px-3" onClick={() => setFnOpen(false)}>Cancel</button>
            <button type="button" className="h-7 border border-[#185c37] bg-[#217346] px-3 text-white" onClick={() => { if (fnDetail) { p.onInsertFunction(fnDetail.name); setFnOpen(false); } }}>OK</button>
          </div>
        </div>
      </OfficeModal>
    </div>
  );
}

function shouldShowAutocomplete(value: string): boolean {
  return formulaAutocompleteSuggestions(value).matches.length > 0;
}
