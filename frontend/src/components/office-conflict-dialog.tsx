'use client';
import React from 'react';

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

export function OfficeConflictDialog({conflict,queuedCount,ar=false,canKeepLocal=true,onKeepLocal,onUseRemote,onDismiss}:Props){
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
      <div className="px-5 pb-2 text-[11px] text-slate-500">{ar?'الاحتفاظ بالمحلي يعيد بناء العمليات فوق أحدث Revision إذا كان الدمج آمنًا. إذا كانت المسارات متداخلة سيبقى التعارض معلقًا بدل الكتابة فوق بيانات أخرى.':'Keep local rebases queued operations onto the latest revision only when their paths can be merged safely. Overlapping paths remain pending instead of overwriting remote data.'}</div>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t px-5 py-4">
        <button className="rounded border px-3 py-2 text-xs" onClick={onDismiss}>{ar?'لاحقًا':'Later'}</button>
        <button className="rounded border border-sky-600 px-3 py-2 text-xs text-sky-700" onClick={onUseRemote}>{ar?'استخدام النسخة البعيدة':'Use remote'}</button>
        <button className="rounded bg-[var(--wd-primary)] px-3 py-2 text-xs font-medium text-white disabled:opacity-40" disabled={!canKeepLocal} onClick={onKeepLocal}>{ar?'الاحتفاظ بعملي':'Keep my work'}</button>
      </div>
    </div>
  </div>;
}
