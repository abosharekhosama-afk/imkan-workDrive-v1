'use client';

import { useMemo, useRef, useState } from 'react';
import { OfficePopover } from '@/office/shared/floating/office-popover';
import type { SheetTable } from '../model';

type OfficeTablePanelProps = {
  table: SheetTable;
  headers: string[];
  columnValues: (columnIndex: number) => string[];
  onChange: (patch: Partial<SheetTable>) => void;
  onSort: (direction: 'asc' | 'desc') => void;
  onFilter: (column: string, values: string[] | null) => void;
  onDelete: () => void;
  onClose: () => void;
};

const inputClass =
  'mt-1 h-8 w-full rounded border border-[#d4d7da] px-2 text-[13px] outline-none focus:border-[var(--wd-primary)]';
const labelClass = 'block text-[12px] font-medium text-[#30343b]';

export function OfficeTablePanel({
  table,
  headers,
  columnValues,
  onChange,
  onSort,
  onFilter,
  onDelete,
  onClose,
}: OfficeTablePanelProps) {
  const [filterColumn, setFilterColumn] = useState<number | null>(null);
  const [filterSearch, setFilterSearch] = useState('');
  const [selectedValues, setSelectedValues] = useState<Set<string>>(new Set());
  const filterBtnRef = useRef<HTMLButtonElement>(null);

  const activeHeader = filterColumn != null ? headers[filterColumn] : '';
  const values = useMemo(
    () => (filterColumn != null ? columnValues(filterColumn) : []),
    [columnValues, filterColumn],
  );
  const filteredValues = useMemo(() => {
    const q = filterSearch.trim().toLowerCase();
    return q ? values.filter((v) => v.toLowerCase().includes(q)) : values;
  }, [filterSearch, values]);

  const openFilter = (index: number) => {
    setFilterColumn(index);
    setFilterSearch('');
    const current = table.filter?.[headers[index]];
    setSelectedValues(new Set(current ? current.split('\u0001').filter(Boolean) : values));
  };

  const applyFilter = () => {
    if (filterColumn == null) return;
    const header = headers[filterColumn];
    if (!header) return;
    if (selectedValues.size === 0 || selectedValues.size === values.length) {
      onFilter(header, null);
    } else {
      onFilter(header, [...selectedValues].sort((a, b) => a.localeCompare(b)));
    }
    setFilterColumn(null);
  };

  return (
    <aside className="office-table-panel fixed right-0 top-0 z-[120] flex h-full w-[300px] flex-col border-l border-[#dadde0] bg-white shadow-[-8px_0_24px_rgba(0,0,0,.08)]">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-[15px] font-semibold text-[#202428]">Table</h2>
        <button type="button" className="rounded px-2 py-1 text-[12px] text-[#6d7278] hover:bg-[#f3f5f7]" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-auto p-4 text-[13px]">
        <label className={labelClass}>
          Name
          <input
            value={table.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className={inputClass}
          />
        </label>

        <label className={labelClass}>
          Style
          <select
            value={table.style ?? 'banded'}
            onChange={(e) => onChange({ style: e.target.value as SheetTable['style'] })}
            className={inputClass}
          >
            <option value="banded">Banded</option>
            <option value="plain">Plain</option>
            <option value="minimal">Minimal</option>
          </select>
        </label>

        <label className="flex items-center gap-2 text-[12px] text-[#30343b]">
          <input
            type="checkbox"
            checked={table.hasHeader}
            onChange={(e) => onChange({ hasHeader: e.target.checked })}
          />
          Header row
        </label>

        <label className="flex items-center gap-2 text-[12px] text-[#30343b]">
          <input
            type="checkbox"
            checked={Boolean(table.totalRow)}
            onChange={(e) => onChange({ totalRow: e.target.checked })}
          />
          Total row
        </label>

        <div>
          <div className="mb-2 text-[12px] font-medium text-[#30343b]">Sort</div>
          <div className="flex gap-2">
            <button type="button" className="rounded border px-3 py-1.5 text-[12px] hover:bg-[#f3f5f7]" onClick={() => onSort('asc')}>
              Ascending
            </button>
            <button type="button" className="rounded border px-3 py-1.5 text-[12px] hover:bg-[#f3f5f7]" onClick={() => onSort('desc')}>
              Descending
            </button>
          </div>
        </div>

        <div>
          <div className="mb-2 text-[12px] font-medium text-[#30343b]">Filter columns</div>
          <div className="space-y-1">
            {headers.map((header, index) => (
              <div key={header} className="flex items-center justify-between gap-2 rounded border border-[#e8eaed] px-2 py-1.5">
                <span className="truncate text-[12px] text-[#30343b]">{header}</span>
                <button
                  ref={filterColumn === index ? filterBtnRef : undefined}
                  type="button"
                  className="shrink-0 rounded border px-2 py-0.5 text-[11px] hover:bg-[#f3f5f7]"
                  onClick={() => openFilter(index)}
                >
                  Filter
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t p-4">
        <button
          type="button"
          className="w-full rounded border border-red-200 px-3 py-1.5 text-[12px] text-red-600 hover:bg-red-50"
          onClick={onDelete}
        >
          Delete table
        </button>
      </div>

      <OfficePopover
        open={filterColumn != null}
        onClose={() => setFilterColumn(null)}
        anchorRef={filterBtnRef}
        placement="bottom-end"
        className="w-[240px] p-3"
      >
        <div className="space-y-2 text-[12px]">
          <div className="font-medium text-[#202428]">{activeHeader}</div>
          <input
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            placeholder="Search values"
            className="h-7 w-full rounded border border-[#d4d7da] px-2 outline-none focus:border-[var(--wd-primary)]"
          />
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded border px-2 py-0.5 hover:bg-[#f3f5f7]"
              onClick={() => setSelectedValues(new Set(values))}
            >
              Select all
            </button>
            <button
              type="button"
              className="rounded border px-2 py-0.5 hover:bg-[#f3f5f7]"
              onClick={() => setSelectedValues(new Set())}
            >
              Clear
            </button>
          </div>
          <div className="max-h-[180px] space-y-1 overflow-auto">
            {filteredValues.map((value) => (
              <label key={value} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedValues.has(value)}
                  onChange={(e) => {
                    const next = new Set(selectedValues);
                    if (e.target.checked) next.add(value);
                    else next.delete(value);
                    setSelectedValues(next);
                  }}
                />
                <span className="truncate">{value || '(blank)'}</span>
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="rounded border px-2 py-1 hover:bg-[#f3f5f7]" onClick={() => setFilterColumn(null)}>
              Cancel
            </button>
            <button type="button" className="rounded bg-[var(--wd-primary)] px-2 py-1 text-white" onClick={applyFilter}>
              Apply
            </button>
          </div>
        </div>
      </OfficePopover>
    </aside>
  );
}
