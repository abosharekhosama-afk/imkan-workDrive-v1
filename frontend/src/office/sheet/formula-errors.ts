export type FormulaErrorCode = '#VALUE!' | '#DIV/0!' | '#REF!' | '#NAME?' | '#NUM!' | '#N/A' | '#ERROR!';

export function formulaErrorCode(error: unknown): FormulaErrorCode {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  if (msg === 'function') return '#NAME?';
  if (msg === 'cycle') return '#REF!';
  if (msg === 'formula' || msg === 'unsafe') return '#VALUE!';
  if (msg === 'IF' || msg === 'COUNTIFS' || msg === 'SUMIFS') return '#VALUE!';
  return '#ERROR!';
}

export function isFormulaError(value: unknown): value is FormulaErrorCode {
  return typeof value === 'string' && /^#(?:VALUE!|DIV\/0!|REF!|NAME\?|NUM!|N\/A|ERROR!)$/.test(value);
}

export function previewFormulaError(formula: string, error: unknown): FormulaErrorCode {
  if (!formula.trim().startsWith('=')) return '#VALUE!';
  const fn = formula.trim().slice(1).match(/^([A-Z][A-Z0-9_.]*)\(/i)?.[1]?.toUpperCase();
  if (fn && error instanceof Error && error.message === 'function') return '#NAME?';
  return formulaErrorCode(error);
}
