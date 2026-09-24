import { cellKey, cloneWorkbook, formulaDisplay, parseKey, type Sheet, type SheetCell, type Workbook } from '../model.ts';
import { rangeBounds } from '../selection-logic.ts';

export type PasteMode = 'all' | 'values' | 'formulas' | 'formats';

export type RangeCellData = {
  value: string;
  formula?: string;
  format?: SheetCell['format'];
  validation?: SheetCell['validation'];
};

export function extractRangeData(
  sheet: Sheet,
  workbook: Workbook,
  start: string,
  end: string,
): RangeCellData[][] {
  const b = rangeBounds(start, end);
  const a = parseKey(b.start)!;
  const c = parseKey(b.end)!;
  const out: RangeCellData[][] = [];
  for (let r = Math.min(a.row, c.row); r <= Math.max(a.row, c.row); r++) {
    const row: RangeCellData[] = [];
    for (let col = Math.min(a.col, c.col); col <= Math.max(a.col, c.col); col++) {
      const cell = sheet.cells[cellKey(r, col)];
      row.push({
        value: cell?.formula ? String(formulaDisplay(cell, sheet, workbook)) : String(cell?.value ?? ''),
        formula: cell?.formula,
        format: cell?.format ? { ...cell.format } : undefined,
        validation: cell?.validation ? { ...cell.validation } : undefined,
      });
    }
    out.push(row);
  }
  return out;
}

export function applyPasteSpecial(
  workbook: Workbook,
  targetStart: string,
  matrix: RangeCellData[][],
  mode: PasteMode,
): Workbook {
  const n = cloneWorkbook(workbook);
  const sheet = n.sheets.find((s) => s.id === n.activeSheet);
  const p = parseKey(targetStart);
  if (!sheet || !p || !matrix.length) return workbook;
  matrix.forEach((row, ri) => {
    row.forEach((src, ci) => {
      const key = cellKey(p.row + ri, p.col + ci);
      const existing = sheet.cells[key] ?? { value: null };
      const next: SheetCell = { ...existing };
      if (src.formula && (mode === 'all' || mode === 'formulas')) {
        next.value = null;
        next.formula = src.formula;
      } else if (mode === 'all' || mode === 'values') {
        const raw = src.value;
        next.formula = undefined;
        next.value = /^[-+]?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw === '' ? null : raw;
      }
      if ((mode === 'all' || mode === 'formats') && src.format) next.format = { ...src.format };
      if (mode === 'all' && src.validation) next.validation = { ...src.validation };
      if (next.value == null && !next.formula && !next.format && !next.validation) delete sheet.cells[key];
      else sheet.cells[key] = next;
    });
  });
  return n;
}
