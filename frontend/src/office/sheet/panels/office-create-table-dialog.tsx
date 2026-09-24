'use client';

import { useState } from 'react';
import { OfficeModal } from '@/office/shared/floating/office-modal';
import type { SheetTable } from '../model';
import { validateTableName, validateTableRange } from '../tables/table-logic';

type OfficeCreateTableDialogProps = {
  open: boolean;
  defaultRange: string;
  defaultName: string;
  existingTables: SheetTable[];
  onClose: () => void;
  onCreate: (input: { range: string; name: string; hasHeader: boolean; style: SheetTable['style'] }) => void;
};

export function OfficeCreateTableDialog({
  open,
  defaultRange,
  defaultName,
  existingTables,
  onClose,
  onCreate,
}: OfficeCreateTableDialogProps) {
  const [range, setRange] = useState(defaultRange);
  const [name, setName] = useState(defaultName);
  const [hasHeader, setHasHeader] = useState(true);
  const [style, setStyle] = useState<SheetTable['style']>('banded');
  const [error, setError] = useState('');

  const submit = () => {
    const parts = range.split(':');
    const rangeError = validateTableRange(parts[0], parts[1] ?? parts[0]);
    const nameError = validateTableName({ id: 's', name: 'Sheet', cells: {}, tables: existingTables }, name);
    if (rangeError || nameError) {
      setError(rangeError ?? nameError ?? 'Invalid table');
      return;
    }
    onCreate({ range: `${parts[0].toUpperCase()}:${(parts[1] ?? parts[0]).toUpperCase()}`, name, hasHeader, style });
    onClose();
  };

  return (
    <OfficeModal open={open} onClose={onClose} title="Create Table" panelClassName="max-w-[440px]">
      <div className="space-y-3 p-4 text-[13px]">
        <label className="block">Source range<input value={range} onChange={(e) => setRange(e.target.value)} className="mt-1 h-8 w-full rounded border px-2" /></label>
        <label className="block">Table name<input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-8 w-full rounded border px-2" /></label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} /> Header row</label>
        <label className="block">Style<select value={style} onChange={(e) => setStyle(e.target.value as SheetTable['style'])} className="mt-1 h-8 w-full rounded border px-2"><option value="banded">Banded</option><option value="plain">Plain</option><option value="minimal">Minimal</option></select></label>
        {error ? <div className="text-[12px] text-red-600">{error}</div> : null}
        <div className="flex justify-end gap-2 pt-2"><button type="button" className="rounded border px-3 py-1.5" onClick={onClose}>Cancel</button><button type="button" className="rounded bg-[var(--wd-primary)] px-3 py-1.5 text-white" onClick={submit}>Create</button></div>
      </div>
    </OfficeModal>
  );
}
