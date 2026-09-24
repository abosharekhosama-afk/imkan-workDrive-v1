'use client';

import { useEffect, useState } from 'react';
import { OfficeModal } from '@/office/shared/floating/office-modal';
import type { ConditionalFormat } from '../model';
import { parseKey } from '../model';

type OfficeConditionalFormatDialogProps = {
  open: boolean;
  defaultRange: string;
  rules: ConditionalFormat[];
  onClose: () => void;
  onAdd: (input: Omit<ConditionalFormat, 'id'>) => void;
  onUpdate: (id: string, patch: Partial<ConditionalFormat>) => void;
  onDelete: (id: string) => void;
};

const inputClass = 'mt-1 h-8 w-full rounded border border-[#d4d7da] px-2 text-[13px] outline-none focus:border-[var(--wd-primary)]';

function validateRange(range: string): string | null {
  const parts = range.split(':');
  const a = parseKey(parts[0]);
  const b = parseKey(parts[1] ?? parts[0]);
  if (!a || !b) return 'Invalid range';
  return null;
}

export function OfficeConditionalFormatDialog({
  open,
  defaultRange,
  rules,
  onClose,
  onAdd,
  onUpdate,
  onDelete,
}: OfficeConditionalFormatDialogProps) {
  const [range, setRange] = useState(defaultRange);
  const [type, setType] = useState<'cellIs' | 'containsText'>('cellIs');
  const [operator, setOperator] = useState<ConditionalFormat['operator']>('>');
  const [value, setValue] = useState('0');
  const [background, setBackground] = useState('#FEF3C7');
  const [color, setColor] = useState('#92400E');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setRange(defaultRange);
    setType('cellIs');
    setOperator('>');
    setValue('0');
    setSelectedId(null);
    setError('');
  }, [open, defaultRange]);

  const submit = () => {
    const rangeError = validateRange(range);
    if (rangeError) { setError(rangeError); return; }
    const patch = {
      range: range.toUpperCase(),
      type,
      operator: type === 'containsText' ? 'contains' as const : operator,
      value,
      format: { background, color },
    };
    if (selectedId) onUpdate(selectedId, patch);
    else onAdd(patch);
    onClose();
  };

  return (
    <OfficeModal open={open} onClose={onClose} title="Conditional Formatting" panelClassName="max-w-[480px]">
      <div className="space-y-3 p-4 text-[13px]">
        {rules.length ? (
          <div className="max-h-[120px] overflow-auto rounded border">
            {rules.map((rule) => (
              <button
                key={rule.id}
                type="button"
                className={`flex w-full items-center justify-between px-3 py-2 text-left hover:bg-[#f3f5f7] ${selectedId === rule.id ? 'bg-[#e8edf3]' : ''}`}
                onClick={() => {
                  setSelectedId(rule.id);
                  setRange(rule.range);
                  setType(rule.type);
                  setOperator(rule.operator);
                  setValue(rule.value);
                  setBackground(rule.format.background ?? '#FEF3C7');
                  setColor(rule.format.color ?? '#92400E');
                }}
              >
                <span>{rule.range}</span>
                <span className="text-[11px] text-[#6d7278]">{rule.type} {rule.operator} {rule.value}</span>
              </button>
            ))}
          </div>
        ) : null}
        <label className="block">Range<input value={range} onChange={(e) => setRange(e.target.value)} className={inputClass} /></label>
        <label className="block">Rule type
          <select value={type} onChange={(e) => setType(e.target.value as 'cellIs' | 'containsText')} className={inputClass}>
            <option value="cellIs">Cell value</option>
            <option value="containsText">Text contains</option>
          </select>
        </label>
        {type === 'cellIs' ? (
          <label className="block">Operator
            <select value={operator} onChange={(e) => setOperator(e.target.value as ConditionalFormat['operator'])} className={inputClass}>
              <option value=">">&gt;</option>
              <option value=">=">&gt;=</option>
              <option value="<">&lt;</option>
              <option value="<=">&lt;=</option>
              <option value="=">=</option>
              <option value="!=">!=</option>
            </select>
          </label>
        ) : null}
        <label className="block">Value<input value={value} onChange={(e) => setValue(e.target.value)} className={inputClass} /></label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">Fill<input type="color" value={background} onChange={(e) => setBackground(e.target.value)} className="mt-1 h-8 w-full" /></label>
          <label className="block">Text<input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="mt-1 h-8 w-full" /></label>
        </div>
        {error ? <div className="text-[12px] text-red-600">{error}</div> : null}
        <div className="flex justify-between gap-2 pt-2">
          <div>
            {selectedId ? (
              <button type="button" className="rounded border border-red-200 px-3 py-1.5 text-[12px] text-red-600" onClick={() => { onDelete(selectedId); onClose(); }}>Delete</button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <button type="button" className="rounded border px-3 py-1.5" onClick={onClose}>Cancel</button>
            <button type="button" className="rounded bg-[var(--wd-primary)] px-3 py-1.5 text-white" onClick={submit}>{selectedId ? 'Update' : 'Add rule'}</button>
          </div>
        </div>
      </div>
    </OfficeModal>
  );
}
