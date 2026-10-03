import type { ShowElement } from './model';

export type QuickStyle = {
  id: string;
  label: string;
  /** Partial element style applied on top of current element */
  apply: Partial<ShowElement>;
};

export const TEXT_QUICK_STYLES: QuickStyle[] = [
  { id: 'title', label: 'Title', apply: { fontSize: 36, bold: true, color: '#111827', align: 'center' } },
  { id: 'subtitle', label: 'Subtitle', apply: { fontSize: 22, bold: false, color: '#475569', align: 'center' } },
  { id: 'body', label: 'Body', apply: { fontSize: 18, bold: false, color: '#334155', align: 'start' } },
  { id: 'caption', label: 'Caption', apply: { fontSize: 13, italic: true, color: '#64748b', align: 'start' } },
  { id: 'accent', label: 'Accent', apply: { fontSize: 20, bold: true, color: '#2563eb' } },
];

export const SHAPE_QUICK_STYLES: QuickStyle[] = [
  { id: 'card', label: 'Card', apply: { fill: '#ffffff', border: true, shape: 'roundRect', color: '#111827' } },
  { id: 'primary', label: 'Primary', apply: { fill: '#2563eb', border: false, shape: 'roundRect', color: '#ffffff' } },
  { id: 'soft', label: 'Soft', apply: { fill: '#e0f2fe', border: false, shape: 'roundRect', color: '#0c4a6e' } },
  { id: 'dark', label: 'Dark', apply: { fill: '#0f172a', border: false, shape: 'rect', color: '#f8fafc' } },
  { id: 'outline', label: 'Outline', apply: { fill: 'transparent', border: true, shape: 'roundRect', color: '#2563eb' } },
  { id: 'pill', label: 'Pill', apply: { fill: '#dbeafe', border: false, shape: 'circle', color: '#1e40af' } },
];

export function applyQuickStyle(el: ShowElement, style: QuickStyle): Partial<ShowElement> {
  return { ...style.apply };
}
