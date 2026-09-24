'use client';

import { useEffect, useState } from 'react';
import { OfficeModal } from '@/office/shared/floating/office-modal';
import { PIVOT_AGGREGATIONS, type PivotAggregation } from '../pivot/pivot-logic';
import type { PivotTable } from '../model';

type OfficeCreatePivotDialogProps = {
  open: boolean;
  defaultRange: string;
  fields: string[];
  onClose: () => void;
  onCreate: (input: Omit<PivotTable, 'id'>) => void;
};

const inputClass =
  'mt-1 h-8 w-full rounded border border-[#d4d7da] px-2 text-[13px] outline-none focus:border-[var(--wd-primary)]';
const labelClass = 'block text-[12px] font-medium text-[#30343b]';

export function OfficeCreatePivotDialog({
  open,
  defaultRange,
  fields,
  onClose,
  onCreate,
}: OfficeCreatePivotDialogProps) {
  const [sourceRange, setSourceRange] = useState(defaultRange);
  const [name, setName] = useState('PivotTable1');
  const [rowField, setRowField] = useState('');
  const [valueField, setValueField] = useState('');
  const [aggregation, setAggregation] = useState<PivotAggregation>('sum');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setSourceRange(defaultRange);
    setName('PivotTable1');
    setRowField(fields[0] ?? '');
    setValueField(fields[1] ?? fields[0] ?? '');
    setAggregation('sum');
    setError('');
  }, [open, defaultRange, fields]);

  const submit = () => {
    const cleanName = name.trim();
    if (!cleanName) {
      setError('Pivot name is required');
      return;
    }
    if (!sourceRange.trim()) {
      setError('Source range is required');
      return;
    }
    onCreate({
      name: cleanName,
      sourceRange: sourceRange.trim().toUpperCase(),
      rowField: rowField || undefined,
      valueField: valueField || undefined,
      aggregation,
    });
    onClose();
  };

  return (
    <OfficeModal open={open} onClose={onClose} title="Create Pivot Table" panelClassName="max-w-[440px]">
      <div className="space-y-3 p-4 text-[13px]">
        <label className={labelClass}>
          Source range
          <input value={sourceRange} onChange={(e) => setSourceRange(e.target.value)} className={inputClass} />
        </label>
        <label className={labelClass}>
          Pivot name
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </label>
        <label className={labelClass}>
          Row field
          <select value={rowField} onChange={(e) => setRowField(e.target.value)} className={inputClass}>
            <option value="">None</option>
            {fields.map((field) => (
              <option key={field} value={field}>
                {field}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Value field
          <select value={valueField} onChange={(e) => setValueField(e.target.value)} className={inputClass}>
            <option value="">None</option>
            {fields.map((field) => (
              <option key={field} value={field}>
                {field}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Aggregation
          <select
            value={aggregation}
            onChange={(e) => setAggregation(e.target.value as PivotAggregation)}
            className={inputClass}
          >
            {PIVOT_AGGREGATIONS.map((agg) => (
              <option key={agg} value={agg}>
                {agg.charAt(0).toUpperCase() + agg.slice(1)}
              </option>
            ))}
          </select>
        </label>
        {error ? <div className="text-[12px] text-red-600">{error}</div> : null}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="rounded border px-3 py-1.5 text-[12px] hover:bg-[#f3f5f7]" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="rounded bg-[var(--wd-primary)] px-3 py-1.5 text-[12px] text-white" onClick={submit}>
            Create
          </button>
        </div>
      </div>
    </OfficeModal>
  );
}
