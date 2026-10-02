import type { WriterDocument } from './model';
import {
  addTableColumn,
  addTableRow,
  cloneWriterDocument,
  mergeTableCells,
  removeBlock,
  removeTableColumn,
  removeTableRow,
  setTableCellVerticalAlign,
  splitTableCell,
  toggleTableBorders,
  updateTableOptions,
} from './commands';

export type TableCellRef = { row: number; col: number };

export type TableActionId =
  | 'insert-row-above'
  | 'insert-row-below'
  | 'insert-col-left'
  | 'insert-col-right'
  | 'delete-row'
  | 'delete-col'
  | 'merge'
  | 'split'
  | 'borders'
  | 'delete-table'
  | 'header-row'
  | 'valign-top'
  | 'valign-middle'
  | 'valign-bottom'
  | 'select-all';

function primaryCell(selection: TableCellRef[]): TableCellRef {
  if (!selection.length) return { row: 0, col: 0 };
  const rows = selection.map((c) => c.row);
  const cols = selection.map((c) => c.col);
  return { row: Math.min(...rows), col: Math.min(...cols) };
}

function maxCell(selection: TableCellRef[]): TableCellRef {
  if (!selection.length) return { row: 0, col: 0 };
  return {
    row: Math.max(...selection.map((c) => c.row)),
    col: Math.max(...selection.map((c) => c.col)),
  };
}

/** Apply a table action relative to the current cell selection (Zoho-like). */
export function applyTableAction(
  doc: WriterDocument,
  blockId: string,
  action: TableActionId,
  selection: TableCellRef[],
): { document: WriterDocument; selection: TableCellRef[] } {
  const block = doc.blocks.find((b) => b.id === blockId);
  if (!block?.table) return { document: doc, selection };

  const anchor = primaryCell(selection);
  const extent = maxCell(selection);
  const rows = block.table.rows.length;
  const cols = block.table.rows[0]?.length || 0;

  switch (action) {
    case 'insert-row-above':
      return { document: addTableRow(doc, blockId, anchor.row), selection: selection.map((c) => ({ row: c.row + 1, col: c.col })) };
    case 'insert-row-below':
      return { document: addTableRow(doc, blockId, extent.row + 1), selection };
    case 'insert-col-left':
      return { document: addTableColumn(doc, blockId, anchor.col), selection: selection.map((c) => ({ row: c.row, col: c.col + 1 })) };
    case 'insert-col-right':
      return { document: addTableColumn(doc, blockId, extent.col + 1), selection };
    case 'delete-row': {
      if (rows <= 1) return { document: doc, selection };
      // Delete all selected rows (unique), from bottom to top
      const uniqueRows = [...new Set(selection.map((c) => c.row))].sort((a, b) => b - a);
      let next = doc;
      for (const r of uniqueRows) {
        if ((next.blocks.find((b) => b.id === blockId)?.table?.rows.length || 0) <= 1) break;
        next = removeTableRow(next, blockId, r);
      }
      const focusRow = Math.min(anchor.row, (next.blocks.find((b) => b.id === blockId)?.table?.rows.length || 1) - 1);
      return { document: next, selection: [{ row: Math.max(0, focusRow), col: anchor.col }] };
    }
    case 'delete-col': {
      if (cols <= 1) return { document: doc, selection };
      const uniqueCols = [...new Set(selection.map((c) => c.col))].sort((a, b) => b - a);
      let next = doc;
      for (const c of uniqueCols) {
        if ((next.blocks.find((b) => b.id === blockId)?.table?.rows[0]?.length || 0) <= 1) break;
        next = removeTableColumn(next, blockId, c);
      }
      const focusCol = Math.min(anchor.col, (next.blocks.find((b) => b.id === blockId)?.table?.rows[0]?.length || 1) - 1);
      return { document: next, selection: [{ row: anchor.row, col: Math.max(0, focusCol) }] };
    }
    case 'merge': {
      if (selection.length < 2) return { document: doc, selection };
      const next = mergeTableCells(doc, blockId, selection);
      return { document: next, selection: [anchor] };
    }
    case 'split': {
      const next = splitTableCell(doc, blockId, anchor.row, anchor.col);
      return { document: next, selection: [anchor] };
    }
    case 'borders':
      return { document: toggleTableBorders(doc, blockId), selection };
    case 'delete-table':
      return { document: removeBlock(doc, blockId), selection: [] };
    case 'header-row': {
      const current = block.table.headerRows || 0;
      const patched = { ...block.table, headerRows: current > 0 ? 0 : 1, repeatHeaderRow: current > 0 ? false : true };
      const next = updateTableOptions(doc, blockId, patched);
      return { document: next, selection };
    }
    case 'valign-top':
    case 'valign-middle':
    case 'valign-bottom': {
      const align = action === 'valign-top' ? 'top' : action === 'valign-middle' ? 'middle' : 'bottom';
      let next = doc;
      const targets = selection.length ? selection : [anchor];
      for (const cell of targets) {
        next = setTableCellVerticalAlign(next, blockId, cell.row, cell.col, align);
      }
      return { document: next, selection };
    }
    case 'select-all': {
      const all: TableCellRef[] = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) all.push({ row: r, col: c });
      return { document: doc, selection: all };
    }
    default:
      return { document: doc, selection };
  }
}

/**
 * Next cell for Tab / Shift+Tab navigation inside a table.
 * Skips hidden (merged) cells. Wraps to next/previous row.
 * At end of table + Tab → null (caller may insert a row or move outside).
 */
export function nextTableCell(
  doc: WriterDocument,
  blockId: string,
  row: number,
  col: number,
  direction: 1 | -1,
): TableCellRef | null {
  const table = doc.blocks.find((b) => b.id === blockId)?.table;
  if (!table?.rows.length) return null;
  const rowCount = table.rows.length;
  const colCount = table.rows[0]?.length || 0;
  let r = row;
  let c = col + direction;
  for (let guard = 0; guard < rowCount * colCount + 2; guard++) {
    if (c >= colCount) {
      r += 1;
      c = 0;
    } else if (c < 0) {
      r -= 1;
      c = colCount - 1;
    }
    if (r < 0 || r >= rowCount) return null;
    const cell = table.rows[r]?.[c];
    if (cell && !cell.hidden) return { row: r, col: c };
    c += direction;
  }
  return null;
}

/** Whether the selected cells form a rectangle eligible for merge. */
export function canMergeSelection(doc: WriterDocument, blockId: string, selection: TableCellRef[]): boolean {
  if (selection.length < 2) return false;
  const table = doc.blocks.find((b) => b.id === blockId)?.table;
  if (!table) return false;
  const rows = selection.map((x) => x.row);
  const cols = selection.map((x) => x.col);
  const minRow = Math.min(...rows);
  const maxRow = Math.max(...rows);
  const minCol = Math.min(...cols);
  const maxCol = Math.max(...cols);
  const expected = (maxRow - minRow + 1) * (maxCol - minCol + 1);
  if (selection.length !== expected) return false;
  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      const cell = table.rows[r]?.[c];
      if (!cell || cell.hidden) return false;
      if ((cell.colSpan || 1) !== 1 || (cell.rowSpan || 1) !== 1) return false;
    }
  }
  return true;
}

export function canSplitSelection(doc: WriterDocument, blockId: string, selection: TableCellRef[]): boolean {
  if (selection.length !== 1) return false;
  const cell = doc.blocks.find((b) => b.id === blockId)?.table?.rows[selection[0].row]?.[selection[0].col];
  if (!cell || cell.hidden) return false;
  return (cell.colSpan || 1) > 1 || (cell.rowSpan || 1) > 1;
}
