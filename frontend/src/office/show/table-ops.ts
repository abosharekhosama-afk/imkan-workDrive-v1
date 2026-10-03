import type { ShowDocument, ShowElement } from './model';
import { cloneShow, activeSlide } from './model';

function getTable(d: ShowDocument, id: string): { n: ShowDocument; el: ShowElement } | null {
  const n = cloneShow(d);
  const s = activeSlide(n);
  const el = s?.elements.find((e) => e.id === id);
  if (!el || el.type !== 'table' || !Array.isArray(el.rows)) return null;
  return { n, el };
}

export function setTableCell(d: ShowDocument, id: string, row: number, col: number, text: string): ShowDocument {
  const ctx = getTable(d, id);
  if (!ctx) return d;
  const rows = ctx.el.rows!.map((r) => [...r]);
  if (!rows[row]) return ctx.n;
  rows[row][col] = text;
  ctx.el.rows = rows;
  return ctx.n;
}

export function addTableRow(d: ShowDocument, id: string, after = -1): ShowDocument {
  const ctx = getTable(d, id);
  if (!ctx) return d;
  const cols = ctx.el.rows![0]?.length || 2;
  const row = Array.from({ length: cols }, () => '');
  const rows = [...ctx.el.rows!];
  const idx = after < 0 ? rows.length : after + 1;
  rows.splice(idx, 0, row);
  ctx.el.rows = rows;
  return ctx.n;
}

export function addTableColumn(d: ShowDocument, id: string, after = -1): ShowDocument {
  const ctx = getTable(d, id);
  if (!ctx) return d;
  const rows = ctx.el.rows!.map((r) => {
    const next = [...r];
    const idx = after < 0 ? next.length : after + 1;
    next.splice(idx, 0, '');
    return next;
  });
  ctx.el.rows = rows;
  return ctx.n;
}

export function deleteTableRow(d: ShowDocument, id: string, row: number): ShowDocument {
  const ctx = getTable(d, id);
  if (!ctx || ctx.el.rows!.length <= 1) return d;
  ctx.el.rows = ctx.el.rows!.filter((_, i) => i !== row);
  return ctx.n;
}

export function deleteTableColumn(d: ShowDocument, id: string, col: number): ShowDocument {
  const ctx = getTable(d, id);
  if (!ctx || (ctx.el.rows![0]?.length || 0) <= 1) return d;
  ctx.el.rows = ctx.el.rows!.map((r) => r.filter((_, i) => i !== col));
  return ctx.n;
}

export function toggleTableHeader(d: ShowDocument, id: string): ShowDocument {
  const ctx = getTable(d, id);
  if (!ctx) return d;
  (ctx.el as any).tableHeader = !(ctx.el as any).tableHeader;
  return ctx.n;
}
