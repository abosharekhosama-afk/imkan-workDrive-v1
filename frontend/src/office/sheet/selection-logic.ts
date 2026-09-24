import { cellKey, colName, parseKey } from './model.ts';

export type SheetSelection = {
  anchor: string;
  focus: string;
};

export function normalizeSelection(anchor: string, focus: string): SheetSelection {
  return { anchor, focus };
}

export function selectedKeys(anchor: string, focus: string): string[] {
  const a = parseKey(anchor);
  const b = parseKey(focus);
  if (!a || !b) return [focus];
  const out: string[] = [];
  for (let r = Math.min(a.row, b.row); r <= Math.max(a.row, b.row); r++) {
    for (let c = Math.min(a.col, b.col); c <= Math.max(a.col, b.col); c++) {
      out.push(cellKey(r, c));
    }
  }
  return out;
}

export function moveCell(key: string, rowDelta: number, colDelta: number, maxRow = 999, maxCol = 25): string | null {
  const p = parseKey(key);
  if (!p) return null;
  const row = p.row + rowDelta;
  const col = p.col + colDelta;
  if (row < 0 || col < 0 || row > maxRow || col > maxCol) return key;
  return cellKey(row, col);
}

export function moveAfterEnter(key: string): string {
  return moveCell(key, 1, 0) ?? key;
}

export function moveAfterTab(key: string, reverse = false): string {
  return moveCell(key, 0, reverse ? -1 : 1) ?? key;
}

export function isPrintableInputKey(key: string): boolean {
  return key.length === 1 && !key.match(/[\x00-\x1F]/);
}

export function selectRow(row: number): SheetSelection {
  return { anchor: cellKey(row, 0), focus: cellKey(row, 25) };
}

export function selectColumn(col: number, maxRow = 99): SheetSelection {
  return { anchor: cellKey(0, col), focus: cellKey(maxRow, col) };
}

export function selectAll(maxRow = 99, maxCol = 25): SheetSelection {
  return { anchor: cellKey(0, 0), focus: cellKey(maxRow, maxCol) };
}

export function columnLabel(col: number): string {
  return colName(col);
}

export function rangeBounds(anchor: string, focus: string): { start: string; end: string } {
  const a = parseKey(anchor);
  const b = parseKey(focus);
  if (!a || !b) return { start: focus, end: focus };
  return {
    start: cellKey(Math.min(a.row, b.row), Math.min(a.col, b.col)),
    end: cellKey(Math.max(a.row, b.row), Math.max(a.col, b.col)),
  };
}
