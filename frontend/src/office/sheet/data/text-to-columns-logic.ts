import { cellKey, parseKey, type SheetCell } from '../model.ts';

export type TextSplitDelimiter = 'comma' | 'tab' | 'semicolon' | 'space' | 'custom';

export function delimiterChar(kind: TextSplitDelimiter, custom?: string): string | RegExp {
  if (kind === 'comma') return ',';
  if (kind === 'tab') return '\t';
  if (kind === 'semicolon') return ';';
  if (kind === 'space') return /\s+/;
  return custom?.slice(0, 1) || ',';
}

export function splitLine(line: string, kind: TextSplitDelimiter, custom?: string): string[] {
  const delim = delimiterChar(kind, custom);
  if (delim instanceof RegExp) return line.split(delim).filter(Boolean);
  return line.split(delim);
}

export function previewTextToColumns(text: string, kind: TextSplitDelimiter, custom?: string, maxRows = 5): string[][] {
  return text.replace(/\r/g, '').split('\n').slice(0, maxRows).map((line) => splitLine(line, kind, custom));
}

export function textToColumnsMatrix(
  cells: Record<string, SheetCell>,
  startKey: string,
  kind: TextSplitDelimiter,
  custom?: string,
): { matrix: string[][]; rowCount: number; colCount: number } {
  const p = parseKey(startKey);
  if (!p) return { matrix: [], rowCount: 0, colCount: 0 };
  const lines: string[] = [];
  for (let r = p.row; r < p.row + 500; r++) {
    const cell = cells[cellKey(r, p.col)];
    const value = cell?.formula ? cell.formula.replace(/^=/, '') : String(cell?.value ?? '');
    if (r > p.row && value === '') break;
    lines.push(value);
  }
  const matrix = lines.map((line) => splitLine(line, kind, custom));
  const colCount = Math.max(1, ...matrix.map((r) => r.length));
  return { matrix, rowCount: matrix.length, colCount };
}

export function destinationOverwriteKeys(
  startKey: string,
  rowCount: number,
  colCount: number,
  cells: Record<string, SheetCell>,
): string[] {
  const p = parseKey(startKey);
  if (!p) return [];
  const keys: string[] = [];
  for (let r = 0; r < rowCount; r++) {
    for (let c = 1; c < colCount; c++) {
      const key = cellKey(p.row + r, p.col + c);
      const existing = cells[key];
      if (existing && (existing.formula || (existing.value != null && String(existing.value) !== ''))) keys.push(key);
    }
  }
  return keys;
}
