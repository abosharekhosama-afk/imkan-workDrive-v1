import type { OfficeOperationPatch } from '@/lib/api/office';
import { cellPatch, sheetPatch } from './collaboration-v2';
import { officeEqual } from './performance';

function path(parts: string[]) {
  return '/' + parts.map(encodeURIComponent).join('/');
}

export function patchPathsOverlap(a: string, b: string): boolean {
  const norm = (p: string) => p.replace(/\/+$/, '') || '/';
  const x = norm(a);
  const y = norm(b);
  return x === y || x.startsWith(`${y}/`) || y.startsWith(`${x}/`);
}

export function diffGenericDocument(previous: unknown, next: unknown): OfficeOperationPatch[] {
  const patches: OfficeOperationPatch[] = [];
  const walk = (a: unknown, b: unknown, parts: string[], depth = 0) => {
    if (officeEqual(a, b)) return;
    if (depth > 5 || a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
      patches.push({ op: 'set', path: path(parts), value: structuredClone(b) });
      return;
    }
    if (Array.isArray(a) || Array.isArray(b)) {
      patches.push({ op: 'set', path: path(parts), value: structuredClone(b) });
      return;
    }
    const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
    for (const k of keys) {
      if (!(k in (b as object))) patches.push({ op: 'delete', path: path([...parts, k]) });
      else walk((a as Record<string, unknown>)?.[k], (b as Record<string, unknown>)[k], [...parts, k], depth + 1);
    }
  };
  walk(previous, next, []);
  return patches.filter((p) => p.path !== '/');
}

export function diffSheetDocument(previous: any, next: any): OfficeOperationPatch[] {
  if (String(next?.type) !== 'SHEET') return diffGenericDocument(previous, next);

  const patches: OfficeOperationPatch[] = [];
  if (previous?.title !== next?.title) patches.push({ op: 'set', path: '/title', value: next?.title ?? 'Untitled spreadsheet' });
  if (previous?.activeSheet !== next?.activeSheet) patches.push({ op: 'set', path: '/activeSheet', value: next?.activeSheet });

  const prevSheets: any[] = Array.isArray(previous?.sheets) ? previous.sheets : [];
  const nextSheets: any[] = Array.isArray(next?.sheets) ? next.sheets : [];
  const prevById = new Map(prevSheets.map((sheet) => [sheet.id, sheet]));

  if (!officeEqual(prevSheets.map((sheet) => sheet.id), nextSheets.map((sheet) => sheet.id))) {
    patches.push({ op: 'set', path: '/sheetOrder', value: nextSheets.map((sheet) => sheet.id) });
  }

  for (const sheet of nextSheets) {
    const prev = prevById.get(sheet.id);
    if (!prev) {
      patches.push(sheetPatch(sheet.id, sheet));
      continue;
    }

    const prevCells = prev.cells ?? {};
    const nextCells = sheet.cells ?? {};
    for (const key of new Set([...Object.keys(prevCells), ...Object.keys(nextCells)])) {
      if (officeEqual(prevCells[key], nextCells[key])) continue;
      if (!(key in nextCells)) patches.push({ op: 'delete', path: `/sheetsById/${encodeURIComponent(sheet.id)}/cells/${encodeURIComponent(key)}` });
      else patches.push(cellPatch(sheet.id, key, nextCells[key]));
    }

    const stripCells = (value: any) => {
      const { cells, ...rest } = value;
      return rest;
    };
    if (!officeEqual(stripCells(prev), stripCells(sheet))) patches.push(sheetPatch(sheet.id, sheet));
  }

  for (const prev of prevSheets) {
    if (!nextSheets.some((sheet) => sheet.id === prev.id)) {
      patches.push({ op: 'delete', path: `/sheetsById/${encodeURIComponent(prev.id)}` });
    }
  }

  return patches;
}

export function diffOfficeDocuments(previous: unknown, next: unknown): OfficeOperationPatch[] {
  if (next && typeof next === 'object' && (next as { type?: string }).type === 'SHEET') {
    return diffSheetDocument(previous as any, next as any);
  }
  return diffGenericDocument(previous, next);
}
