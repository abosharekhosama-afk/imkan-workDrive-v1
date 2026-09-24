export type FloatingPlacement =
  | 'bottom-start'
  | 'bottom-end'
  | 'top-start'
  | 'top-end'
  | 'right-start'
  | 'left-start';

export type FloatingRect = { top: number; left: number; width: number; height: number };

export type Viewport = { width: number; height: number; scrollX: number; scrollY: number };

const VIEWPORT_PADDING = 8;

export function computeFloatingPosition(
  anchor: { top: number; left: number; right: number; bottom: number; width: number; height: number },
  floating: { width: number; height: number },
  placement: FloatingPlacement,
  offset: number,
  viewport: Viewport,
): FloatingRect {
  const candidates: FloatingPlacement[] = [placement];
  if (placement.startsWith('bottom')) candidates.push(placement.replace('bottom', 'top') as FloatingPlacement);
  if (placement.startsWith('top')) candidates.push(placement.replace('top', 'bottom') as FloatingPlacement);
  if (placement.startsWith('right')) candidates.push(placement.replace('right', 'left') as FloatingPlacement);
  if (placement.startsWith('left')) candidates.push(placement.replace('left', 'right') as FloatingPlacement);

  for (const candidate of [...new Set(candidates)]) {
    const rect = place(anchor, floating, candidate, offset);
    if (fitsViewport(rect, floating, viewport)) return clampToViewport(rect, floating, viewport);
  }
  const fallback = place(anchor, floating, placement, offset);
  return clampToViewport(fallback, floating, viewport);
}

function place(
  anchor: { top: number; left: number; right: number; bottom: number; width: number; height: number },
  floating: { width: number; height: number },
  placement: FloatingPlacement,
  offset: number,
): FloatingRect {
  switch (placement) {
    case 'bottom-start':
      return { top: anchor.bottom + offset, left: anchor.left, width: floating.width, height: floating.height };
    case 'bottom-end':
      return { top: anchor.bottom + offset, left: anchor.right - floating.width, width: floating.width, height: floating.height };
    case 'top-start':
      return { top: anchor.top - floating.height - offset, left: anchor.left, width: floating.width, height: floating.height };
    case 'top-end':
      return { top: anchor.top - floating.height - offset, left: anchor.right - floating.width, width: floating.width, height: floating.height };
    case 'right-start':
      return { top: anchor.top, left: anchor.right + offset, width: floating.width, height: floating.height };
    case 'left-start':
      return { top: anchor.top, left: anchor.left - floating.width - offset, width: floating.width, height: floating.height };
    default:
      return { top: anchor.bottom + offset, left: anchor.left, width: floating.width, height: floating.height };
  }
}

function fitsViewport(rect: FloatingRect, floating: { width: number; height: number }, viewport: Viewport): boolean {
  const minX = viewport.scrollX + VIEWPORT_PADDING;
  const minY = viewport.scrollY + VIEWPORT_PADDING;
  const maxX = viewport.scrollX + viewport.width - VIEWPORT_PADDING;
  const maxY = viewport.scrollY + viewport.height - VIEWPORT_PADDING;
  return (
    rect.left >= minX &&
    rect.top >= minY &&
    rect.left + floating.width <= maxX &&
    rect.top + floating.height <= maxY
  );
}

function clampToViewport(
  rect: FloatingRect,
  floating: { width: number; height: number },
  viewport: Viewport,
): FloatingRect {
  const minX = viewport.scrollX + VIEWPORT_PADDING;
  const minY = viewport.scrollY + VIEWPORT_PADDING;
  const maxX = viewport.scrollX + viewport.width - floating.width - VIEWPORT_PADDING;
  const maxY = viewport.scrollY + viewport.height - floating.height - VIEWPORT_PADDING;
  return {
    ...rect,
    left: Math.min(Math.max(rect.left, minX), Math.max(minX, maxX)),
    top: Math.min(Math.max(rect.top, minY), Math.max(minY, maxY)),
  };
}

export function isOutsideFloatingLayer(target: EventTarget | null, layerRoot: HTMLElement | null, anchor?: HTMLElement | null): boolean {
  const isNode = typeof Node !== 'undefined' && target instanceof Node;
  if (!isNode) return true;
  if (layerRoot?.contains(target as Node)) return false;
  if (anchor?.contains(target as Node)) return false;
  return true;
}

export function officeFloatingViewport(): Viewport {
  if (typeof window === 'undefined') return { width: 0, height: 0, scrollX: 0, scrollY: 0 };
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  };
}
