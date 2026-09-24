import type { CellFormat, CellValue, NumberFormat } from './model.ts';

export function formatCellValue(value: CellValue, format?: CellFormat): string {
  if (value === null || value === '') return '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  const nf: NumberFormat = format?.numberFormat ?? 'general';
  const decimals = format?.decimals ?? (nf === 'number' || nf === 'currency' || nf === 'accounting' ? 2 : 0);
  const n = typeof value === 'number' ? value : Number(value);
  if (nf === 'general') return String(value);
  if (nf === 'number') return Number.isFinite(n) ? n.toFixed(decimals) : String(value);
  if (nf === 'currency') return Number.isFinite(n) ? `$${n.toFixed(decimals)}` : String(value);
  if (nf === 'accounting') {
    if (!Number.isFinite(n)) return String(value);
    const abs = Math.abs(n).toFixed(decimals);
    return n < 0 ? `($${abs})` : `$${abs}`;
  }
  if (nf === 'percent') return Number.isFinite(n) ? `${(n * 100).toFixed(decimals)}%` : String(value);
  if (nf === 'scientific') return Number.isFinite(n) ? n.toExponential(decimals || 2) : String(value);
  if (nf === 'date') {
    const d = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(d.getTime()) ? String(value) : d.toISOString().slice(0, 10);
  }
  if (nf === 'time') {
    const d = new Date(`1970-01-01T${String(value)}`);
    return Number.isNaN(d.getTime()) ? String(value) : d.toISOString().slice(11, 19);
  }
  if (nf === 'datetime') {
    const d = new Date(String(value));
    return Number.isNaN(d.getTime()) ? String(value) : d.toISOString().replace('T', ' ').slice(0, 19);
  }
  return String(value);
}

export const NUMBER_FORMAT_OPTIONS: { value: NumberFormat; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Currency' },
  { value: 'accounting', label: 'Accounting' },
  { value: 'percent', label: 'Percentage' },
  { value: 'date', label: 'Date' },
  { value: 'time', label: 'Time' },
  { value: 'datetime', label: 'Date & Time' },
  { value: 'scientific', label: 'Scientific' },
];
