export type ContentLane = { left: number; right: number };

export type SidebarBox = { left: number; right: number; width: number };

/** Side columns the search card and floating menus must stay clear of. */
export const overlaySidebarSelector = "[data-overlay-bound='sidebar'], .primary-sidebar, .zoho-sidebar, .admin-console-sidebar, .secondary-sidebar, .workflow-secondary-sidebar, .wd-drawer, .workflow-inspector, .overlay-bound";

/** Horizontal band that stays clear of every side column, in viewport pixels. */
export function contentLane(viewportWidth: number, sidebar: SidebarBox | readonly SidebarBox[] | null, padding = 8): ContentLane {
  const rightEdge = Math.max(padding, viewportWidth - padding);
  const boxes = sidebar == null ? [] : Array.isArray(sidebar) ? sidebar : [sidebar];
  let left = padding;
  let right = rightEdge;
  if (viewportWidth <= padding * 2) return { left, right };
  for (const box of boxes) {
    if (!box || box.width < 8) continue;
    const onLeft = box.left < viewportWidth / 2 && box.right < viewportWidth - padding;
    if (onLeft) {
      left = Math.max(left, Math.min(right, box.right + padding));
      continue;
    }
    if (box.left >= viewportWidth / 2) {
      right = Math.min(right, Math.max(left, box.left - padding));
    }
  }
  return { left, right: Math.max(left, right) };
}

/** Pins a fixed card so its box stays inside the content lane. */
export function clampBoxLeft(desiredLeft: number, width: number, lane: ContentLane): number {
  const box = Math.max(0, width);
  const maxLeft = Math.max(lane.left, lane.right - box);
  return Math.min(Math.max(lane.left, desiredLeft), maxLeft);
}

export function measureSidebarBoxes(): SidebarBox[] {
  if (typeof document === "undefined") return [];
  return [...document.querySelectorAll(overlaySidebarSelector)].flatMap((el) => {
    if (!(el instanceof HTMLElement)) return [];
    const rect = el.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) return [];
    return [{ left: rect.left, right: rect.right, width: rect.width }];
  });
}

export function measureSidebarBox(): SidebarBox | null {
  return measureSidebarBoxes()[0] ?? null;
}

export function readContentLane(padding = 8): ContentLane {
  const width = typeof window === "undefined" ? 1280 : window.innerWidth;
  return contentLane(width, measureSidebarBoxes(), padding);
}

export type AnchorBox = { top: number; left: number; right: number; bottom: number };
export type FloatingMenuBox = { top: number; left: number; maxHeight: number };

/**
 * Places a floating menu beside an anchor so it stays inside the viewport.
 * The inline-end side is preferred (right in LTR, left in RTL). When that
 * side is shorter than the menu, the menu opens on the opposite side.
 */
export function placeFloatingMenu(input: {
  anchor: AnchorBox;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
  rtl?: boolean;
  margin?: number;
  gap?: number;
}): FloatingMenuBox {
  const margin = input.margin ?? 8;
  const gap = input.gap ?? 4;
  const width = Math.max(0, input.width);
  const height = Math.max(0, input.height);
  const { anchor, viewportWidth, viewportHeight, rtl = false } = input;
  const spaceOnEnd = rtl ? anchor.left - margin : viewportWidth - anchor.right - margin;
  const spaceOnStart = rtl ? viewportWidth - anchor.right - margin : anchor.left - margin;
  const openOnEnd = spaceOnEnd >= width || spaceOnEnd >= spaceOnStart;
  const unclamped = openOnEnd
    ? (rtl ? anchor.left - width - gap : anchor.right + gap)
    : (rtl ? anchor.right + gap : anchor.left - width - gap);
  const maxLeft = Math.max(margin, viewportWidth - width - margin);
  const left = Math.min(Math.max(margin, unclamped), maxLeft);
  const available = Math.max(120, viewportHeight - margin * 2);
  const maxHeight = Math.min(Math.max(height, 36), available);
  let top = anchor.top;
  if (top + maxHeight > viewportHeight - margin) top = viewportHeight - margin - maxHeight;
  if (top < margin) top = margin;
  return { top, left, maxHeight };
}
