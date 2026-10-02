/**
 * Keyboard shortcut map for IMKAN Writer (Zoho/Word-inspired).
 * Pure classification — the page decides how to act.
 */
export type WriterShortcutAction =
  | 'undo'
  | 'redo'
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strike'
  | 'find'
  | 'replace'
  | 'find-next'
  | 'find-previous'
  | 'save'
  | 'select-all'
  | 'align-start'
  | 'align-center'
  | 'align-end'
  | 'align-justify'
  | 'print'
  | 'close-panel'
  | 'track-changes'
  | 'review-panel'
  | 'next-change'
  | 'prev-change';

export function resolveWriterShortcut(event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey?: boolean;
}): WriterShortcutAction | null {
  const mod = event.ctrlKey || event.metaKey;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const shift = event.shiftKey;

  if (key === 'Escape') return 'close-panel';

  // F3 / Shift+F3 work with or without Ctrl
  if (key === 'F3') return shift ? 'find-previous' : 'find-next';

  if (!mod) return null;

  if (key === 'z') return shift ? 'redo' : 'undo';
  if (key === 'y') return 'redo';
  if (key === 'b') return 'bold';
  if (key === 'i') return 'italic';
  if (key === 'u') return 'underline';
  if (key === 'x' && shift) return 'strike'; // Ctrl+Shift+X
  if (key === 'f') return 'find';
  if (key === 'h') return 'replace';
  if (key === 'g') return shift ? 'find-previous' : 'find-next';
  if (key === 's') return 'save';
  if (key === 'a') return 'select-all';
  if (key === 'p' && event.altKey) return 'prev-change';
  if (key === 'p') return 'print';
  if (key === 'l' && shift) return 'align-start';
  if (key === 'e' && shift) return 'align-center';
  if (key === 'r' && shift) return 'align-end';
  if (key === 'j' && shift) return 'align-justify';
  if (key === 'e' && shift && event.altKey) return null; // reserved
  if (key === 'shift' ) return null;
  // Ctrl+Shift+E is align-center; Ctrl+Alt+T track; Ctrl+Shift+C comments panel
  if (key === 't' && shift) return 'track-changes';
  if (key === 'c' && shift) return 'review-panel';
  if (key === 'n' && shift) return 'next-change';

  return null;
}
