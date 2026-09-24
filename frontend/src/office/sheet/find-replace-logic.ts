import { cellKey, colName, formulaDisplay, parseKey, type Sheet, type Workbook } from './model.ts';

export type FindScope = 'values' | 'formulas' | 'both';

export function sheetCellKeys(rows: number, cols: number): string[] {
  const out: string[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push(cellKey(r, c));
  return out;
}

export function cellSearchText(
  sheet: Sheet,
  workbook: Workbook,
  key: string,
  scope: FindScope,
): string {
  const cell = sheet.cells[key];
  if (!cell) return '';
  if (scope === 'formulas') return cell.formula ?? '';
  if (scope === 'values') return cell.formula ? String(formulaDisplay(cell, sheet, workbook)) : String(cell.value ?? '');
  const display = cell.formula ? String(formulaDisplay(cell, sheet, workbook)) : String(cell.value ?? '');
  return `${display}\n${cell.formula ?? ''}`;
}

export function findNextCell(
  sheet: Sheet,
  workbook: Workbook,
  query: string,
  startKey: string,
  rows: number,
  cols: number,
  scope: FindScope = 'both',
  caseSensitive = false,
): string | null {
  const needle = caseSensitive ? query : query.toLowerCase();
  if (!needle.trim()) return null;
  const keys = sheetCellKeys(rows, cols);
  const startIdx = Math.max(0, keys.indexOf(startKey));
  for (let offset = 1; offset <= keys.length; offset++) {
    const key = keys[(startIdx + offset) % keys.length];
    const hay = caseSensitive ? cellSearchText(sheet, workbook, key, scope) : cellSearchText(sheet, workbook, key, scope).toLowerCase();
    if (hay.includes(needle)) return key;
  }
  return null;
}

export function findPreviousCell(
  sheet: Sheet,
  workbook: Workbook,
  query: string,
  startKey: string,
  rows: number,
  cols: number,
  scope: FindScope = 'both',
  caseSensitive = false,
): string | null {
  const needle = caseSensitive ? query : query.toLowerCase();
  if (!needle.trim()) return null;
  const keys = sheetCellKeys(rows, cols);
  const startIdx = Math.max(0, keys.indexOf(startKey));
  for (let offset = 1; offset <= keys.length; offset++) {
    const key = keys[(startIdx - offset + keys.length) % keys.length];
    const hay = caseSensitive ? cellSearchText(sheet, workbook, key, scope) : cellSearchText(sheet, workbook, key, scope).toLowerCase();
    if (hay.includes(needle)) return key;
  }
  return null;
}

export function replaceCellText(
  sheet: Sheet,
  workbook: Workbook,
  key: string,
  find: string,
  replace: string,
  scope: FindScope,
  caseSensitive = false,
): { value: string; formula?: string } | null {
  const cell = sheet.cells[key];
  if (!cell || !find) return null;
  const replaceIn = (text: string) => {
    if (caseSensitive) return text.includes(find) ? text.split(find).join(replace) : text;
    const re = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    return re.test(text) ? text.replace(re, replace) : text;
  };
  if (cell.formula && (scope === 'formulas' || scope === 'both')) {
    const next = replaceIn(cell.formula);
    if (next !== cell.formula) return { value: '', formula: next };
  }
  const raw = cell.formula ? String(formulaDisplay(cell, sheet, workbook)) : String(cell.value ?? '');
  if (scope === 'values' || scope === 'both') {
    const next = replaceIn(raw);
    if (next !== raw) {
      if (cell.formula) return { value: '', formula: next.startsWith('=') ? next : `=${next}` };
      return { value: next };
    }
  }
  return null;
}

export function autoSumRange(start: string, end: string): string {
  return `=SUM(${start}:${end})`;
}
