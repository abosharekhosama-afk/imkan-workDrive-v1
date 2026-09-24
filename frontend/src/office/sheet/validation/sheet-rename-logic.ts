import type { Workbook } from '../model.ts';

export function validateSheetRename(workbook: Workbook, sheetId: string, nextName: string): string | null {
  const clean = nextName.trim().slice(0, 80);
  if (!clean) return 'Sheet name cannot be empty';
  const clash = workbook.sheets.some((s) => s.id !== sheetId && s.name.toLowerCase() === clean.toLowerCase());
  if (clash) return 'A sheet with this name already exists';
  if (/[\\/?*[\]:]/u.test(clean)) return 'Sheet name contains invalid characters';
  return null;
}
