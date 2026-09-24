'use client';

import { memo, useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { cellKey, colName, formulaDisplay, parseKey, type Sheet, type Workbook } from './model';
import { rangeBounds, selectedKeys } from './selection-logic';
import { clampColumnWidth, clampRowHeight, columnWidth, rowHeight } from './dimension-logic';
import { stickyLeftForCol, stickyTopForRow } from './freeze-panes-logic';

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
  onColumnWidthChange: (col: number, width: number) => void;
  onRowHeightChange: (row: number, height: number) => void;
  onAutoFitColumn: (col: number) => void;
  formatCell: (key: string) => CSSProperties;
  hiddenTableRows?: Set<number>;
  chartOverlay?: ReactNode;
  onFill?: (start: string, end: string) => void;
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
  onColumnWidthChange,
  onRowHeightChange,
  onAutoFitColumn,
  formatCell,
  hiddenTableRows,
  chartOverlay,
  onFill,
}: SheetGridProps) {
  const dragRef = useRef<{ active: boolean; anchor: string } | null>(null);
  const fillRef = useRef<{ start: string } | null>(null);
  const [fillEnd, setFillEnd] = useState<string | null>(null);
  const colResizeRef = useRef<{ col: number; startX: number; startWidth: number } | null>(null);
  const rowResizeRef = useRef<{ row: number; startY: number; startHeight: number } | null>(null);
  const [previewColWidths, setPreviewColWidths] = useState<Record<number, number>>({});
  const [previewRowHeights, setPreviewRowHeights] = useState<Record<number, number>>({});
  const selection = selectedKeys(anchor, focus);
  const isSelected = useCallback((key: string) => selection.includes(key), [selection]);
  const frozenRows = sheet.frozenRows ?? 0;
  const frozenCols = sheet.frozenColumns ?? 0;
  const headerHeight = 22;
  const rowHeaderWidth = 42;

  const cellStickyStyle = (r: number, c: number): CSSProperties => {
    const style: CSSProperties = {};
    const frozenRow = r < frozenRows;
    const frozenCol = c < frozenCols;
    if (frozenRow || frozenCol) style.position = 'sticky';
    if (frozenRow) style.top = stickyTopForRow(r, sheet, headerHeight);
    if (frozenCol) style.left = stickyLeftForCol(c, sheet, rowHeaderWidth);
    if (frozenRow && frozenCol) style.zIndex = 12;
    else if (frozenRow || frozenCol) style.zIndex = 6;
    if (frozenRow) style.background = style.background ?? '#fff';
    return style;
  };

  const visibleCols = Array.from({ length: cols }, (_, c) => c).filter(
    (c) => !(sheet.hiddenColumns ?? []).includes(colName(c)),
  );
  const visibleRows = Array.from({ length: rows }, (_, r) => r).filter(
    (r) => !(sheet.hiddenRows ?? []).includes(r) && !(hiddenTableRows?.has(r) ?? false),
  );

  const widthForCol = (c: number) => previewColWidths[c] ?? columnWidth(sheet, c);
  const heightForRow = (r: number) => previewRowHeights[r] ?? rowHeight(sheet, r);

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (colResizeRef.current) {
        const delta = event.clientX - colResizeRef.current.startX;
        const next = clampColumnWidth(colResizeRef.current.startWidth + delta);
        setPreviewColWidths((prev) => ({ ...prev, [colResizeRef.current!.col]: next }));
      }
      if (rowResizeRef.current) {
        const delta = event.clientY - rowResizeRef.current.startY;
        const next = clampRowHeight(rowResizeRef.current.startHeight + delta);
        setPreviewRowHeights((prev) => ({ ...prev, [rowResizeRef.current!.row]: next }));
      }
    };
    const onUp = () => {
      if (colResizeRef.current) {
        const { col, startWidth, startX } = colResizeRef.current;
        const width = previewColWidths[col] ?? clampColumnWidth(startWidth);
        onColumnWidthChange(col, width);
        colResizeRef.current = null;
        setPreviewColWidths({});
      }
      if (rowResizeRef.current) {
        const { row, startHeight, startY } = rowResizeRef.current;
        const height = previewRowHeights[row] ?? clampRowHeight(startHeight);
        onRowHeightChange(row, height);
        rowResizeRef.current = null;
        setPreviewRowHeights({});
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [onColumnWidthChange, onRowHeightChange, previewColWidths, previewRowHeights]);

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
    if (fillRef.current && fillEnd && onFill) onFill(fillRef.current.start, fillEnd);
    fillRef.current = null;
    setFillEnd(null);
    dragRef.current = null;
  };
  const selectionEnd = rangeBounds(anchor, focus).end;

  return (
    <div className="sheet-grid h-full min-h-0 overflow-auto bg-white" onMouseUp={stopDrag} onMouseLeave={stopDrag}>
      <div className="relative min-w-max">
        {chartOverlay}
        <div className="sticky top-0 z-20 flex">
          <button
            type="button"
            aria-label="Select all"
            className="sheet-corner sticky left-0 z-40 shrink-0"
            style={{ top: 0 }}
            onClick={() => onSelect(cellKey(0, 0), cellKey(rows - 1, cols - 1))}
          />
          <div className="flex">
            {visibleCols.map((c) => {
              const col = colName(c);
              const w = widthForCol(c);
              const frozenCol = c < frozenCols;
              return (
                <div key={c} className="relative shrink-0" style={{ width: w }}>
                  <button
                    type="button"
                    aria-label={`Select column ${col}`}
                    style={{
                      width: w,
                      position: 'sticky',
                      top: 0,
                      ...(frozenCol ? { left: stickyLeftForCol(c, sheet, rowHeaderWidth), zIndex: frozenCol ? 35 : 20 } : { zIndex: 20 }),
                    }}
                    data-selected={selection.some((key) => parseKey(key)?.col === c) || undefined}
                    className="sheet-col-header flex w-full items-center justify-center"
                    onClick={() => onSelect(cellKey(0, c), cellKey(rows - 1, c))}
                    onDoubleClick={() => onAutoFitColumn(c)}
                  >
                    {col}
                  </button>
                  <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Resize column ${col}`}
                    className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize hover:bg-[var(--wd-primary)]/40"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      colResizeRef.current = { col: c, startX: e.clientX, startWidth: w };
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
        {visibleRows.map((r) => (
          <div className="flex" key={r}>
            <div
              className="relative sticky shrink-0"
              style={{
                height: heightForRow(r),
                left: 0,
                zIndex: r < frozenRows ? 30 : 10,
                ...(r < frozenRows ? { top: stickyTopForRow(r, sheet, headerHeight) } : {}),
              }}
            >
              <button
                type="button"
                aria-label={`Select row ${r + 1}`}
                style={{ height: heightForRow(r) }}
                data-selected={selection.some((key) => parseKey(key)?.row === r) || undefined}
                className="sheet-row-header flex w-full items-center justify-center"
                onClick={() => onSelect(cellKey(r, 0), cellKey(r, cols - 1))}
              >
                {r + 1}
              </button>
              <div
                role="separator"
                aria-orientation="horizontal"
                aria-label={`Resize row ${r + 1}`}
                className="absolute bottom-0 left-0 z-10 h-1.5 w-full cursor-row-resize hover:bg-[var(--wd-primary)]/40"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  rowResizeRef.current = { row: r, startY: e.clientY, startHeight: heightForRow(r) };
                }}
              />
            </div>
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
                  onMouseEnter={() => {
                    if (fillRef.current) { setFillEnd(key); return; }
                    onCellMouseEnter(key);
                  }}
                  onDoubleClick={() => onBeginEdit(key)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onSelect(key, key);
                    onContextMenu(key, e.clientX, e.clientY);
                  }}
                  style={{
                    ...formatCell(key),
                    ...cellStickyStyle(r, c),
                    width: widthForCol(c),
                    height: heightForRow(r),
                    opacity: filtered ? 0.35 : 1,
                  }}
                  className={`sheet-cell relative overflow-hidden ${gridlines ? 'border' : ''} px-1`}
                >
                  {!isEditingCell ? formulaDisplay(sheet.cells[key], sheet, workbook) : null}
                  {sheet.cells[key]?.note ? (
                    <span className="pointer-events-none absolute right-0 top-0 h-0 w-0 border-l-[6px] border-t-[6px] border-l-transparent border-t-[#f59e0b]" aria-label="Has note" />
                  ) : null}
                  {key === selectionEnd && !isEditingCell ? (
                    <span
                      role="button"
                      aria-label="Fill handle"
                      title="Fill"
                      className="sheet-fill-handle"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        fillRef.current = { start: rangeBounds(anchor, focus).start };
                        setFillEnd(key);
                      }}
                    />
                  ) : null}
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
