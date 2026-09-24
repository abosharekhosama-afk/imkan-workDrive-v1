'use client';

import { useRef, useState, type ReactNode } from 'react';
import { OfficeColorPicker, OfficeDropdown, OfficePopover } from '@/office/shared/floating';

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
  onFontFamily: (v: string) => void;
  onFontSize: (v: number) => void;
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
  onFormat: (v: string) => void;
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
const functions: [string, string, string][] = [
  ['ABS', 'Mathematical', 'Returns the absolute value of a number.'],
  ['ACOS', 'Mathematical', 'Returns the arccosine of a number.'],
  ['AVERAGE', 'Statistical', 'Returns the average of its arguments.'],
  ['COUNT', 'Statistical', 'Counts numeric values in a range.'],
  ['IF', 'Logical', 'Returns one value if a condition is true and another if false.'],
  ['SUM', 'Mathematical', 'Adds all numbers in a range.'],
];

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

function MenuItem({ label, onClick, shortcut, disabled = false, arrow = false, active = false }: { label: string; onClick?: () => void; shortcut?: string; disabled?: boolean; arrow?: boolean; active?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`flex w-full items-center justify-between gap-6 px-3 py-2 text-left text-[13px] ${active ? 'bg-[#e8f5ed] text-[#0b9f4b]' : 'text-[#30343b] hover:bg-[#f3f5f7]'} disabled:text-[#a7a7a7]`}>
      <span>{label}</span>
      <span className="text-[11px] text-[#8b8f94]">{shortcut || (arrow ? '›' : '')}</span>
    </button>
  );
}

function Divider() {
  return <div className="my-1 h-px bg-[#e8eaed]" />;
}

