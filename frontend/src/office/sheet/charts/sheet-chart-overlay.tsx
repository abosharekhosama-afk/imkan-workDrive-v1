'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { chartSvgMarkup } from '../charts';
import type { Sheet, SheetChart, Workbook } from '../model';
import {
  applyResize,
  chartLayout,
  chartLayoutPatch,
  type ChartLayout,
  type ResizeHandle,
} from './chart-layout-logic';

const HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const HANDLE_CLASS: Record<ResizeHandle, string> = {
  nw: 'left-0 top-0 cursor-nwse-resize',
  n: 'left-1/2 top-0 -translate-x-1/2 cursor-ns-resize',
  ne: 'right-0 top-0 cursor-nesw-resize',
  e: 'right-0 top-1/2 -translate-y-1/2 cursor-ew-resize',
  se: 'right-0 bottom-0 cursor-nwse-resize',
  s: 'left-1/2 bottom-0 -translate-x-1/2 cursor-ns-resize',
  sw: 'left-0 bottom-0 cursor-nesw-resize',
  w: 'left-0 top-1/2 -translate-y-1/2 cursor-ew-resize',
};

type SheetChartOverlayProps = {
  sheet: Sheet;
  workbook: Workbook;
  charts: SheetChart[];
  selectedChartId: string | null;
  maxRow: number;
  maxCol: number;
  onSelectChart: (id: string | null) => void;
  onCommitLayout: (id: string, patch: Partial<SheetChart> & { x: number; y: number; width: number; height: number }) => void;
  onDeleteChart: (id: string) => void;
  onEditChart: (id: string) => void;
};

function SheetChartOverlayInner({
  sheet,
  workbook,
  charts,
  selectedChartId,
  maxRow,
  maxCol,
  onSelectChart,
  onCommitLayout,
  onDeleteChart,
  onEditChart,
}: SheetChartOverlayProps) {
  const [preview, setPreview] = useState<{ id: string; layout: ChartLayout } | null>(null);
  const dragRef = useRef<
    | { kind: 'move'; id: string; startX: number; startY: number; origin: ChartLayout }
    | { kind: 'resize'; id: string; handle: ResizeHandle; startX: number; startY: number; origin: ChartLayout }
    | null
  >(null);

  const markup = useMemo(() => {
    const map = new Map<string, string>();
    for (const chart of charts) map.set(chart.id, chartSvgMarkup(chart, sheet, workbook));
    return map;
  }, [charts, sheet, workbook]);

  const layoutFor = useCallback(
    (chart: SheetChart) => (preview?.id === chart.id ? preview.layout : chartLayout(sheet, chart)),
    [preview, sheet],
  );

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (drag.kind === 'move') {
        setPreview({
          id: drag.id,
          layout: {
            ...drag.origin,
            x: Math.max(0, drag.origin.x + dx),
            y: Math.max(0, drag.origin.y + dy),
          },
        });
      } else {
        setPreview({
          id: drag.id,
          layout: applyResize(drag.origin, drag.handle, dx, dy),
        });
      }
    };
    const onUp = () => {
      const drag = dragRef.current;
      if (!drag || !preview || preview.id !== drag.id) {
        dragRef.current = null;
        setPreview(null);
        return;
      }
      const patch = chartLayoutPatch(preview.layout, sheet, maxRow, maxCol);
      onCommitLayout(drag.id, patch);
      dragRef.current = null;
      setPreview(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [maxCol, maxRow, onCommitLayout, preview, sheet]);

  if (!charts.length) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[15]">
      {charts.map((chart) => {
        const layout = layoutFor(chart);
        const selected = selectedChartId === chart.id;
        return (
          <div
            key={chart.id}
            role="figure"
            aria-label={chart.title}
            className={`pointer-events-auto absolute overflow-visible rounded border bg-white shadow-sm ${selected ? 'border-[var(--wd-primary)] ring-2 ring-[var(--wd-primary)]/30' : 'border-[#dadde0]'}`}
            style={{ top: layout.y, left: layout.x, width: layout.width, height: layout.height }}
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).dataset.handle) return;
              e.stopPropagation();
              onSelectChart(chart.id);
              dragRef.current = {
                kind: 'move',
                id: chart.id,
                startX: e.clientX,
                startY: e.clientY,
                origin: layout,
              };
              setPreview({ id: chart.id, layout });
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            }}
          >
            <div className="flex h-7 cursor-move items-center justify-between border-b bg-[#f8f9fa] px-2">
              <span className="truncate text-[11px] font-semibold text-[#30343b]">{chart.title}</span>
              <div className="flex items-center gap-1">
                {selected ? (
                  <button type="button" className="rounded px-1.5 text-[10px] text-[#185abd] hover:bg-[#e8edf3]" onClick={(e) => { e.stopPropagation(); onEditChart(chart.id); }}>Edit</button>
                ) : null}
                <button type="button" aria-label="Delete chart" className="text-[12px] text-red-600 hover:underline" onClick={(e) => { e.stopPropagation(); onDeleteChart(chart.id); }}>×</button>
              </div>
            </div>
            <div className="h-[calc(100%-28px)] overflow-hidden p-1" dangerouslySetInnerHTML={{ __html: markup.get(chart.id) ?? '' }} />
            {selected ? HANDLES.map((handle) => (
              <span
                key={handle}
                data-handle={handle}
                className={`pointer-events-auto absolute z-10 h-2.5 w-2.5 rounded-sm border border-[var(--wd-primary)] bg-white ${HANDLE_CLASS[handle]}`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  dragRef.current = {
                    kind: 'resize',
                    id: chart.id,
                    handle,
                    startX: e.clientX,
                    startY: e.clientY,
                    origin: layout,
                  };
                  setPreview({ id: chart.id, layout });
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                }}
              />
            )) : null}
          </div>
        );
      })}
    </div>
  );
}

export const SheetChartOverlay = memo(SheetChartOverlayInner);
