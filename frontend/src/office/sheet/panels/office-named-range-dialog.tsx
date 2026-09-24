'use client';

import { useEffect, useState } from 'react';
import { OfficeModal } from '@/office/shared/floating/office-modal';
import type { NamedRange } from '../model';
import { validateNamedRangeName, validateNamedRangeReference } from '../named-ranges/named-range-logic';

type OfficeNamedRangeDialogProps = {
  open: boolean;
  defaultRange: string;
  sheetId: string;
  ranges: NamedRange[];
  onClose: () => void;
  onCreate: (input: { name: string; reference: string }) => void;
  onUpdate: (oldName: string, input: { name: string; reference: string }) => void;
  onDelete: (name: string) => void;
};

const inputClass = 'mt-1 h-8 w-full rounded border border-[#d4d7da] px-2 text-[13px] outline-none focus:border-[var(--wd-primary)]';

export function OfficeNamedRangeDialog({
  open,
  defaultRange,
  sheetId,
  ranges,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}: OfficeNamedRangeDialogProps) {
  const [name, setName] = useState('SalesData');
  const [reference, setReference] = useState(defaultRange);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName('SalesData');
    setReference(defaultRange);
    setSelected(null);
    setError('');
  }, [open, defaultRange]);

  const submit = () => {
    const nameError = validateNamedRangeName(name, ranges, selected ?? undefined);
    const refError = validateNamedRangeReference(reference);
    if (nameError || refError) {
      setError(nameError ?? refError ?? 'Invalid named range');
      return;
    }
    if (selected) onUpdate(selected, { name, reference });
    else onCreate({ name, reference });
    onClose();
  };

  return (
    <OfficeModal open={open} onClose={onClose} title="Named Ranges" panelClassName="max-w-[480px]">
      <div className="space-y-3 p-4 text-[13px]">
        {ranges.length ? (
          <div className="max-h-[120px] overflow-auto rounded border">
            {ranges.map((r) => (
              <button
                key={r.name}
                type="button"
                className={`flex w-full items-center justify-between px-3 py-2 text-left hover:bg-[#f3f5f7] ${selected === r.name ? 'bg-[#e8edf3]' : ''}`}
                onClick={() => { setSelected(r.name); setName(r.name); setReference(r.reference); }}
              >
                <span className="font-medium">{r.name}</span>
                <span className="text-[11px] text-[#6d7278]">{r.reference}</span>
              </button>
            ))}
          </div>
        ) : null}
        <label className="block">Name<input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} /></label>
        <label className="block">Range<input value={reference} onChange={(e) => setReference(e.target.value)} className={inputClass} /></label>
        {error ? <div className="text-[12px] text-red-600">{error}</div> : null}
        <div className="flex justify-between gap-2 pt-2">
          <div>
            {selected ? (
              <button type="button" className="rounded border border-red-200 px-3 py-1.5 text-[12px] text-red-600" onClick={() => { onDelete(selected); onClose(); }}>
                Delete
              </button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <button type="button" className="rounded border px-3 py-1.5" onClick={onClose}>Cancel</button>
            <button type="button" className="rounded bg-[var(--wd-primary)] px-3 py-1.5 text-white" onClick={submit}>{selected ? 'Update' : 'Create'}</button>
          </div>
        </div>
      </div>
    </OfficeModal>
  );
}
