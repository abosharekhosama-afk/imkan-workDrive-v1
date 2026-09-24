'use client';

import type { ReactNode } from 'react';
import { NUMBER_FORMAT_OPTIONS } from './format-display';
import type { CellFormat, NumberFormat } from './model';

export type SheetRibbonTab = 'home' | 'insert' | 'formulas' | 'data' | 'layout' | 'review' | 'view';

type SheetRibbonProps = {
  tab: SheetRibbonTab;
  onTabChange: (tab: SheetRibbonTab) => void;
  format?: CellFormat;
  canUndo: boolean;
  canRedo: boolean;
  gridlines: boolean;
  paintActive: boolean;
  fontFamily: string;
  fontSize: number;
  numberFormat: NumberFormat;
  verticalAlign: 'top' | 'middle' | 'bottom';
  wrap: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onPasteSpecial: () => void;
  onClear: () => void;
  onPaint: () => void;
  onBold: () => void;
  onItalic: () => void;
  onUnderline: () => void;
  onStrike: () => void;
  onColor: (v: string) => void;
  onBg: (v: string) => void;
  onAlign: (v: 'start' | 'center' | 'end') => void;
  onVerticalAlign: (v: 'top' | 'middle' | 'bottom') => void;
  onWrap: (v: boolean) => void;
  onNumberFormat: (v: NumberFormat) => void;
  onDecimalIncrease: () => void;
  onDecimalDecrease: () => void;
  onBorder: () => void;
  onMerge: () => void;
  onUnmerge: () => void;
  onAutoSum: () => void;
  onFillDown: () => void;
  onFind: () => void;
  onReplace: () => void;
  onOpenFunctions: () => void;
  onTable: () => void;
  onPivot: () => void;
  onChart: (type: 'column' | 'bar' | 'line' | 'pie' | 'area' | 'scatter') => void;
  onInsertRows: () => void;
  onDeleteRows: () => void;
  onInsertColumns: () => void;
  onDeleteColumns: () => void;
  onSortAsc: () => void;
  onSortDesc: () => void;
  onFilter: () => void;
  onValidation: () => void;
  onConditional: () => void;
  onNamedRange: () => void;
  onRemoveDuplicates: () => void;
  onTextToColumns: () => void;
  onCellNote: () => void;
  onFreezeTopRow: () => void;
  onFreezeFirstColumn: () => void;
  onFreezePanes: () => void;
  onGridlines: () => void;
  onHideRow: () => void;
  onHideColumn: () => void;
  onUnhideRows: () => void;
  onUnhideColumns: () => void;
  onAutoFitColumn: () => void;
  fontFamilyControl: ReactNode;
  fontSizeControl: ReactNode;
  textColorControl: ReactNode;
  fillColorControl: ReactNode;
};

const TABS: [SheetRibbonTab, string][] = [
  ['home', 'Home'],
  ['insert', 'Insert'],
  ['formulas', 'Formulas'],
  ['data', 'Data'],
  ['layout', 'Layout'],
  ['review', 'Review'],
  ['view', 'View'],
];

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="sheet-group">
      <div className="sheet-group-cmds">{children}</div>
      <div className="sheet-group-label">{label}</div>
    </div>
  );
}

function Divider() {
  return <span className="sheet-divider" />;
}

function Btn({ label, title, onClick, active, disabled, glyph }: { label: string; title?: string; onClick?: () => void; active?: boolean; disabled?: boolean; glyph?: string }) {
  return (
    <button
      type="button"
      title={title ?? label}
      aria-label={title ?? label}
      aria-pressed={active || undefined}
      disabled={disabled || !onClick}
      onClick={onClick}
      className="sheet-cmd"
    >
      <span className="sheet-cmd-glyph" aria-hidden="true">{glyph ?? label.slice(0, 1)}</span>
      <span className="whitespace-nowrap leading-none">{label}</span>
    </button>
  );
}

