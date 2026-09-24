'use client';

import { memo, useCallback, useRef, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import { cellKey, colName, formulaDisplay, parseKey, type Sheet, type Workbook } from './model';
import { selectedKeys } from './selection-logic';

export type SheetGridProps = {
  sheet: Sheet;
  workbook: Workbook;
  rows: number;
  cols: number;
  gridlines: boolean;
  anchor: string;
  focus: string;
  editing: boolean;
  editingKey: string | null;
  editValue: string;
  onSelect: (anchor: string, focus: string) => void;
  onBeginEdit: (key: string, initialValue?: string) => void;
  onEditValueChange: (value: string) => void;
  onCommitEdit: (move?: 'enter' | 'tab' | 'shift-tab') => void;
  onCancelEdit: () => void;
  onContextMenu: (key: string, x: number, y: number) => void;
  formatCell: (key: string) => CSSProperties;
};

function SheetGridInner({
  sheet,
  workbook,
  rows,
  cols,
  gridlines,
  anchor,
  focus,
  editing,
  editingKey,
  editValue,
  onSelect,
  onBeginEdit,
  onEditValueChange,
  onCommitEdit,
  onCancelEdit,
  onContextMenu,
  formatCell,
}: SheetGridProps) {
  const dragRef = useRef<{ active: boolean; anchor: string } | null>(null);
  const selection = selectedKeys(anchor, focus);
  const isSelected = useCallback((key: string) => selection.includes(key), [selection]);

  const visibleCols = Array.from({ length: cols }, (_, c) => c).filter(
    (c) => !(sheet.hiddenColumns ?? []).includes(colName(c)),
  );
  const visibleRows = Array.from({ length: rows }, (_, r) => r).filter((r) => !(sheet.hiddenRows ?? []).includes(r));

  const onCellMouseDown = (key: string, event: ReactMouseEvent) => {
    if (event.button !== 0) return;
    dragRef.current = { active: true, anchor: event.shiftKey ? anchor : key };
    onSelect(dragRef.current.anchor, key);
  };

  const onCellMouseEnter = (key: string) => {
    if (!dragRef.current?.active) return;
    onSelect(dragRef.current.anchor, key);
  };

  const stopDrag = () => {
    dragRef.current = null;
  };

  return (
    <div className="sheet-grid h-full min-h-0 overflow-auto bg-white" onMouseUp={stopDrag} onMouseLeave={stopDrag}>
      <div className="min-w-max">
        <div className="sticky top-0 z-20 flex">
          <button
            type="button"
            aria-label="Select all"
            className="sticky left-0 z-30 h-8 w-12 shrink-0 border bg-slate-50 hover:bg-slate-200"
            onClick={() => onSelect(cellKey(0, 0), cellKey(rows - 1, cols - 1))}
          />
          <div className="flex">
            {visibleCols.map((c) => {
              const col = colName(c);
              return (
                <button
                  key={c}
                  type="button"
                  aria-label={`Select column ${col}`}
                  style={{ width: sheet.columnWidths?.[col] ?? 112 }}
                  className={`flex h-8 items-center justify-center ${gridlines ? 'border border-slate-200' : 'border-b border-transparent'} bg-[#f3f6fa] text-[11px] font-semibold text-slate-600 hover:bg-slate-200`}
                  onClick={() => onSelect(cellKey(0, c), cellKey(rows - 1, c))}
                >
                  {col}
                </button>
              );
            })}
          </div>
        </div>
        {visibleRows.map((r) => (
          <div className="flex" key={r}>
            <button
              type="button"
              aria-label={`Select row ${r + 1}`}
              style={{ height: sheet.rowHeights?.[r] ?? 28 }}
              className="sticky left-0 z-10 flex w-12 shrink-0 items-center justify-center border border-slate-200 bg-[#f3f6fa] text-[10px] font-semibold text-slate-600 hover:bg-slate-200"
              onClick={() => onSelect(cellKey(r, 0), cellKey(r, cols - 1))}
            >
              {r + 1}
            </button>
            {visibleCols.map((c) => {
              const col = colName(c);
              const key = cellKey(r, c);
              const filtered =
                sheet.filters?.[col] &&
                sheet.cells[key]?.value != null &&
                !String(sheet.cells[key]?.value).toLowerCase().includes(String(sheet.filters?.[col]).toLowerCase());
              const isEditingCell = editing && editingKey === key;
              return (
                <div
                  key={key}
                  role="gridcell"
                  aria-selected={isSelected(key)}
                  onMouseDown={(e) => onCellMouseDown(key, e)}
                  onMouseEnter={() => onCellMouseEnter(key)}
                  onDoubleClick={() => onBeginEdit(key)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onSelect(key, key);
                    onContextMenu(key, e.clientX, e.clientY);
                  }}
                  style={{
                    ...formatCell(key),
                    width: sheet.columnWidths?.[col] ?? 112,
                    height: sheet.rowHeights?.[r] ?? 28,
                    opacity: filtered ? 0.35 : 1,
                  }}
                  className={`relative overflow-hidden ${gridlines ? 'border' : ''} px-1 text-xs leading-7 ${isSelected(key) ? 'outline outline-2 outline-[var(--wd-primary)] outline-offset-[-2px]' : ''}`}
                >
                  {!isEditingCell ? formulaDisplay(sheet.cells[key], sheet, workbook) : null}
                  {isEditingCell ? (
                    <input
                      autoFocus
                      aria-label={`Edit ${key}`}
                      className="absolute inset-0 w-full border-0 bg-white px-1 text-xs outline-none ring-2 ring-[var(--wd-primary)]"
                      value={editValue}
                      onChange={(e) => onEditValueChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          onCommitEdit('enter');
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          onCancelEdit();
                        } else if (e.key === 'Tab') {
                          e.preventDefault();
                          onCommitEdit(e.shiftKey ? 'shift-tab' : 'tab');
                        }
                        e.stopPropagation();
                      }}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export const SheetGrid = memo(SheetGridInner);
