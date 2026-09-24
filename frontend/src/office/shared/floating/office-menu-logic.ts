export type OfficeMenuNode =
  | { type: 'item'; id: string; label: string; shortcut?: string; disabled?: boolean; onSelect?: () => void }
  | { type: 'divider'; id: string }
  | { type: 'submenu'; id: string; label: string; disabled?: boolean; items: OfficeMenuNode[] };

export function flattenSelectableMenuItems(items: OfficeMenuNode[]): OfficeMenuNode[] {
  return items.filter((item) => item.type !== 'divider' && !('disabled' in item && item.disabled));
}

export function navigateMenuIndex(items: OfficeMenuNode[], current: number, delta: number): number {
  const selectable = flattenSelectableMenuItems(items);
  if (!selectable.length) return 0;
  const ids = selectable.map((x) => x.id);
  const active = items.filter((x) => x.type !== 'divider').findIndex((x, i, arr) => {
    const flatIdx = flattenSelectableMenuItems(items).findIndex((f) => f.id === x.id);
    return flatIdx === current;
  });
  let next = current + delta;
  if (next < 0) next = selectable.length - 1;
  if (next >= selectable.length) next = 0;
  return next;
}

export function menuItemByFlatIndex(items: OfficeMenuNode[], flatIndex: number): OfficeMenuNode | undefined {
  return flattenSelectableMenuItems(items)[flatIndex];
}

export function isSubmenuNode(node: OfficeMenuNode | undefined): node is Extract<OfficeMenuNode, { type: 'submenu' }> {
  return node?.type === 'submenu';
}

export function submenuDirectionKey(key: string, rtl = false): 'open' | 'close' | null {
  if (key === 'ArrowRight') return rtl ? 'close' : 'open';
  if (key === 'ArrowLeft') return rtl ? 'open' : 'close';
  return null;
}
