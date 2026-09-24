'use client';

import { useEffect, useRef, useState } from 'react';
import { OfficeModal } from './office-modal';

type FindReplaceMode = 'find' | 'replace';

type OfficeFindReplaceProps = {
  open: boolean;
  mode: FindReplaceMode;
  onClose: () => void;
  onFindNext: (query: string, scope: 'values' | 'formulas' | 'both', caseSensitive: boolean) => void;
  onFindPrevious: (query: string, scope: 'values' | 'formulas' | 'both', caseSensitive: boolean) => void;
  onReplace: (find: string, replace: string, scope: 'values' | 'formulas' | 'both', caseSensitive: boolean) => void;
  onReplaceAll: (find: string, replace: string, scope: 'values' | 'formulas' | 'both', caseSensitive: boolean) => void;
};

export function OfficeFindReplace({
  open,
  mode,
  onClose,
  onFindNext,
  onFindPrevious,
  onReplace,
  onReplaceAll,
}: OfficeFindReplaceProps) {
  const [find, setFind] = useState('');
  const [replace, setReplace] = useState('');
  const [scope, setScope] = useState<'values' | 'formulas' | 'both'>('both');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const findRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) window.setTimeout(() => findRef.current?.focus(), 0);
  }, [open, mode]);

  return (
    <OfficeModal open={open} onClose={onClose} title={mode === 'replace' ? 'Find and Replace' : 'Find'} panelClassName="max-w-[420px]">
      <div className="space-y-3 p-4">
        <label className="block text-[12px] font-medium text-[#30343b]">
          Find
          <input
            ref={findRef}
            value={find}
            onChange={(e) => setFind(e.target.value)}
            className="mt-1 h-8 w-full rounded border border-[#d4d7da] px-2 text-[13px] outline-none focus:border-[var(--wd-primary)]"
          />
        </label>
        {mode === 'replace' ? (
          <label className="block text-[12px] font-medium text-[#30343b]">
            Replace with
            <input
              value={replace}
              onChange={(e) => setReplace(e.target.value)}
              className="mt-1 h-8 w-full rounded border border-[#d4d7da] px-2 text-[13px] outline-none focus:border-[var(--wd-primary)]"
            />
          </label>
        ) : null}
        <div className="flex flex-wrap items-center gap-3 text-[12px] text-[#30343b]">
          <label className="flex items-center gap-1">
            Scope
            <select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)} className="rounded border border-[#d4d7da] px-2 py-1">
              <option value="both">Values & formulas</option>
              <option value="values">Values</option>
              <option value="formulas">Formulas</option>
            </select>
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} />
            Match case
          </label>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" className="rounded border px-3 py-1.5 text-[12px] hover:bg-[#f3f5f7]" onClick={() => onFindNext(find, scope, caseSensitive)}>Find Next</button>
          <button type="button" className="rounded border px-3 py-1.5 text-[12px] hover:bg-[#f3f5f7]" onClick={() => onFindPrevious(find, scope, caseSensitive)}>Find Previous</button>
          {mode === 'replace' ? (
            <>
              <button type="button" className="rounded border px-3 py-1.5 text-[12px] hover:bg-[#f3f5f7]" onClick={() => onReplace(find, replace, scope, caseSensitive)}>Replace</button>
              <button type="button" className="rounded border px-3 py-1.5 text-[12px] hover:bg-[#f3f5f7]" onClick={() => onReplaceAll(find, replace, scope, caseSensitive)}>Replace All</button>
            </>
          ) : null}
          <button type="button" className="ml-auto rounded px-3 py-1.5 text-[12px] text-[#6d7278] hover:bg-[#f3f5f7]" onClick={onClose}>Close</button>
        </div>
      </div>
    </OfficeModal>
  );
}
