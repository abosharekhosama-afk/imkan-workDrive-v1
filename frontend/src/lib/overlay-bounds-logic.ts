export type ContentLane = { left: number; right: number };

export type SidebarBox = { left: number; right: number; width: number };

/** Horizontal band that stays clear of the primary sidebar, in viewport pixels. */
export function contentLane(viewportWidth: number, sidebar: SidebarBox | null, padding = 8): ContentLane {
  const rightEdge = Math.max(padding, viewportWidth - padding);
  if (!sidebar || sidebar.width < 8 || viewportWidth <= padding * 2) {
    return { left: padding, right: rightEdge };
  }
  const onLeft = sidebar.left <= padding + 2 || (sidebar.left < viewportWidth / 2 && sidebar.right < viewportWidth - padding);
  if (onLeft && sidebar.left < viewportWidth / 2) {
    const left = Math.min(rightEdge, Math.max(padding, sidebar.right + padding));
    return { left, right: Math.max(left, rightEdge) };
  }
  const right = Math.max(padding, Math.min(rightEdge, sidebar.left - padding));
  return { left: padding, right: Math.max(padding, right) };
}

/** Pins a fixed card so its box stays inside the content lane. */
export function clampBoxLeft(desiredLeft: number, width: number, lane: ContentLane): number {
  const box = Math.max(0, width);
  const maxLeft = Math.max(lane.left, lane.right - box);
  return Math.min(Math.max(lane.left, desiredLeft), maxLeft);
}

export function measureSidebarBox(): SidebarBox | null {
  if (typeof document === "undefined") return null;
  const el = document.querySelector(".primary-sidebar, .zoho-sidebar");
  if (!(el instanceof HTMLElement)) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width < 8) return null;
  return { left: rect.left, right: rect.right, width: rect.width };
}

export function readContentLane(padding = 8): ContentLane {
  const width = typeof window === "undefined" ? 1280 : window.innerWidth;
  return contentLane(width, measureSidebarBox(), padding);
}
