'use client';

import { useEffect, useState } from 'react';
import { OfficeModal } from '@/office/shared/floating/office-modal';
import type { SheetChart } from '../model';

type ChartPanelTab = 'type' | 'data' | 'title' | 'legend' | 'axes';
type ChartPanelType = 'column' | 'bar' | 'line' | 'pie' | 'area' | 'scatter';

type OfficeChartPanelProps = {
  chart: SheetChart;
  open: boolean;
  onClose: () => void;
  onChange: (patch: Partial<SheetChart>) => void;
};

const CHART_TYPES: { value: ChartPanelType; label: string }[] = [
  { value: 'column', label: 'Column' },
  { value: 'bar', label: 'Bar' },
  { value: 'line', label: 'Line' },
  { value: 'pie', label: 'Pie' },
  { value: 'area', label: 'Area' },
  { value: 'scatter', label: 'Scatter' },
];

const TABS: { id: ChartPanelTab; label: string }[] = [
  { id: 'type', label: 'Type' },
  { id: 'data', label: 'Data' },
  { id: 'title', label: 'Title' },
  { id: 'legend', label: 'Legend' },
  { id: 'axes', label: 'Axes' },
];

const inputClass =
  'mt-1 h-8 w-full rounded border border-[#d4d7da] px-2 text-[13px] outline-none focus:border-[var(--wd-primary)]';
const labelClass = 'block text-[12px] font-medium text-[#30343b]';

export function OfficeChartPanel({ chart, open, onClose, onChange }: OfficeChartPanelProps) {
  const [tab, setTab] = useState<ChartPanelTab>('type');
  const [draft, setDraft] = useState(chart);

  useEffect(() => {
    if (!open) return;
    setDraft(chart);
    setTab('type');
  }, [open, chart]);

  const patch = (next: Partial<SheetChart>) => {
    setDraft((prev) => ({ ...prev, ...next }));
    onChange(next);
  };

  return (
    <OfficeModal open={open} onClose={onClose} title="Chart Properties" panelClassName="max-w-[460px]">
      <div className="p-4 text-[13px]">
        <div className="mb-3 flex flex-wrap gap-1 border-b border-[#e8eaed] pb-2">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`rounded px-2.5 py-1 text-[12px] ${
                tab === item.id ? 'bg-[var(--wd-primary)] text-white' : 'text-[#30343b] hover:bg-[#f3f5f7]'
              }`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === 'type' ? (
          <div className="grid grid-cols-2 gap-2">
            {CHART_TYPES.map((item) => (
              <label key={item.value} className="flex items-center gap-2 rounded border border-[#e8eaed] px-2 py-2 text-[12px]">
                <input
                  type="radio"
                  name="chart-type"
                  checked={draft.type === item.value}
                  onChange={() => patch({ type: item.value })}
                />
                {item.label}
              </label>
            ))}
          </div>
        ) : null}

        {tab === 'data' ? (
          <div className="space-y-3">
            <label className={labelClass}>
              Range start
              <input
                value={draft.rangeStart}
                onChange={(e) => patch({ rangeStart: e.target.value.toUpperCase() })}
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              Range end
              <input
                value={draft.rangeEnd}
                onChange={(e) => patch({ rangeEnd: e.target.value.toUpperCase() })}
                className={inputClass}
              />
            </label>
          </div>
        ) : null}

        {tab === 'title' ? (
          <label className={labelClass}>
            Chart title
            <input value={draft.title} onChange={(e) => patch({ title: e.target.value })} className={inputClass} />
          </label>
        ) : null}

        {tab === 'legend' ? (
          <label className="flex items-center gap-2 text-[12px] text-[#30343b]">
            <input type="checkbox" checked={draft.legend} onChange={(e) => patch({ legend: e.target.checked })} />
            Show legend
          </label>
        ) : null}

        {tab === 'axes' ? (
          <div className="space-y-3">
            <label className={labelClass}>
              X-axis title
              <input
                value={draft.xAxis?.title ?? ''}
                onChange={(e) => patch({ xAxis: { ...draft.xAxis, title: e.target.value } })}
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              Y-axis title
              <input
                value={draft.yAxis?.title ?? ''}
                onChange={(e) => patch({ yAxis: { ...draft.yAxis, title: e.target.value } })}
                className={inputClass}
              />
            </label>
          </div>
        ) : null}

        <div className="mt-4 flex justify-end">
          <button type="button" className="rounded border px-3 py-1.5 text-[12px] hover:bg-[#f3f5f7]" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </OfficeModal>
  );
}
