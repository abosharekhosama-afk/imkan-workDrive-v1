import type { Sheet, SheetChart } from '../model.ts';
import { columnWidth, rowHeight } from '../dimension-logic.ts';

export const CHART_HEADER_H = 32;
export const CHART_ROW_HEADER_W = 48;
export const CHART_MIN_WIDTH = 200;
export const CHART_MIN_HEIGHT = 150;
export const CHART_MAX_WIDTH = 900;
export const CHART_MAX_HEIGHT = 640;

export type ChartLayout = { x: number; y: number; width: number; height: number };
export type ResizeHandle = 'nw' | 'n' | 'ne' | 'w' | 'e' | 'sw' | 's' | 'se';

export function cellContentOffset(sheet: Sheet, row: number, col: number): { x: number; y: number } {
  let y = CHART_HEADER_H;
  for (let r = 0; r < row; r++) y += rowHeight(sheet, r);
  let x = CHART_ROW_HEADER_W;
  for (let c = 0; c < col; c++) x += columnWidth(sheet, c);
  return { x, y };
}

export function chartLayout(sheet: Sheet, chart: SheetChart): ChartLayout {
  if (chart.x != null && chart.y != null) {
    return {
      x: chart.x,
      y: chart.y,
      width: clampChartWidth(chart.width),
      height: clampChartHeight(chart.height),
    };
  }
  const { x, y } = cellContentOffset(sheet, chart.position.row, chart.position.col);
  return { x, y, width: clampChartWidth(chart.width), height: clampChartHeight(chart.height) };
}

export function clampChartWidth(width: number): number {
  return Math.max(CHART_MIN_WIDTH, Math.min(CHART_MAX_WIDTH, Math.round(width)));
}

export function clampChartHeight(height: number): number {
  return Math.max(CHART_MIN_HEIGHT, Math.min(CHART_MAX_HEIGHT, Math.round(height)));
}

export function nearestCellAnchor(sheet: Sheet, x: number, y: number, maxRow: number, maxCol: number): { row: number; col: number } {
  const contentY = Math.max(0, y - CHART_HEADER_H);
  const contentX = Math.max(0, x - CHART_ROW_HEADER_W);
  let row = 0;
  let acc = 0;
  while (row < maxRow && acc + rowHeight(sheet, row) <= contentY) {
    acc += rowHeight(sheet, row);
    row++;
  }
  let col = 0;
  acc = 0;
  while (col < maxCol && acc + columnWidth(sheet, col) <= contentX) {
    acc += columnWidth(sheet, col);
    col++;
  }
  return { row: Math.min(maxRow, row), col: Math.min(maxCol, col) };
}

export function applyResize(
  layout: ChartLayout,
  handle: ResizeHandle,
  dx: number,
  dy: number,
): ChartLayout {
  let { x, y, width, height } = layout;
  if (handle.includes('e')) width += dx;
  if (handle.includes('w')) { x += dx; width -= dx; }
  if (handle.includes('s')) height += dy;
  if (handle.includes('n')) { y += dy; height -= dy; }
  width = clampChartWidth(width);
  height = clampChartHeight(height);
  if (handle.includes('w') && width === CHART_MIN_WIDTH) x = layout.x + layout.width - width;
  if (handle.includes('n') && height === CHART_MIN_HEIGHT) y = layout.y + layout.height - height;
  return { x, y, width, height };
}

export function chartLayoutPatch(layout: ChartLayout, sheet: Sheet, maxRow: number, maxCol: number) {
  const anchor = nearestCellAnchor(sheet, layout.x, layout.y, maxRow, maxCol);
  return {
    x: layout.x,
    y: layout.y,
    width: layout.width,
    height: layout.height,
    position: anchor,
  };
}
