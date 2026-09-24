import { colName, type Sheet } from './model.ts';
import { columnWidth, rowHeight } from './dimension-logic.ts';

export function freezeOffsets(sheet: Sheet, rows: number, cols: number) {
  const frozenRows = sheet.frozenRows ?? 0;
  const frozenCols = sheet.frozenColumns ?? 0;
  let top = 32;
  for (let r = 0; r < frozenRows; r++) top += rowHeight(sheet, r);
  let left = 48;
  for (let c = 0; c < frozenCols; c++) left += columnWidth(sheet, c);
  return { frozenRows, frozenCols, headerTop: 32, topOffset: top, leftOffset: left };
}

export function isFrozenCell(row: number, col: number, frozenRows: number, frozenCols: number): boolean {
  return row < frozenRows || col < frozenCols;
}

export function stickyTopForRow(row: number, sheet: Sheet, headerHeight = 32): number {
  const frozenRows = sheet.frozenRows ?? 0;
  if (row >= frozenRows) return headerHeight;
  let top = headerHeight;
  for (let r = 0; r < row; r++) top += rowHeight(sheet, r);
  return top;
}

export function stickyLeftForCol(col: number, sheet: Sheet, rowHeaderWidth = 48): number {
  const frozenCols = sheet.frozenColumns ?? 0;
  if (col >= frozenCols) return rowHeaderWidth;
  let left = rowHeaderWidth;
  for (let c = 0; c < col; c++) left += columnWidth(sheet, c);
  return left;
}
