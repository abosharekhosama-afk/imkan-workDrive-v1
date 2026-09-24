import { cellKey, parseKey } from './model.ts';

export type NavigationAction =
  | 'home'
  | 'end'
  | 'ctrl-home'
  | 'ctrl-end'
  | 'page-up'
  | 'page-down';

export function navigateSelection(
  key: string,
  action: NavigationAction,
  maxRow: number,
  maxCol: number,
  pageSize = 20,
): string {
  const p = parseKey(key);
  if (!p) return key;
  switch (action) {
    case 'home':
      return cellKey(p.row, 0);
    case 'end':
      return cellKey(p.row, maxCol);
    case 'ctrl-home':
      return cellKey(0, 0);
    case 'ctrl-end':
      return cellKey(maxRow, maxCol);
    case 'page-up':
      return cellKey(Math.max(0, p.row - pageSize), p.col);
    case 'page-down':
      return cellKey(Math.min(maxRow, p.row + pageSize), p.col);
    default:
      return key;
  }
}
