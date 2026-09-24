import { cellKey, formulaDisplay, parseKey, type Sheet, type Workbook } from '../model.ts';

export function pivotSourceFields(sheet: Sheet, sourceRange: string, workbook: Workbook): string[] {
  const parts = sourceRange.split(':');
  const a = parseKey(parts[0]);
  const b = parseKey(parts[1] ?? parts[0]);
  if (!a || !b) return [];
  const r0 = Math.min(a.row, b.row);
  const headers: string[] = [];
  for (let c = Math.min(a.col, b.col); c <= Math.max(a.col, b.col); c++) {
    const cell = sheet.cells[cellKey(r0, c)];
    headers.push(cell ? String(formulaDisplay(cell, sheet, workbook)) : `Column${c + 1}`);
  }
  return headers;
}

export const PIVOT_AGGREGATIONS = ['sum', 'count', 'average', 'min', 'max'] as const;
export type PivotAggregation = typeof PIVOT_AGGREGATIONS[number];

export function isPivotAggregation(value: string): value is PivotAggregation {
  return (PIVOT_AGGREGATIONS as readonly string[]).includes(value);
}
