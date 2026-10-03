/** Smart alignment guides while dragging (Zoho/PowerPoint-like). */

export type GuideLine = { axis: 'x' | 'y'; pos: number }; // pos in % of stage

export type Box = { id: string; x: number; y: number; width: number; height: number };

const SNAP = 0.6; // % threshold

function edges(b: Box) {
  return {
    left: b.x,
    right: b.x + b.width,
    top: b.y,
    bottom: b.y + b.height,
    cx: b.x + b.width / 2,
    cy: b.y + b.height / 2,
  };
}

/** Compute snap-adjusted position and active guide lines for a moving box among others. */
export function computeSmartGuides(
  moving: Box,
  others: Box[],
  proposedX: number,
  proposedY: number,
): { x: number; y: number; guides: GuideLine[] } {
  let x = proposedX;
  let y = proposedY;
  const guides: GuideLine[] = [];
  const w = moving.width;
  const h = moving.height;

  // Slide center guides
  const targetsX = [0, 50, 100];
  const targetsY = [0, 50, 100];
  for (const o of others) {
    const e = edges(o);
    targetsX.push(e.left, e.cx, e.right);
    targetsY.push(e.top, e.cy, e.bottom);
  }

  const moveEdgesX = [
    { key: 'left', val: x },
    { key: 'cx', val: x + w / 2 },
    { key: 'right', val: x + w },
  ];
  const moveEdgesY = [
    { key: 'top', val: y },
    { key: 'cy', val: y + h / 2 },
    { key: 'bottom', val: y + h },
  ];

  let bestDx = SNAP + 1;
  let snapX: number | null = null;
  let guideX: number | null = null;
  for (const me of moveEdgesX) {
    for (const t of targetsX) {
      const d = Math.abs(me.val - t);
      if (d < bestDx) {
        bestDx = d;
        guideX = t;
        if (me.key === 'left') snapX = t;
        else if (me.key === 'cx') snapX = t - w / 2;
        else snapX = t - w;
      }
    }
  }
  if (snapX !== null && guideX !== null) {
    x = snapX;
    guides.push({ axis: 'x', pos: guideX });
  }

  let bestDy = SNAP + 1;
  let snapY: number | null = null;
  let guideY: number | null = null;
  for (const me of moveEdgesY) {
    for (const t of targetsY) {
      const d = Math.abs(me.val - t);
      if (d < bestDy) {
        bestDy = d;
        guideY = t;
        if (me.key === 'top') snapY = t;
        else if (me.key === 'cy') snapY = t - h / 2;
        else snapY = t - h;
      }
    }
  }
  if (snapY !== null && guideY !== null) {
    y = snapY;
    guides.push({ axis: 'y', pos: guideY });
  }

  return {
    x: Math.max(0, Math.min(100 - w, x)),
    y: Math.max(0, Math.min(100 - h, y)),
    guides,
  };
}
