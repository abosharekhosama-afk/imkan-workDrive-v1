import type { ShowDocument, ShowElement } from './model';
import { cloneShow, activeSlide } from './model';

const uid = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export type ClipboardPayload = {
  elements: ShowElement[];
  sourceSlideId: string;
  copiedAt: number;
};

let memory: ClipboardPayload | null = null;

export function copyElementsToClipboard(d: ShowDocument, ids: string[]): ClipboardPayload | null {
  const s = activeSlide(d);
  if (!s || !ids.length) return null;
  const elements = s.elements
    .filter((e) => ids.includes(e.id))
    .map((e) => JSON.parse(JSON.stringify(e)) as ShowElement);
  if (!elements.length) return null;
  memory = { elements, sourceSlideId: s.id, copiedAt: Date.now() };
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('imkan-show-clipboard', JSON.stringify(memory));
    }
  } catch {}
  return memory;
}

export function readClipboard(): ClipboardPayload | null {
  if (memory) return memory;
  try {
    if (typeof sessionStorage !== 'undefined') {
      const raw = sessionStorage.getItem('imkan-show-clipboard');
      if (raw) memory = JSON.parse(raw) as ClipboardPayload;
    }
  } catch {}
  return memory;
}

/** Paste onto the active slide (works across slides in the same session). */
export function pasteElements(d: ShowDocument, offset = 2): { doc: ShowDocument; pastedIds: string[] } {
  const payload = readClipboard();
  const n = cloneShow(d);
  const s = activeSlide(n);
  if (!payload || !s || !payload.elements.length) return { doc: n, pastedIds: [] };
  const pastedIds: string[] = [];
  const copies = payload.elements.map((e) => {
    const id = uid('el');
    pastedIds.push(id);
    return {
      ...JSON.parse(JSON.stringify(e)),
      id,
      x: Math.min(95, (e.x || 0) + offset),
      y: Math.min(95, (e.y || 0) + offset),
    } as ShowElement;
  });
  s.elements = [...s.elements, ...copies];
  return { doc: n, pastedIds };
}

export function cutElements(d: ShowDocument, ids: string[]): ShowDocument {
  copyElementsToClipboard(d, ids);
  const n = cloneShow(d);
  const s = activeSlide(n);
  if (!s) return n;
  s.elements = s.elements.filter((e) => !ids.includes(e.id));
  return n;
}
