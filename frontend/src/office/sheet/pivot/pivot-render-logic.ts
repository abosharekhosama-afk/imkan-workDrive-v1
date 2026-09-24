import { cellKey, parseKey, type PivotTable, type Sheet, type Workbook } from '../model.ts';
import { buildPivot } from '../table-pivot.ts';

function inRange(key: string, range?: string): boolean {
  if (!range) return false;
  const parts = range.split(':');
  const a = parseKey(parts[0]);
  const b = parseKey(parts[1] ?? parts[0]);
  const p = parseKey(key);
  if (!a || !b || !p) return false;
  return (
    p.row >= Math.min(a.row, b.row) &&
    p.row <= Math.max(a.row, b.row) &&
    p.col >= Math.min(a.col, b.col) &&
    p.col <= Math.max(a.col, b.col)
  );
}

export function findPivotAtCell(sheet: Sheet, key: string): PivotTable | null {
  for (const pivot of sheet.pivotTables ?? []) {
    if (inRange(key, pivot.destinationRange)) return pivot;
  }
  return null;
}

export function defaultPivotDestination(sourceRange: string): string {
  const parts = sourceRange.split(':');
  const b = parseKey(parts[1] ?? parts[0]);
  if (!b) return 'E1';
  return cellKey(b.row, Math.min(b.col + 2, 25));
}

export function refreshPivotToSheet(workbook: Workbook, pivotId: string): Workbook {
  const n = structuredClone(workbook) as Workbook;
  const sheet = n.sheets.find((s) => s.id === n.activeSheet);
  const pivot = sheet?.pivotTables?.find((p) => p.id === pivotId);
  if (!sheet || !pivot?.destinationRange) return workbook;
  const result = buildPivot(sheet, pivot, n);
  const start = parseKey(pivot.destinationRange.split(':')[0]);
  if (!start) return workbook;

  result.headers.forEach((header, ci) => {
    sheet.cells[cellKey(start.row, start.col + ci)] = { value: header, format: { bold: true, background: '#f3f5f7' } };
  });
  result.rows.forEach((row, ri) => {
    row.forEach((value, ci) => {
      sheet.cells[cellKey(start.row + ri + 1, start.col + ci)] = {
        value: typeof value === 'number' ? value : String(value),
      };
    });
  });
  const totalRow = start.row + result.rows.length + 1;
  sheet.cells[cellKey(totalRow, start.col)] = { value: 'Grand Total', format: { bold: true } };
  sheet.cells[cellKey(totalRow, start.col + 1)] = { value: result.grandTotal, format: { bold: true } };
  return n;
}
