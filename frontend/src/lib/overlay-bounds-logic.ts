export type ContentLane = { left: number; right: number };

export type SidebarBox = { left: number; right: number; width: number };

/** Side columns the search card and floating menus must stay clear of. */
export const overlaySidebarSelector = ".primary-sidebar, .zoho-sidebar, .admin-console-sidebar, .secondary-sidebar, .workflow-secondary-sidebar, .wd-drawer, .workflow-inspector, .overlay-bound";

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
