'use client';

import { PIVOT_AGGREGATIONS, type PivotAggregation } from '../pivot/pivot-logic';
import type { PivotResult } from '../table-pivot';
import type { PivotTable } from '../model';

type OfficePivotPanelProps = {
  pivot: PivotTable;
  result: PivotResult;
  onChange: (patch: Partial<PivotTable>) => void;
  onDelete: () => void;
  onClose: () => void;
};

const inputClass =
  'mt-1 h-8 w-full rounded border border-[#d4d7da] px-2 text-[13px] outline-none focus:border-[var(--wd-primary)]';
const labelClass = 'block text-[12px] font-medium text-[#30343b]';

export function OfficePivotPanel({ pivot, result, onChange, onDelete, onClose }: OfficePivotPanelProps) {
  return (
    <aside className="office-pivot-panel fixed right-0 top-0 z-[120] flex h-full w-[320px] flex-col border-l border-[#dadde0] bg-white shadow-[-8px_0_24px_rgba(0,0,0,.08)]">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-[15px] font-semibold text-[#202428]">Pivot Table</h2>
        <button type="button" className="rounded px-2 py-1 text-[12px] text-[#6d7278] hover:bg-[#f3f5f7]" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="space-y-3 overflow-auto p-4 text-[13px]">
        <label className={labelClass}>
          Name
          <input value={pivot.name} onChange={(e) => onChange({ name: e.target.value })} className={inputClass} />
        </label>
        <label className={labelClass}>
          Source range
          <input
            value={pivot.sourceRange}
            onChange={(e) => onChange({ sourceRange: e.target.value.toUpperCase() })}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Row field
          <input value={pivot.rowField ?? ''} onChange={(e) => onChange({ rowField: e.target.value || undefined })} className={inputClass} />
        </label>
        <label className={labelClass}>
          Value field
          <input value={pivot.valueField ?? ''} onChange={(e) => onChange({ valueField: e.target.value || undefined })} className={inputClass} />
        </label>
        <label className={labelClass}>
          Aggregation
          <select
            value={pivot.aggregation ?? 'sum'}
            onChange={(e) => onChange({ aggregation: e.target.value as PivotAggregation })}
            className={inputClass}
          >
            {PIVOT_AGGREGATIONS.map((agg) => (
              <option key={agg} value={agg}>
                {agg.charAt(0).toUpperCase() + agg.slice(1)}
              </option>
            ))}
          </select>
        </label>

        <div>
          <div className="mb-2 text-[12px] font-medium text-[#30343b]">Preview</div>
          <div className="overflow-auto rounded border border-[#e8eaed]">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-[#f3f5f7]">
                  {result.headers.map((header) => (
                    <th key={header} className="border-b border-[#e8eaed] px-2 py-1 text-left font-medium text-[#30343b]">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className="border-b border-[#f0f1f3] px-2 py-1 text-[#30343b]">
                        {String(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
                {result.rows.length === 0 ? (
                  <tr>
                    <td colSpan={Math.max(1, result.headers.length)} className="px-2 py-3 text-center text-[#6d7278]">
                      No data
                    </td>
                  </tr>
                ) : null}
              </tbody>
              {result.rows.length > 0 ? (
                <tfoot>
                  <tr className="bg-[#fafbfc] font-medium">
                    <td className="px-2 py-1">Grand Total</td>
                    <td className="px-2 py-1">{result.grandTotal}</td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        </div>
      </div>

      <div className="mt-auto space-y-2 border-t p-4">
        <button
          type="button"
          className="w-full rounded border px-3 py-1.5 text-[12px] hover:bg-[#f3f5f7]"
          onClick={() =>
            onChange({
              name: pivot.name,
              sourceRange: pivot.sourceRange,
              rowField: pivot.rowField,
              valueField: pivot.valueField,
              aggregation: pivot.aggregation,
            })
          }
        >
          Refresh
        </button>
        <button
          type="button"
          className="w-full rounded border border-red-200 px-3 py-1.5 text-[12px] text-red-600 hover:bg-red-50"
          onClick={onDelete}
        >
          Delete pivot
        </button>
      </div>
    </aside>
  );
}
