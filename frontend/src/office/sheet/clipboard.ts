import { SheetCell } from './model';

export type ClipboardMatrix = { cells: Array<Array<{ value: string; formula?: string; format?: SheetCell['format']; validation?: SheetCell['validation'] }>> };

export function encodeClipboard(matrix: ClipboardMatrix): string {
  return matrix.cells.map(row => row.map(c => c.formula ?? (c.value ?? '')).join('\t')).join('\n');
}

export function decodeClipboard(text: string): string[][] {
  return text.replace(/\r/g,'').split('\n').map(row => row.split('\t'));
}

export function parseClipboardValue(raw: string): {value:string; formula?:string} {
  const value=raw.trimEnd();
  return value.trimStart().startsWith('=') ? {value:'',formula:value.trim()} : {value};
}
