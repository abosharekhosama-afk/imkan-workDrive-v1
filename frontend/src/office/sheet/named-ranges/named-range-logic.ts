import { parseKey, type NamedRange, type Workbook } from '../model.ts';

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_.]*$/;

export function validateNamedRangeName(name: string, existing: NamedRange[], excludeName?: string): string | null {
  const clean = name.trim().replace(/\s+/g, '_').slice(0, 80);
  if (!clean) return 'Name is required';
  if (!NAME_RE.test(clean)) return 'Name must start with a letter and contain only letters, numbers, or _';
  if (existing.some((r) => r.name.toLowerCase() === clean.toLowerCase() && r.name.toLowerCase() !== (excludeName ?? '').toLowerCase())) {
    return 'A named range with this name already exists';
  }
  return null;
}

export function validateNamedRangeReference(reference: string): string | null {
  const parts = reference.trim().toUpperCase().split(':');
  const a = parseKey(parts[0]);
  const b = parseKey(parts[1] ?? parts[0]);
  if (!a || !b) return 'Invalid range reference';
  if (a.row > b.row || a.col > b.col) return 'Range must be top-left to bottom-right';
  return null;
}

export function resolveNamedRange(workbook: Workbook, name: string, sheetId?: string): NamedRange | null {
  const clean = name.trim();
  return (
    workbook.namedRanges?.find(
      (r) => r.name.toLowerCase() === clean.toLowerCase() && (!r.scopeSheetId || !sheetId || r.scopeSheetId === sheetId),
    ) ?? null
  );
}
