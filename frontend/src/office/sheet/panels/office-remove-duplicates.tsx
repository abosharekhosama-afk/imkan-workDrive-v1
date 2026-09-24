'use client';

import { useEffect, useState } from 'react';
import { OfficeModal } from '@/office/shared/floating/office-modal';

type DuplicateColumn = {
  index: number;
  label: string;
};

type OfficeRemoveDuplicatesProps = {
  open: boolean;
  defaultRange: string;
  columns: DuplicateColumn[];
  onClose: () => void;
  onApply: (input: { range: string; columnIndexes: number[]; hasHeader: boolean }) => number;
};

const inputClass =
  'mt-1 h-8 w-full rounded border border-[#d4d7da] px-2 text-[13px] outline-none focus:border-[var(--wd-primary)]';
const labelClass = 'block text-[12px] font-medium text-[#30343b]';

export function OfficeRemoveDuplicates({
  open,
  defaultRange,
  columns,
  onClose,
  onApply,
}: OfficeRemoveDuplicatesProps) {
  const [range, setRange] = useState(defaultRange);
  const [hasHeader, setHasHeader] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [resultCount, setResultCount] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setRange(defaultRange);
    setHasHeader(true);
    setSelected(new Set(columns.map((c) => c.index)));
    setResultCount(null);
  }, [open, defaultRange, columns]);

  const toggleColumn = (index: number, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(index);
    else next.delete(index);
    setSelected(next);
  };

  const submit = () => {
    const removed = onApply({
      range: range.trim().toUpperCase(),
      columnIndexes: [...selected].sort((a, b) => a - b),
      hasHeader,
    });
    setResultCount(removed);
  };

  return (
    <OfficeModal open={open} onClose={onClose} title="Remove Duplicates" panelClassName="max-w-[440px]">
      <div className="space-y-3 p-4 text-[13px]">
        <label className={labelClass}>
          Range
          <input value={range} onChange={(e) => setRange(e.target.value)} className={inputClass} />
        </label>

        <label className="flex items-center gap-2 text-[12px] text-[#30343b]">
          <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} />
          Data has header row
        </label>

        <div>
          <div className="mb-2 text-[12px] font-medium text-[#30343b]">Columns</div>
          <div className="max-h-[180px] space-y-1 overflow-auto rounded border border-[#e8eaed] p-2">
            {columns.map((column) => (
              <label key={column.index} className="flex items-center gap-2 text-[12px] text-[#30343b]">
                <input
                  type="checkbox"
                  checked={selected.has(column.index)}
                  onChange={(e) => toggleColumn(column.index, e.target.checked)}
                />
                {column.label}
              </label>
            ))}
          </div>
        </div>

        {resultCount != null ? (
          <div className="rounded border border-[#e8eaed] bg-[#f8faf9] px-3 py-2 text-[12px] text-[#30343b]">
            Removed {resultCount} duplicate row{resultCount === 1 ? '' : 's'}.
          </div>
        ) : null}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="rounded border px-3 py-1.5 text-[12px] hover:bg-[#f3f5f7]" onClick={onClose}>
            {resultCount != null ? 'Close' : 'Cancel'}
          </button>
          {resultCount == null ? (
            <button type="button" className="rounded bg-[var(--wd-primary)] px-3 py-1.5 text-[12px] text-white" onClick={submit}>
              Remove
            </button>
          ) : null}
        </div>
      </div>
    </OfficeModal>
  );
}
