'use client';
import { useEffect, useState } from 'react';
import { listOfficeDocumentVersions, restoreOfficeDocumentVersion, type OfficeDocumentVersion } from '@/lib/api/office';

export function OfficeVersionHistory({ fileId, revision, ar = false, onRestored }: { fileId: string; revision: number; ar?: boolean; onRestored?: () => void }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<OfficeDocumentVersion[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = async () => { setBusy(true); setError(''); try { setItems(await listOfficeDocumentVersions(fileId)); } catch (e: any) { setError(e?.message || (ar ? 'تعذر تحميل سجل الإصدارات' : 'Unable to load version history')); } finally { setBusy(false); } };
  useEffect(() => { if (open) void load(); }, [open, revision]);
  const restore = async (version: OfficeDocumentVersion) => {
    if (!window.confirm(ar ? `استعادة الإصدار ${version.versionNumber}؟ سيتم إنشاء إصدار جديد.` : `Restore version ${version.versionNumber}? A new version will be created.`)) return;
    setBusy(true); setError('');
    try { await restoreOfficeDocumentVersion(fileId, version.id, revision); await load(); onRestored?.(); }
    catch (e: any) { setError(e?.message || (ar ? 'فشل الاستعادة' : 'Restore failed')); }
    finally { setBusy(false); }
  };
  return <>
    <button className="tool" onClick={() => setOpen(true)} title={ar ? 'سجل الإصدارات' : 'Version history'}>{ar ? 'الإصدارات' : 'Versions'}</button>
    {open && <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/30 p-4" dir={ar ? 'rtl' : 'ltr'} onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="w-[min(680px,96vw)] max-h-[85vh] overflow-auto rounded-2xl border bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between"><div><div className="text-sm font-semibold">{ar ? 'سجل إصدارات Office' : 'Office version history'}</div><div className="text-[10px] text-slate-500">{ar ? 'كل حفظ ناجح ينتج لقطة قابلة للاستعادة.' : 'Every successful save creates a restorable snapshot.'}</div></div><button className="rounded border px-2 py-1 text-xs" onClick={() => setOpen(false)}>×</button></div>
        {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2 text-[10px] text-red-700">{error}</div>}
        {busy ? <div className="p-10 text-center text-xs text-slate-500">{ar ? 'جارٍ التحميل…' : 'Loading…'}</div> : <div className="mt-4 space-y-2">{items.length ? items.map(v => <div key={v.id} className="flex items-center justify-between gap-3 rounded-xl border p-3"><div className="min-w-0"><div className="text-xs font-semibold">v{v.versionNumber} · {v.label || `Revision ${v.revision}`}</div><div className="mt-1 text-[9px] text-slate-500">{v.createdBy?.name || v.createdBy?.email} · {new Date(v.createdAt).toLocaleString()} · SHA-256 {v.contentHash.slice(0, 12)}…</div></div><button disabled={busy || v.revision === revision} className="shrink-0 rounded-lg bg-slate-900 px-3 py-1.5 text-[10px] text-white disabled:opacity-40" onClick={() => void restore(v)}>{v.revision === revision ? (ar ? 'الحالي' : 'Current') : (ar ? 'استعادة' : 'Restore')}</button></div>) : <div className="rounded-xl border p-8 text-center text-xs text-slate-500">{ar ? 'لا توجد إصدارات محفوظة بعد.' : 'No saved versions yet.'}</div>}</div>}
      </div>
    </div>}
  </>;
}