export function SheetRibbon(p: SheetRibbonProps) {
  return (
    <div className="sheet-ribbon">
      <div className="sheet-ribbon-tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={p.tab === id}
            onClick={() => p.onTabChange(id)}
            className="sheet-ribbon-tab"
          >
            {label}
          </button>
        ))}
      </div>
      <div className="sheet-ribbon-body">
        {p.tab === 'home' ? (
          <>
            <Group label="Clipboard">
              <Btn label="Cut" glyph="X" onClick={p.onCut} />
              <Btn label="Copy" glyph="C" onClick={p.onCopy} />
              <Btn label="Paste" glyph="P" onClick={p.onPaste} />
              <Btn label="Special" title="Paste Special" glyph="S" onClick={p.onPasteSpecial} />
              <Btn label="Painter" glyph="F" onClick={p.onPaint} active={p.paintActive} />
            </Group>
            <Divider />
            <Group label="Font">
              {p.fontFamilyControl}
              {p.fontSizeControl}
              <Btn label="Bold" onClick={p.onBold} active={!!p.format?.bold} />
              <Btn label="Italic" onClick={p.onItalic} active={!!p.format?.italic} />
              <Btn label="Underline" onClick={p.onUnderline} active={!!p.format?.underline} />
              <Btn label="Strike" onClick={p.onStrike} active={!!p.format?.strike} />
              {p.textColorControl}
              {p.fillColorControl}
            </Group>
            <Divider />
            <Group label="Alignment">
              <Btn label="Left" onClick={() => p.onAlign('start')} active={p.format?.align === 'start' || !p.format?.align} />
              <Btn label="Center" onClick={() => p.onAlign('center')} active={p.format?.align === 'center'} />
              <Btn label="Right" onClick={() => p.onAlign('end')} active={p.format?.align === 'end'} />
              <Btn label="Top" onClick={() => p.onVerticalAlign('top')} active={p.verticalAlign === 'top'} />
              <Btn label="Middle" onClick={() => p.onVerticalAlign('middle')} active={p.verticalAlign === 'middle'} />
              <Btn label="Bottom" onClick={() => p.onVerticalAlign('bottom')} active={p.verticalAlign === 'bottom'} />
              <Btn label="Wrap" onClick={() => p.onWrap(!p.wrap)} active={p.wrap} />
              <Btn label="Merge" onClick={p.onMerge} />
            </Group>
            <Divider />
            <Group label="Number">
              <select
                aria-label="Number format"
                value={p.numberFormat}
                onChange={(e) => p.onNumberFormat(e.target.value as NumberFormat)}
                className="sheet-combo max-w-[120px]"
              >
                {NUMBER_FORMAT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <Btn label=".0+" title="Increase decimal" onClick={p.onDecimalIncrease} />
              <Btn label=".0-" title="Decrease decimal" onClick={p.onDecimalDecrease} />
            </Group>
            <Divider />
            <Group label="Editing">
              <Btn label="AutoSum" onClick={p.onAutoSum} />
              <Btn label="Fill" onClick={p.onFillDown} />
              <Btn label="Clear" onClick={p.onClear} />
              <Btn label="Find" onClick={p.onFind} />
              <Btn label="Replace" onClick={p.onReplace} />
            </Group>
          </>
        ) : null}
        {p.tab === 'insert' ? (
          <>
            <Group label="Tables">
              <Btn label="Table" onClick={p.onTable} />
              <Btn label="Pivot" onClick={p.onPivot} />
            </Group>
            <Divider />
            <Group label="Charts">
              <Btn label="Column" onClick={() => p.onChart('column')} />
              <Btn label="Bar" onClick={() => p.onChart('bar')} />
              <Btn label="Line" onClick={() => p.onChart('line')} />
              <Btn label="Pie" onClick={() => p.onChart('pie')} />
              <Btn label="Area" onClick={() => p.onChart('area')} />
              <Btn label="Scatter" onClick={() => p.onChart('scatter')} />
            </Group>
            <Divider />
            <Group label="Rows / Columns">
              <Btn label="Insert Row" onClick={p.onInsertRows} />
              <Btn label="Delete Row" onClick={p.onDeleteRows} />
              <Btn label="Insert Col" onClick={p.onInsertColumns} />
              <Btn label="Delete Col" onClick={p.onDeleteColumns} />
            </Group>
          </>
        ) : null}
        {p.tab === 'formulas' ? (
          <>
            <Group label="Function Library">
              <Btn label="Insert Function" onClick={p.onOpenFunctions} />
              <Btn label="AutoSum" onClick={p.onAutoSum} />
            </Group>
            <Divider />
            <Group label="Defined Names">
              <Btn label="Named Range" onClick={p.onNamedRange} />
            </Group>
          </>
        ) : null}
        {p.tab === 'data' ? (
          <>
            <Group label="Sort & Filter">
              <Btn label="Sort A→Z" onClick={p.onSortAsc} />
              <Btn label="Sort Z→A" onClick={p.onSortDesc} />
              <Btn label="Filter" onClick={p.onFilter} />
            </Group>
            <Divider />
            <Group label="Data Tools">
              <Btn label="Validation" onClick={p.onValidation} />
              <Btn label="Conditional" onClick={p.onConditional} />
              <Btn label="Dedupe" title="Remove Duplicates" onClick={p.onRemoveDuplicates} />
              <Btn label="Text→Cols" title="Text to Columns" onClick={p.onTextToColumns} />
            </Group>
          </>
        ) : null}
        {p.tab === 'review' ? (
          <>
            <Group label="Comments">
              <Btn label="Note" title="Cell note" onClick={p.onCellNote} />
            </Group>
          </>
        ) : null}
        {p.tab === 'layout' ? (
          <>
            <Group label="Dimensions">
              <Btn label="AutoFit Col" onClick={p.onAutoFitColumn} />
              <Btn label="Hide Row" onClick={p.onHideRow} />
              <Btn label="Hide Col" onClick={p.onHideColumn} />
              <Btn label="Unhide Rows" onClick={p.onUnhideRows} />
              <Btn label="Unhide Cols" onClick={p.onUnhideColumns} />
            </Group>
            <Divider />
            <Group label="Freeze Panes">
              <Btn label="Top Row" onClick={p.onFreezeTopRow} />
              <Btn label="First Col" onClick={p.onFreezeFirstColumn} />
              <Btn label="Both" onClick={p.onFreezePanes} />
            </Group>
            <Divider />
            <Group label="Cells">
              <Btn label="Merge" onClick={p.onMerge} />
              <Btn label="Unmerge" onClick={p.onUnmerge} />
              <Btn label="Borders" onClick={p.onBorder} />
            </Group>
          </>
        ) : null}
        {p.tab === 'view' ? (
          <>
            <Group label="Show">
              <Btn label="Gridlines" onClick={p.onGridlines} active={p.gridlines} />
            </Group>
            <Divider />
            <Group label="History">
              <Btn label="Undo" onClick={p.onUndo} disabled={!p.canUndo} />
              <Btn label="Redo" onClick={p.onRedo} disabled={!p.canRedo} />
            </Group>
          </>
        ) : null}
      </div>
    </div>
  );
}
