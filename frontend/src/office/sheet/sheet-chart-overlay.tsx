'use client';

import { memo, useMemo } from 'react';
import { chartSvgMarkup } from './charts';
import type { Sheet, SheetChart, Workbook } from './model';
import { columnWidth, rowHeight } from './dimension-logic';

function cellOffset(sheet: Sheet, row: number, col: number, headerH = 32, rowHeaderW = 48) {
  let top = headerH;
  for (let r = 0; r < row; r++) top += rowHeight(sheet, r);
  let left = rowHeaderW;
  for (let c = 0; c < col; c++) left += columnWidth(sheet, c);
  return { top, left };
}

type SheetChartOverlayProps = {
  sheet: Sheet;
  workbook: Workbook;
  charts: SheetChart[];
  selectedChartId: string | null;
  onSelectChart: (id: string) => void;
  onMoveChart: (id: string, row: number, col: number) => void;
  onDeleteChart: (id: string) => void;
};

function SheetChartOverlayInner({ sheet, workbook, charts, selectedChartId, onSelectChart, onDeleteChart }: SheetChartOverlayProps) {
  const markup = useMemo(() => {
    const map = new Map<string, string>();
    for (const chart of charts) {
      map.set(chart.id, chartSvgMarkup(chart, sheet, workbook));
    }
    return map;
  }, [charts, sheet, workbook]);

  if (!charts.length) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[15]">
      {charts.map((chart) => {
        const { top, left } = cellOffset(sheet, chart.position.row, chart.position.col);
        const selected = selectedChartId === chart.id;
        return (
          <div
            key={chart.id}
            role="figure"
            aria-label={chart.title}
            className={`pointer-events-auto absolute overflow-hidden rounded border bg-white shadow-sm ${selected ? 'border-[var(--wd-primary)] ring-2 ring-[var(--wd-primary)]/30' : 'border-[#dadde0]'}`}
            style={{ top, left, width: chart.width, height: chart.height }}
            onMouseDown={(e) => { e.stopPropagation(); onSelectChart(chart.id); }}
          >
            <div className="flex h-7 items-center justify-between border-b bg-[#f8f9fa] px-2">
              <span className="truncate text-[11px] font-semibold text-[#30343b]">{chart.title}</span>
              <button type="button" aria-label="Delete chart" className="text-[12px] text-red-600 hover:underline" onClick={(e) => { e.stopPropagation(); onDeleteChart(chart.id); }}>×</button>
            </div>
            <div className="h-[calc(100%-28px)] overflow-hidden p-1" dangerouslySetInnerHTML={{ __html: markup.get(chart.id) ?? '' }} />
          </div>
        );
      })}
    </div>
  );
}

export const SheetChartOverlay = memo(SheetChartOverlayInner);
