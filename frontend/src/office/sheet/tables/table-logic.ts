import { cellKey, colName, parseKey, type Sheet, type SheetTable, type Workbook } from '../model.ts';
import { formulaDisplay } from '../model.ts';

function bounds(start: string, end: string) {
  const a = parseKey(start);
  const b = parseKey(end);
  if (!a || !b) return null;
  return {
    r0: Math.min(a.row, b.row),
    r1: Math.max(a.row, b.row),
    c0: Math.min(a.col, b.col),
    c1: Math.max(a.col, b.col),
  };
}

export function findTableAtCell(sheet: Sheet, key: string): SheetTable | null {
  const p = parseKey(key);
  if (!p) return null;
  for (const table of sheet.tables ?? []) {
    const b = bounds(table.start, table.end);
    if (!b) continue;
    if (p.row >= b.r0 && p.row <= b.r1 && p.col >= b.c0 && p.col <= b.c1) return table;
  }
  return null;
}

export function tableColumnIndex(table: SheetTable, key: string): number {
  const p = parseKey(key);
  const b = bounds(table.start, table.end);
  if (!p || !b) return -1;
  return p.col - b.c0;
}

export function tableColumnValues(sheet: Sheet, table: SheetTable, colOffset: number, workbook: Workbook): string[] {
  const b = bounds(table.start, table.end);
  if (!b) return [];
  const col = b.c0 + colOffset;
  const startRow = table.hasHeader ? b.r0 + 1 : b.r0;
  const values = new Set<string>();
  for (let r = startRow; r <= b.r1; r++) {
    const cell = sheet.cells[cellKey(r, col)];
    const text = cell ? String(formulaDisplay(cell, sheet, workbook)) : '';
    if (text !== '') values.add(text);
  }
  return [...values].sort((a, b) => a.localeCompare(b));
}

export function validateTableName(sheet: Sheet, name: string, excludeId?: string): string | null {
  const clean = name.trim().replace(/\s+/g, '_').slice(0, 80);
  if (!clean) return 'Table name is required';
  const clash = (sheet.tables ?? []).some((t) => t.id !== excludeId && t.name.toLowerCase() === clean.toLowerCase());
  if (clash) return 'A table with this name already exists';
  return null;
}

export function validateTableRange(start: string, end: string): string | null {
  const a = parseKey(start);
  const b = parseKey(end);
  if (!a || !b) return 'Invalid range';
  if (a.row > b.row || a.col > b.col) return 'Range must be top-left to bottom-right';
  return null;
}

export function resizeTableEnd(table: SheetTable, newEnd: string): SheetTable {
  return { ...table, end: newEnd.toUpperCase() };
}

export function sortTableByColumn(
  sheet: Sheet,
  table: SheetTable,
  colOffset: number,
  direction: 'asc' | 'desc',
  workbook: Workbook,
): Sheet {
  const b = bounds(table.start, table.end);
  if (!b) return sheet;
  const col = b.c0 + colOffset;
  const headerRow = table.hasHeader ? b.r0 : null;
  const dataStart = table.hasHeader ? b.r0 + 1 : b.r0;
  const rows: { idx: number; sortKey: string }[] = [];
  for (let r = dataStart; r <= b.r1; r++) {
    const cell = sheet.cells[cellKey(r, col)];
    rows.push({ idx: r, sortKey: cell ? String(formulaDisplay(cell, sheet, workbook)).toLowerCase() : '' });
  }
  rows.sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0) * (direction === 'asc' ? 1 : -1));
  const nextCells = { ...sheet.cells };
  const rowMap = new Map<number, number>();
  rows.forEach((row, i) => rowMap.set(row.idx, dataStart + i));
  const snapshot: Record<number, Record<number, typeof nextCells[string]>> = {};
  for (let r = dataStart; r <= b.r1; r++) {
    snapshot[r] = {};
    for (let c = b.c0; c <= b.c1; c++) snapshot[r][c] = nextCells[cellKey(r, c)];
  }
  for (const [fromRow, toRow] of rowMap) {
    for (let c = b.c0; c <= b.c1; c++) {
      const src = snapshot[fromRow]?.[c];
      const destKey = cellKey(toRow, c);
      if (src) nextCells[destKey] = { ...src };
      else delete nextCells[destKey];
    }
  }
  if (headerRow != null) {
    /* preserve header row cells */
  }
  return { ...sheet, cells: nextCells };
}
