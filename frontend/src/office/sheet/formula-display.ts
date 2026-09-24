import { evalFormula, type CellValue, type Sheet, type SheetCell, type Workbook } from './model.ts';
import { formatCellValue } from './format-display.ts';
import { formulaErrorCode } from './formula-errors.ts';

export function formulaDisplay(cell: SheetCell | undefined, sheet: Sheet, workbook?: Workbook): string {
  if (!cell) return '';
  if (!cell.formula) return formatCellValue(cell.value, cell.format);
  try {
    const result = evalFormula(cell.formula, sheet, new Set(), workbook);
    if (typeof result === 'string' && /^#(?:VALUE!|DIV\/0!|REF!|NAME\?|NUM!|N\/A|ERROR!)$/.test(result)) return result;
    return formatCellValue(result as CellValue, cell.format);
  } catch (e) {
    return formulaErrorCode(e);
  }
}
