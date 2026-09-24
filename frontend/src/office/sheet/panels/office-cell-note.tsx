'use client';

import { useEffect, useRef, useState } from 'react';
import { OfficeModal } from '@/office/shared/floating/office-modal';

type OfficeCellNoteProps = {
  open: boolean;
  cellKey: string;
  note: string;
  onClose: () => void;
  onSave: (note: string) => void;
};

const labelClass = 'block text-[12px] font-medium text-[#30343b]';

export function OfficeCellNote({ open, cellKey, note, onClose, onSave }: OfficeCellNoteProps) {
  const [draft, setDraft] = useState(note);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(note);
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }, [open, note]);

  const submit = () => {
    onSave(draft.trim());
    onClose();
  };

  return (
    <OfficeModal open={open} onClose={onClose} title={`Cell Note — ${cellKey}`} panelClassName="max-w-[420px]">
      <div className="space-y-3 p-4 text-[13px]">
        <label className={labelClass}>
          Note
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={5}
            className="mt-1 w-full resize-y rounded border border-[#d4d7da] px-2 py-1.5 text-[13px] outline-none focus:border-[var(--wd-primary)]"
          />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="rounded border px-3 py-1.5 text-[12px] hover:bg-[#f3f5f7]" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="rounded bg-[var(--wd-primary)] px-3 py-1.5 text-[12px] text-white" onClick={submit}>
            Save
          </button>
        </div>
      </div>
    </OfficeModal>
  );
}
