/** Marquee (rubber-band) selection on the slide stage. Coordinates in % of stage. */

export type Rect = { x: number; y: number; width: number; height: number };

export function normalizeRect(x0: number, y0: number, x1: number, y1: number): Rect {
  const left = Math.min(x0, x1);
  const top = Math.min(y0, y1);
  return {
    x: left,
    y: top,
    width: Math.abs(x1 - x0),
    height: Math.abs(y1 - y0),
  };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  );
}

export function elementsInMarquee(
  elements: Array<{ id: string; x: number; y: number; width: number; height: number }>,
  marquee: Rect,
): string[] {
  if (marquee.width < 0.3 && marquee.height < 0.3) return [];
  return elements.filter((e) => rectsIntersect(marquee, { x: e.x, y: e.y, width: e.width, height: e.height })).map((e) => e.id);
}
