import { activeSheet, cellKey, cloneWorkbook, parseKey, type Workbook } from '../model.ts';
import { removeDuplicatesInRange } from '../data/remove-duplicates-logic.ts';
import { textToColumnsMatrix } from '../data/text-to-columns-logic.ts';
import { applyPasteSpecial, type PasteMode } from '../clipboard/paste-special-logic.ts';
import { sortTableByColumn } from '../tables/table-logic.ts';
import { updateTable, deletePivotTable } from '../table-pivot.ts';

export { applyPasteSpecial, type PasteMode } from '../clipboard/paste-special-logic.ts';
export { removeDuplicatesInRange } from '../data/remove-duplicates-logic.ts';

export function setCellNote(workbook: Workbook, key: string, note?: string) {
  const n = cloneWorkbook(workbook);
  const sheet = activeSheet(n);
  if (!sheet) return workbook;
  const cell = sheet.cells[key] ?? { value: null };
  if (!note?.trim()) {
    const next = { ...cell };
    delete next.note;
    if (next.value == null && !next.formula && !next.format && !next.validation) delete sheet.cells[key];
    else sheet.cells[key] = next;
  } else {
    sheet.cells[key] = { ...cell, note: note.trim().slice(0, 500) };
  }
  return n;
}

export function removeDuplicates(
  workbook: Workbook,
  start: string,
  end: string,
  columnIndexes: number[],
  hasHeader: boolean,
) {
  return removeDuplicatesInRange(workbook, start, end, columnIndexes, hasHeader);
}

export function applyTextToColumns(
  workbook: Workbook,
  startKey: string,
  kind: 'comma' | 'tab' | 'semicolon' | 'space' | 'custom',
  custom?: string,
) {
  const n = cloneWorkbook(workbook);
  const sheet = activeSheet(n);
  if (!sheet) return workbook;
  const { matrix } = textToColumnsMatrix(sheet.cells, startKey, kind, custom);
  const p = parseKey(startKey);
  if (!p) return workbook;
  matrix.forEach((row, ri) => {
    row.forEach((value, ci) => {
      const key = cellKey(p.row + ri, p.col + ci);
      const existing = sheet.cells[key];
      sheet.cells[key] = {
        ...(existing ?? { value: null }),
        value: /^[-+]?\d+(\.\d+)?$/.test(value) ? Number(value) : value === '' ? null : value,
        formula: undefined,
      };
    });
  });
  return n;
}

export function pasteSpecialWorkbook(workbook: Workbook, targetStart: string, matrix: Parameters<typeof applyPasteSpecial>[2], mode: PasteMode) {
  return applyPasteSpecial(workbook, targetStart, matrix, mode);
}

export function sortTableWorkbook(
  workbook: Workbook,
  tableId: string,
  colOffset: number,
  direction: 'asc' | 'desc',
) {
  const n = cloneWorkbook(workbook);
  const sheet = activeSheet(n);
  if (!sheet) return workbook;
  const table = sheet.tables?.find((t) => t.id === tableId);
  if (!table) return workbook;
  const sorted = sortTableByColumn(sheet, table, colOffset, direction, n);
  sheet.cells = sorted.cells;
  return n;
}

export function deleteTableById(workbook: Workbook, id: string) {
  const n = cloneWorkbook(workbook);
  const sheet = activeSheet(n);
  if (sheet) sheet.tables = (sheet.tables ?? []).filter((t) => t.id !== id);
  return n;
}

export function updatePivot(workbook: Workbook, id: string, patch: Partial<import('../model.ts').PivotTable>) {
  const n = cloneWorkbook(workbook);
  const sheet = activeSheet(n);
  const pivot = sheet?.pivotTables?.find((p) => p.id === id);
  if (pivot) Object.assign(pivot, patch);
  return n;
}

export { updateTable, deletePivotTable };
