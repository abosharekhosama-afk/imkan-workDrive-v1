import { cellKey, colName, formulaDisplay, type Sheet, type Workbook } from './model.ts';

const MIN_COL_WIDTH = 60;
const MAX_COL_WIDTH = 420;
const MIN_ROW_HEIGHT = 22;
const MAX_ROW_HEIGHT = 100;
const DEFAULT_COL_WIDTH = 112;
const DEFAULT_ROW_HEIGHT = 28;

export function clampColumnWidth(width: number): number {
  return Math.max(MIN_COL_WIDTH, Math.min(MAX_COL_WIDTH, Math.round(width)));
}

export function clampRowHeight(height: number): number {
  return Math.max(MIN_ROW_HEIGHT, Math.min(MAX_ROW_HEIGHT, Math.round(height)));
}

/** Rough text width estimate for auto-fit (px at ~7px per character + padding). */
export function estimateTextWidth(text: string, fontSize = 10): number {
  const avg = Math.max(6, fontSize * 0.62);
  return Math.ceil(text.length * avg) + 16;
}

export function autoFitColumnWidth(
  sheet: Sheet,
  col: number,
  workbook: Workbook,
  maxRow: number,
): number {
  const label = colName(col);
  let width = estimateTextWidth(label, 11);
  for (let r = 0; r < maxRow; r++) {
    const cell = sheet.cells[cellKey(r, col)];
    if (!cell) continue;
    const text = cell.formula
      ? formulaDisplay(cell, sheet, workbook)
      : cell.value == null
        ? ''
        : String(cell.value);
    width = Math.max(width, estimateTextWidth(text, cell.format?.fontSize ?? 10));
  }
  return clampColumnWidth(width);
}

export function columnWidth(sheet: Sheet, col: number): number {
  return sheet.columnWidths?.[colName(col)] ?? DEFAULT_COL_WIDTH;
}

export function rowHeight(sheet: Sheet, row: number): number {
  return sheet.rowHeights?.[row] ?? DEFAULT_ROW_HEIGHT;
}
