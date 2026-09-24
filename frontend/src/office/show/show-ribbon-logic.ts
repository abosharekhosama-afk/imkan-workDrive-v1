export const SHOW_RIBBON_TABS = ['home', 'insert', 'design', 'transitions', 'animations', 'slideshow', 'review', 'view'] as const;
export type ShowRibbonTabId = (typeof SHOW_RIBBON_TABS)[number];

export const SHOW_TRANSITIONS = ['none', 'fade', 'slide'] as const;
export const SHOW_ANIMATIONS = ['none', 'fade', 'zoom', 'slide-in'] as const;
export const SHOW_INSERTS = ['text', 'shape', 'image', 'table', 'line', 'video', 'audio'] as const;

export function showShortcut(event: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }, typing: boolean) {
  const mod = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  if (mod && key === 'z' && !event.shiftKey) return 'undo';
  if (mod && (key === 'y' || (event.shiftKey && key === 'z'))) return 'redo';
  if (mod && key === 's') return 'save';
  if (!typing && (event.key === 'Delete' || event.key === 'Backspace')) return 'delete';
  if (!typing && event.key === 'F5') return 'present';
  return null;
}
