'use client';

import { useEffect, useState } from 'react';
import { OfficeModal } from '@/office/shared/floating/office-modal';
import type { PasteMode } from '../clipboard/paste-special-logic';

type OfficePasteSpecialProps = {
  open: boolean;
  onClose: () => void;
  onApply: (mode: PasteMode) => void;
};

const MODES: { value: PasteMode; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'values', label: 'Values' },
  { value: 'formulas', label: 'Formulas' },
  { value: 'formats', label: 'Formats' },
];

export function OfficePasteSpecial({ open, onClose, onApply }: OfficePasteSpecialProps) {
  const [mode, setMode] = useState<PasteMode>('all');

  useEffect(() => {
    if (open) setMode('all');
  }, [open]);

  const submit = () => {
    onApply(mode);
    onClose();
  };

  return (
    <OfficeModal open={open} onClose={onClose} title="Paste Special" panelClassName="max-w-[360px]">
      <div className="space-y-3 p-4 text-[13px]">
        <fieldset className="space-y-2">
          <legend className="mb-2 text-[12px] font-medium text-[#30343b]">Paste</legend>
          {MODES.map((item) => (
            <label key={item.value} className="flex items-center gap-2 text-[12px] text-[#30343b]">
              <input type="radio" name="paste-mode" checked={mode === item.value} onChange={() => setMode(item.value)} />
              {item.label}
            </label>
          ))}
        </fieldset>
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
