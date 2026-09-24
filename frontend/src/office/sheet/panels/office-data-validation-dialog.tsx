'use client';

import { useEffect, useState } from 'react';
import { OfficeModal } from '@/office/shared/floating/office-modal';
import type { ValidationRule } from '../model';

type OfficeDataValidationDialogProps = {
  open: boolean;
  cellKey: string;
  validation?: ValidationRule;
  onClose: () => void;
  onApply: (values: string[] | null) => void;
};

const inputClass = 'mt-1 h-8 w-full rounded border border-[#d4d7da] px-2 text-[13px] outline-none focus:border-[var(--wd-primary)]';

export function OfficeDataValidationDialog({ open, cellKey, validation, onClose, onApply }: OfficeDataValidationDialogProps) {
  const [listText, setListText] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setListText((validation?.values ?? []).join(', '));
    setError('');
  }, [open, validation]);

  const submit = () => {
    const values = listText.split(',').map((v) => v.trim()).filter(Boolean).slice(0, 50);
    if (!values.length) {
      onApply(null);
      onClose();
      return;
    }
    if (values.length > 50) {
      setError('Maximum 50 list values');
      return;
    }
    onApply(values);
    onClose();
  };

  return (
    <OfficeModal open={open} onClose={onClose} title="Data Validation" panelClassName="max-w-[440px]">
      <div className="space-y-3 p-4 text-[13px]">
        <div className="text-[12px] text-[#6d7278]">Cell {cellKey} — List validation</div>
        <label className="block">
          Allowed values (comma-separated)
          <textarea
            value={listText}
            onChange={(e) => setListText(e.target.value)}
            className={`${inputClass} min-h-[80px] py-2`}
            placeholder="Yes, No, Maybe"
          />
        </label>
        <div className="text-[11px] text-[#6d7278]">Leave empty to remove validation.</div>
        {error ? <div className="text-[12px] text-red-600">{error}</div> : null}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="rounded border px-3 py-1.5" onClick={onClose}>Cancel</button>
          <button type="button" className="rounded bg-[var(--wd-primary)] px-3 py-1.5 text-white" onClick={submit}>Apply</button>
        </div>
      </div>
    </OfficeModal>
  );
}
