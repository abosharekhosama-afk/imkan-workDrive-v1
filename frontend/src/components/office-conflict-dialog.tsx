'use client';
import React, { useMemo, useState } from 'react';
import { buildWriterConflictEntries, type WriterConflictChoice } from '@/office/writer/conflict-resolution';

export type OfficeConflictView = {
  fileId: string;
  kind: 'SHEET'|'SHOW'|'WRITER';
  local: any;
  remote: any;
  remoteRevision: number;
  detectedAt: string;
  reason: string;
};

type Props = {
  conflict: OfficeConflictView;
  queuedCount: number;
  ar?: boolean;
  canKeepLocal?: boolean;
  onKeepLocal: () => void;
  onUseRemote: () => void;
  onApplyMerged?: (choices: Record<string, WriterConflictChoice>) => void;
  onDismiss: () => void;
};

function summarize(doc:any, kind:string, ar:boolean){
  if(!doc) return ar ? 'لا توجد نسخة متاحة' : 'No snapshot available';
  if(kind==='SHEET'){
    const sheets=Array.isArray(doc.sheets)?doc.sheets:[];
    const cells=sheets.reduce((n:any,s:any)=>n+Object.keys(s?.cells||{}).length,0);
    return ar ? `${sheets.length} أوراق · ${cells} خلايا معدلة/محفوظة` : `${sheets.length} sheets · ${cells} stored cells`;
  }
  if(kind==='SHOW') return ar ? `${Array.isArray(doc.slides)?doc.slides.length:0} شرائح` : `${Array.isArray(doc.slides)?doc.slides.length:0} slides`;
  return ar ? `${Array.isArray(doc.blocks)?doc.blocks.length:0} كتل نصية` : `${Array.isArray(doc.blocks)?doc.blocks.length:0} document blocks`;
}

export function OfficeConflictDialog({conflict,queuedCount,ar=false,canKeepLocal=true,onKeepLocal,onUseRemote,onDismiss,onApplyMerged}:Props){
  const entries = useMemo(() => conflict.kind === 'WRITER' ? buildWriterConflictEntries(conflict.local, conflict.remote) : [], [conflict]);
  const [choices, setChoices] = useState<Record<string, WriterConflictChoice>>(() => Object.fromEntries(entries.map(entry => [entry.id, entry.defaultChoice])));
  const hasConflicts = entries.some(entry => entry.conflict);
  const localCount = entries.filter(entry => choices[entry.id] === 'local').length;
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true">
    <div className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl" dir={ar?'rtl':'ltr'}>
      <div className="border-b px-5 py-4">
        <div className="text-base font-semibold">{ar?'تعارض مزامنة Office':'Office sync conflict'}</div>
        <div className="mt-1 text-xs text-slate-500">{ar?'تم العثور على تعديل بعيد أحدث من النسخة المحلية. لن يتم فقدان عملك تلقائيًا.':'A newer remote revision was detected. Your local work will not be overwritten automatically.'}</div>
      </div>
      <div className="grid gap-3 p-5 md:grid-cols-2">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="text-xs font-semibold text-amber-900">{ar?'عملك المحلي':'Your local work'}</div>
          <div className="mt-2 text-sm text-amber-900">{summarize(conflict.local,conflict.kind,ar)}</div>
          <div className="mt-1 text-[11px] text-amber-700">{ar?`${queuedCount} عملية تنتظر المزامنة`:`${queuedCount} queued operation(s)`}</div>
        </div>
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-4">
          <div className="text-xs font-semibold text-sky-900">{ar?'النسخة البعيدة':'Remote revision'}</div>
          <div className="mt-2 text-sm text-sky-900">{summarize(conflict.remote,conflict.kind,ar)}</div>
          <div className="mt-1 text-[11px] text-sky-700">{ar?`Revision ${conflict.remoteRevision}`:`Revision ${conflict.remoteRevision}`}</div>
        </div>
      </div>
      {conflict.kind === 'WRITER' && entries.length > 0 && (
        <div className="mx-5 mb-3 max-h-64 overflow-auto rounded-lg border bg-slate-50">
          <div className="border-b px-3 py-2 text-xs font-semibold">{ar ? `مراجعة ${entries.length} تغييرات · ${localCount} محلية` : `Review ${entries.length} changes · ${localCount} local`}</div>
          {entries.map(entry => (
            <div key={entry.id} className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0">
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium">{entry.label}</div>
                <div className="text-[10px] text-slate-500">{entry.conflict ? (ar ? 'تعديل متداخل' : 'Overlapping edit') : (ar ? 'تعديل غير متداخل' : 'Non-overlapping edit')}</div>
              </div>
              <select aria-label={entry.label} value={choices[entry.id] ?? entry.defaultChoice} onChange={e => setChoices(prev => ({...prev, [entry.id]: e.target.value as WriterConflictChoice}))} className="rounded border bg-white px-2 py-1 text-[11px]">
                <option value="local">{ar ? 'المحلي' : 'Local'}</option>
                <option value="remote">{ar ? 'البعيد' : 'Remote'}</option>
              </select>
            </div>
          ))}
        </div>
      )}
      <div className="px-5 pb-2 text-[11px] text-slate-500">{ar?'الاحتفاظ بعملي يكتب تعديلاتك فوق أحدث مراجعة، مع الإبقاء على العناصر البعيدة التي لم تغيّرها. التعديل المتداخل يبقى معلقًا حتى تختار الاحتفاظ به.':'Keep my work writes your edits onto the latest revision and keeps remote items you did not change. An overlapping edit stays pending until you choose to keep it.'}</div>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t px-5 py-4">
        <button className="rounded border px-3 py-2 text-xs" onClick={onDismiss}>{ar?'لاحقًا':'Later'}</button>
        <button className="rounded border border-sky-600 px-3 py-2 text-xs text-sky-700" onClick={onUseRemote}>{ar?'استخدام النسخة البعيدة':'Use remote'}</button>
        {onApplyMerged && conflict.kind === 'WRITER' && hasConflicts && <button className="rounded border border-violet-600 px-3 py-2 text-xs text-violet-700" onClick={() => onApplyMerged(choices)}>{ar?'تطبيق الدمج':'Apply merged'}</button>}
        <button className="rounded bg-[var(--wd-primary)] px-3 py-2 text-xs font-medium text-white disabled:opacity-40" disabled={!canKeepLocal} onClick={onKeepLocal}>{ar?'الاحتفاظ بعملي':'Keep my work'}</button>
      </div>
    </div>
  </div>;
}