export function ZohoSheetChrome(p: Props) {
  const [menu, setMenu] = useState<Menu>(null);
  const [fontOpen, setFontOpen] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);
  const [fnOpen, setFnOpen] = useState(false);
  const [textColorOpen, setTextColorOpen] = useState(false);
  const [fillColorOpen, setFillColorOpen] = useState(false);
  const [fnQuery, setFnQuery] = useState('');
  const [activeFn, setActiveFn] = useState(functions[0]?.[0] ?? 'SUM');
  const menuAnchorRef = useRef<HTMLButtonElement>(null);
  const fontAnchorRef = useRef<HTMLButtonElement>(null);
  const sizeAnchorRef = useRef<HTMLButtonElement>(null);
  const fnAnchorRef = useRef<HTMLButtonElement>(null);
  const textColorAnchorRef = useRef<HTMLButtonElement>(null);
  const fillColorAnchorRef = useRef<HTMLButtonElement>(null);

  const pick = (fn: () => void) => {
    fn();
    setMenu(null);
  };
  const filtered = functions.filter((x) => x[0].toLowerCase().includes(fnQuery.toLowerCase()) || x[1].toLowerCase().includes(fnQuery.toLowerCase()));
  const fnDetail = filtered.find((x) => x[0] === activeFn) ?? filtered[0] ?? functions[0];

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
            onClick={(e) => {
              menuAnchorRef.current = e.currentTarget;
              setMenu(menu === label ? null : label);
            }}
            className={`h-full px-3 hover:bg-[#f3f5f7] ${menu === label ? 'font-medium text-[#111]' : ''}`}
          >
            {label}
          </button>
        ))}
        <OfficeDropdown open={!!menu} onClose={() => setMenu(null)} anchorRef={menuAnchorRef} minWidth={220}>
          {menu === 'File' && (
            <>
              <MenuItem label="New Spreadsheet" onClick={() => pick(p.onAddSheet)} />
              <MenuItem label="Save" shortcut="Ctrl+S" onClick={() => pick(p.onSave)} />
              <MenuItem label="Print" shortcut="Ctrl+P" onClick={() => pick(p.onPrint)} />
              <MenuItem label="Export" onClick={() => pick(p.onExport)} />
            </>
          )}
          {menu === 'Edit' && (
            <>
              <MenuItem label="Undo" shortcut="Ctrl+Z" onClick={() => pick(p.onUndo)} disabled={!p.canUndo} />
              <MenuItem label="Redo" shortcut="Ctrl+Y" onClick={() => pick(p.onRedo)} disabled={!p.canRedo} />
              <Divider />
              <MenuItem label="Cut" shortcut="Ctrl+X" onClick={() => pick(p.onCut)} />
              <MenuItem label="Copy" shortcut="Ctrl+C" onClick={() => pick(p.onCopy)} />
              <MenuItem label="Paste" shortcut="Ctrl+V" onClick={() => pick(p.onPaste)} />
              <MenuItem label="Clear" onClick={() => pick(p.onClear)} />
            </>
          )}
          {menu === 'View' && (
            <>
              <MenuItem label="Gridlines" onClick={() => pick(p.onGridlines)} active={p.gridlines} />
              <MenuItem label="Freeze" onClick={() => pick(p.onFreeze)} />
              <MenuItem label="Hide Rows" onClick={() => pick(p.onHideRow)} />
              <MenuItem label="Hide Columns" onClick={() => pick(p.onHideColumn)} />
              <MenuItem label="Unhide Rows" onClick={() => pick(p.onUnhideRows)} />
              <MenuItem label="Unhide Columns" onClick={() => pick(p.onUnhideColumns)} />
            </>
          )}
          {menu === 'Insert' && (
            <>
              <MenuItem label="Rows" onClick={() => pick(p.onInsertRows)} />
              <MenuItem label="Columns" onClick={() => pick(p.onInsertColumns)} />
              <MenuItem label="Table" onClick={() => pick(p.onTable)} />
              <MenuItem label="Pivot Table" onClick={() => pick(p.onPivot)} />
              <MenuItem label="Chart" onClick={() => pick(p.onChart)} />
              <MenuItem label="New Sheet" onClick={() => pick(p.onAddSheet)} />
            </>
          )}
          {menu === 'Format' && (
            <>
              <MenuItem label="General" onClick={() => pick(() => p.onFormat('general'))} />
              <MenuItem label="Number" onClick={() => pick(() => p.onFormat('number'))} />
              <MenuItem label="Currency" onClick={() => pick(() => p.onFormat('currency'))} />
              <MenuItem label="Percentage" onClick={() => pick(() => p.onFormat('percent'))} />
              <MenuItem label="Bold" shortcut="Ctrl+B" onClick={() => pick(p.onBold)} />
              <MenuItem label="Italic" shortcut="Ctrl+I" onClick={() => pick(p.onItalic)} />
            </>
          )}
          {menu === 'Data' && (
            <>
              <MenuItem label="Sort" onClick={() => pick(p.onSort)} />
              <MenuItem label="Filter" onClick={() => pick(p.onFilter)} />
              <MenuItem label="Data Validation" onClick={() => pick(p.onValidation)} />
            </>
          )}
          {menu === 'Review' && <MenuItem label="Add Comment…" onClick={() => pick(p.onAddComment)} />}
          {menu === 'Tools' && (
            <>
              <MenuItem label="Find" shortcut="Ctrl+F" onClick={() => pick(p.onFind)} />
              <MenuItem label="Functions" onClick={() => { setMenu(null); setFnOpen(true); }} />
            </>
          )}
          {menu === 'Help' && <MenuItem label="Help Center" onClick={() => pick(p.onHelp)} />}
        </OfficeDropdown>
      </div>

      <div className="flex h-[42px] items-center gap-1 border-b border-[#d9dde1] bg-white px-2 shadow-[0_1px_2px_rgba(0,0,0,.08)]">
        <ToolButton title="Print" onClick={p.onPrint}><Svg><path d="M6 9V4h12v5M6 18H4V10h16v8h-2M7 15h10v5H7z" /></Svg></ToolButton>
        <ToolButton title="Undo" onClick={p.onUndo} disabled={!p.canUndo}><Svg><path d="M9 8 4 12l5 4M4 12h9a6 6 0 0 1 6 6" /></Svg></ToolButton>
        <ToolButton title="Redo" onClick={p.onRedo} disabled={!p.canRedo}><Svg><path d="m15 8 5 4-5 4M20 12h-9a6 6 0 0 0-6 6" /></Svg></ToolButton>
        <div className="relative">
          <button ref={fontAnchorRef} type="button" onClick={() => { setFontOpen((v) => !v); setSizeOpen(false); }} className="flex h-8 min-w-[124px] items-center justify-between rounded border border-[#d8dce1] bg-white px-2 text-[13px]">{p.fontFamily}<span>⌄</span></button>
          <OfficePopover open={fontOpen} onClose={() => setFontOpen(false)} anchorRef={fontAnchorRef} className="max-h-[280px] overflow-auto py-1">
            {fonts.map((f) => (
              <button key={f} type="button" onClick={() => { p.onFontFamily(f); setFontOpen(false); }} className={`block w-full px-3 py-2 text-left text-[14px] hover:bg-[#f2f4f6] ${f === p.fontFamily ? 'font-semibold' : ''}`}>{f}</button>
            ))}
          </OfficePopover>
        </div>
        <div className="relative">
          <button ref={sizeAnchorRef} type="button" onClick={() => { setSizeOpen((v) => !v); setFontOpen(false); }} className="flex h-8 min-w-[54px] items-center justify-between rounded border border-[#d8dce1] bg-white px-2 text-[13px]">{p.fontSize}<span>⌄</span></button>
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
        <button ref={textColorAnchorRef} type="button" title="Text color" className="grid h-8 w-8 place-items-center rounded hover:bg-[#eef1f4]" onClick={() => setTextColorOpen(true)}><span className="text-[17px] font-bold" style={{ color: '#e21d3e' }}>A</span></button>
        <button ref={fillColorAnchorRef} type="button" title="Fill color" className="grid h-8 w-8 place-items-center rounded hover:bg-[#eef1f4]" onClick={() => setFillColorOpen(true)}><span className="h-4 w-5 border-b-2 border-[#e6c900] bg-white" /></button>
        <OfficeColorPicker open={textColorOpen} onClose={() => setTextColorOpen(false)} anchorRef={textColorAnchorRef} title="Text Color" onPick={p.onColor} />
        <OfficeColorPicker open={fillColorOpen} onClose={() => setFillColorOpen(false)} anchorRef={fillColorAnchorRef} title="Fill Color" onPick={p.onBg} />
        <div className="mx-1 h-6 w-px bg-[#e2e5e8]" />
        <ToolButton title="Borders" onClick={p.onBorder}><Svg><rect x="5" y="5" width="14" height="14" /><path d="M5 10h14M10 5v14" /></Svg></ToolButton>
        <ToolButton title="Merge Cells" onClick={p.onMerge}><Svg><rect x="5" y="7" width="14" height="10" /><path d="M10 12h4" /></Svg></ToolButton>
        <select title="Alignment" aria-label="Alignment" className="h-8 rounded border border-[#d8dce1] bg-white px-2 text-[12px]" onChange={(e) => p.onAlign(e.target.value as 'start' | 'center' | 'end')}><option value="start">≡ Left</option><option value="center">≡ Center</option><option value="end">≡ Right</option></select>
        <select title="Number format" aria-label="Number format" className="h-8 rounded border border-[#d8dce1] bg-white px-2 text-[12px]" onChange={(e) => p.onFormat(e.target.value)}><option value="general">General</option><option value="number">Number</option><option value="currency">Currency</option><option value="percent">%</option><option value="date">Date</option></select>
        <button ref={fnAnchorRef} type="button" onClick={() => setFnOpen((v) => !v)} className="ml-auto rounded border border-[#18a957] px-2 py-1 text-[11px] font-semibold text-[#0b9f4b]">ƒx Functions</button>
        <span className="text-[11px] text-[#73777c]">{p.saving ? 'Saving…' : p.saved ? 'Saved' : 'Unsaved'}</span>
      </div>

      <div className="flex h-[34px] items-center border-b border-[#d9dde1] bg-[#fbfbfb] px-2">
        <div className="flex h-7 w-[96px] items-center rounded border border-[#d4d7da] bg-white px-2 font-mono text-[12px] font-semibold">{p.selected}</div>
        <div className="mx-2 text-[16px] font-serif italic text-[#444]">fx</div>
        <div className="flex min-w-0 flex-1 items-center rounded border border-[#d4d7da] bg-white px-2">
          <input
            aria-label="Formula bar"
            className="h-6 min-w-0 flex-1 bg-transparent text-[12px] outline-none"
            value={p.formulaValue}
            placeholder={p.display || 'Enter value or formula'}
            onFocus={p.onBeginEdit}
            onChange={(e) => p.onFormulaChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); p.onFormulaCommit('enter'); }
              else if (e.key === 'Escape') { e.preventDefault(); p.onFormulaCommit('cancel'); }
              else if (e.key === 'Tab') { e.preventDefault(); p.onFormulaCommit(e.shiftKey ? 'shift-tab' : 'tab'); }
            }}
          />
        </div>
        <button type="button" onClick={() => p.onFormulaCommit()} className="ml-2 rounded border px-2 text-[11px]">✓</button>
      </div>

      <OfficePopover open={fnOpen} onClose={() => setFnOpen(false)} anchorRef={fnAnchorRef} placement="bottom-end" className="flex w-[380px] flex-col overflow-hidden">
        <div className="flex h-10 items-center justify-between border-b px-3"><span className="text-[17px] font-semibold">Functions</span><button type="button" onClick={() => setFnOpen(false)} className="text-[#9aa0a6]">×</button></div>
        <div className="border-b px-3 py-2"><div className="flex h-8 items-center rounded border bg-white px-2"><span className="mr-2 text-[#7d8389]">⌕</span><input value={fnQuery} onChange={(e) => setFnQuery(e.target.value)} placeholder="Search function" className="min-w-0 flex-1 text-[12px] outline-none" /></div></div>
        <div className="max-h-[240px] overflow-auto">{filtered.map(([name, cat]) => (
          <button key={name} type="button" onMouseEnter={() => setActiveFn(name)} onClick={() => { p.onInsertFunction(name); setFnOpen(false); }} className="flex w-full items-center justify-between border-b px-3 py-2 text-left hover:bg-[#f3f5f7]"><span className="font-mono text-[12px]">{name}</span><span className="text-[10px] text-[#7b8086]">{cat}</span></button>
        ))}</div>
        <div className="border-t bg-white p-4"><div className="text-[12px] font-semibold text-[#18a957]">ƒx {fnDetail?.[0]}</div><div className="mt-3 text-[12px] leading-5 text-[#333]">{fnDetail?.[2]}</div><div className="mt-4 text-[12px] text-[#777]">Syntax</div><div className="mt-1 rounded border bg-[#fafafa] px-2 py-2 font-mono text-[11px]">{fnDetail?.[0]}(…)</div></div>
      </OfficePopover>
    </div>
  );
}
