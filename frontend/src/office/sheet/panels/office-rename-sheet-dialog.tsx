'use client';

import { useEffect, useState } from 'react';
import { OfficeModal } from '@/office/shared/floating/office-modal';

type OfficeRenameSheetDialogProps = {
  open: boolean;
  currentName: string;
  existingNames: string[];
  onClose: () => void;
  onRename: (name: string) => void;
};

const inputClass = 'mt-1 h-8 w-full rounded border border-[#d4d7da] px-2 text-[13px] outline-none focus:border-[var(--wd-primary)]';

export function OfficeRenameSheetDialog({ open, currentName, existingNames, onClose, onRename }: OfficeRenameSheetDialogProps) {
  const [name, setName] = useState(currentName);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(currentName);
    setError('');
  }, [open, currentName]);

  const submit = () => {
    const clean = name.trim().slice(0, 80);
    if (!clean) { setError('Sheet name cannot be empty'); return; }
    if (/[\\/?*[\]:]/u.test(clean)) { setError('Sheet name contains invalid characters'); return; }
    if (existingNames.some((n) => n.toLowerCase() === clean.toLowerCase() && n !== currentName)) {
      setError('A sheet with this name already exists');
      return;
    }
    onRename(clean);
    onClose();
  };

  return (
    <OfficeModal open={open} onClose={onClose} title="Rename Sheet" panelClassName="max-w-[360px]">
      <div className="space-y-3 p-4 text-[13px]">
        <label className="block">Sheet name<input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} autoFocus /></label>
        {error ? <div className="text-[12px] text-red-600">{error}</div> : null}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="rounded border px-3 py-1.5" onClick={onClose}>Cancel</button>
          <button type="button" className="rounded bg-[var(--wd-primary)] px-3 py-1.5 text-white" onClick={submit}>Rename</button>
        </div>
      </div>
    </OfficeModal>
  );
}
