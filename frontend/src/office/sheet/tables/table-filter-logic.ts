import { cellKey, formulaDisplay, parseKey, type Sheet, type SheetTable, type Workbook } from '../model.ts';
import { tableHeaders } from '../table-pivot.ts';

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

function cellText(sheet: Sheet, row: number, col: number, workbook: Workbook): string {
  const cell = sheet.cells[cellKey(row, col)];
  return cell ? String(formulaDisplay(cell, sheet, workbook)) : '';
}

/** Row indices within the table range that should render when filters are active. */
export function visibleTableRows(sheet: Sheet, table: SheetTable, workbook: Workbook): number[] {
  const b = bounds(table.start, table.end);
  if (!b) return [];
  const headers = tableHeaders(sheet, table, workbook);
  const filter = table.filter ?? {};
  const filterKeys = Object.keys(filter);
  const dataStart = table.hasHeader ? b.r0 + 1 : b.r0;
  const rows: number[] = [];
  if (table.hasHeader) rows.push(b.r0);

  for (let r = dataStart; r <= b.r1; r++) {
    if (!filterKeys.length) {
      rows.push(r);
      continue;
    }
    let keep = true;
    for (const [header, encoded] of Object.entries(filter)) {
      const colOffset = headers.indexOf(header);
      if (colOffset < 0) continue;
      const allowed = encoded.split('\u0001').filter(Boolean);
      if (!allowed.length) continue;
      const text = cellText(sheet, r, b.c0 + colOffset, workbook);
      if (!allowed.includes(text)) {
        keep = false;
        break;
      }
    }
    if (keep) rows.push(r);
  }
  return rows;
}

/** Source row indices hidden by any active table filter on the sheet. */
export function hiddenTableRows(sheet: Sheet, workbook: Workbook): Set<number> {
  const hidden = new Set<number>();
  for (const table of sheet.tables ?? []) {
    if (!table.filter || !Object.keys(table.filter).length) continue;
    const visible = new Set(visibleTableRows(sheet, table, workbook));
    const b = bounds(table.start, table.end);
    if (!b) continue;
    for (let r = b.r0; r <= b.r1; r++) {
      if (!visible.has(r)) hidden.add(r);
    }
  }
  return hidden;
}

export function isTableRowVisible(sheet: Sheet, table: SheetTable, row: number, workbook: Workbook): boolean {
  return visibleTableRows(sheet, table, workbook).includes(row);
}
