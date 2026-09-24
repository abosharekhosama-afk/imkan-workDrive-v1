import { cellKey, cloneWorkbook, formulaDisplay, parseKey, type Sheet, type Workbook } from '../model.ts';
import { rangeBounds } from '../selection-logic.ts';

export function removeDuplicatesInRange(
  workbook: Workbook,
  start: string,
  end: string,
  columnIndexes: number[],
  hasHeader: boolean,
): { workbook: Workbook; removed: number } {
  const n = cloneWorkbook(workbook);
  const sheet = n.sheets.find((s) => s.id === n.activeSheet);
  if (!sheet) return { workbook, removed: 0 };
  const b = rangeBounds(start, end);
  const a = parseKey(b.start)!;
  const c = parseKey(b.end)!;
  const r0 = Math.min(a.row, c.row);
  const r1 = Math.max(a.row, c.row);
  const c0 = Math.min(a.col, c.col);
  const c1 = Math.max(a.col, c.col);
  const cols = columnIndexes.length ? columnIndexes.map((i) => c0 + i) : Array.from({ length: c1 - c0 + 1 }, (_, i) => c0 + i);
  const dataStart = hasHeader ? r0 + 1 : r0;
  const seen = new Set<string>();
  const keepRows = new Set<number>();
  if (hasHeader) keepRows.add(r0);
  for (let r = dataStart; r <= r1; r++) {
    const key = cols.map((col) => {
      const cell = sheet.cells[cellKey(r, col)];
      return cell ? String(formulaDisplay(cell, sheet, n)) : '';
    }).join('\u0001');
    if (seen.has(key)) continue;
    seen.add(key);
    keepRows.add(r);
  }
  const removed = Math.max(0, r1 - r0 + 1 - keepRows.size);
  if (!removed) return { workbook: n, removed: 0 };
  const next = compactRows(sheet, r0, r1, keepRows);
  sheet.cells = next;
  return { workbook: n, removed };
}

function compactRows(sheet: Sheet, r0: number, r1: number, keepRows: Set<number>) {
  const ordered = [...keepRows].sort((a, b) => a - b);
  const rowMap = new Map<number, number>();
  ordered.forEach((row, idx) => rowMap.set(row, r0 + idx));
  const nextCells = { ...sheet.cells };
  const snapshot: Record<number, Record<number, (typeof nextCells)[string]>> = {};
  for (let r = r0; r <= r1; r++) {
    snapshot[r] = {};
    for (const [key, cell] of Object.entries(nextCells)) {
      const p = parseKey(key);
      if (!p || p.row !== r) continue;
      snapshot[r][p.col] = cell;
    }
  }
  for (let r = r0; r <= r1; r++) {
    for (const [key] of Object.entries(nextCells)) {
      const p = parseKey(key);
      if (p?.row === r) delete nextCells[key];
    }
  }
  for (const [fromRow, toRow] of rowMap) {
    for (const [col, cell] of Object.entries(snapshot[fromRow] ?? {})) {
      nextCells[cellKey(toRow, Number(col))] = { ...cell };
    }
  }
  return nextCells;
}
