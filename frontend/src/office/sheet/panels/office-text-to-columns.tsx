'use client';

import { useEffect, useState } from 'react';
import { OfficeModal } from '@/office/shared/floating/office-modal';
import type { TextSplitDelimiter } from '../data/text-to-columns-logic';

type OfficeTextToColumnsProps = {
  open: boolean;
  preview: string[][];
  overwriteCount: number;
  onClose: () => void;
  onApply: (input: { delimiter: TextSplitDelimiter; custom?: string }) => void;
};

const DELIMITERS: { value: TextSplitDelimiter; label: string }[] = [
  { value: 'comma', label: 'Comma' },
  { value: 'tab', label: 'Tab' },
  { value: 'semicolon', label: 'Semicolon' },
  { value: 'space', label: 'Space' },
  { value: 'custom', label: 'Custom' },
];

const inputClass =
  'mt-1 h-8 w-full rounded border border-[#d4d7da] px-2 text-[13px] outline-none focus:border-[var(--wd-primary)]';
const labelClass = 'block text-[12px] font-medium text-[#30343b]';

export function OfficeTextToColumns({ open, preview, overwriteCount, onClose, onApply }: OfficeTextToColumnsProps) {
  const [delimiter, setDelimiter] = useState<TextSplitDelimiter>('comma');
  const [custom, setCustom] = useState(',');

  useEffect(() => {
    if (!open) return;
    setDelimiter('comma');
    setCustom(',');
  }, [open]);

  const submit = () => {
    onApply({ delimiter, custom: delimiter === 'custom' ? custom : undefined });
    onClose();
  };

  const colCount = Math.max(1, ...preview.map((row) => row.length));

  return (
    <OfficeModal open={open} onClose={onClose} title="Text to Columns" panelClassName="max-w-[520px]">
      <div className="space-y-3 p-4 text-[13px]">
        <label className={labelClass}>
          Delimiter
          <select
            value={delimiter}
            onChange={(e) => setDelimiter(e.target.value as TextSplitDelimiter)}
            className={inputClass}
          >
            {DELIMITERS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        {delimiter === 'custom' ? (
          <label className={labelClass}>
            Custom delimiter
            <input value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={4} className={inputClass} />
          </label>
        ) : null}

        <div>
          <div className="mb-2 text-[12px] font-medium text-[#30343b]">Preview</div>
          <div className="overflow-auto rounded border border-[#e8eaed]">
            <table className="w-full border-collapse text-[11px]">
              <tbody>
                {preview.length === 0 ? (
                  <tr>
                    <td className="px-2 py-3 text-center text-[#6d7278]">No preview rows</td>
                  </tr>
                ) : (
                  preview.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {Array.from({ length: colCount }, (_, colIndex) => (
                        <td key={colIndex} className="border-b border-[#f0f1f3] px-2 py-1 text-[#30343b]">
                          {row[colIndex] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {overwriteCount > 0 ? (
          <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
            This will overwrite {overwriteCount} existing cell{overwriteCount === 1 ? '' : 's'} to the right of the selection.
          </div>
        ) : null}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="rounded border px-3 py-1.5 text-[12px] hover:bg-[#f3f5f7]" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="rounded bg-[var(--wd-primary)] px-3 py-1.5 text-[12px] text-white" onClick={submit}>
            Apply
          </button>
        </div>
      </div>
    </OfficeModal>
  );
}
