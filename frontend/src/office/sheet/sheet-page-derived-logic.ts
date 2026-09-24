import { destinationOverwriteKeys, previewTextToColumns, textToColumnsMatrix } from './data/text-to-columns-logic.ts';
import { parseKey, type Sheet, type Workbook } from './model.ts';
import { rangeBounds } from './selection-logic.ts';
import { hiddenTableRows } from './tables/table-filter-logic.ts';

function colNameFor(n: number): string {
  let s = '';
  for (let x = n + 1; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

export function duplicateColumnsForSheet(
  sheet: Sheet | undefined,
  anchor: string,
  selected: string,
): { index: number; label: string }[] {
  if (!sheet) return [];
  const b = rangeBounds(anchor, selected);
  const a = parseKey(b.start);
  const c = parseKey(b.end);
  if (!a || !c) return [];
  const c0 = Math.min(a.col, c.col);
  const c1 = Math.max(a.col, c.col);
  return Array.from({ length: c1 - c0 + 1 }, (_, i) => ({ index: i, label: colNameFor(c0 + i) }));
}

export function textSplitPreviewForSheet(sheet: Sheet | undefined, selected: string): string[][] {
  if (!sheet) return [];
  const source = sheet.cells[selected];
  const text = source?.formula ? source.formula.replace(/^=/, '') : String(source?.value ?? '');
  return previewTextToColumns(text, 'comma');
}

export function textOverwriteCountForSheet(sheet: Sheet | undefined, selected: string): number {
  if (!sheet) return 0;
  const { rowCount, colCount } = textToColumnsMatrix(sheet.cells, selected, 'comma');
  return destinationOverwriteKeys(selected, rowCount, colCount, sheet.cells).length;
}

export function hiddenTableRowsForSheet(sheet: Sheet | undefined, doc: Workbook | null): Set<number> {
  if (!sheet || !doc) return new Set<number>();
  return hiddenTableRows(sheet, doc);
}
