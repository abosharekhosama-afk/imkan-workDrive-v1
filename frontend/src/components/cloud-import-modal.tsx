"use client";
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocale } from './locale-provider';
import { Icons } from './layout/icons';
import { readBrowserAccessToken, stashBrowserAccessTokenForOAuth } from './auth-gate-logic';
import { cloudOAuthStart, createCloudImports, listCloudFiles, listCloudImportJobs, listCloudProviders, retryCloudImport, type CloudImportJob, type CloudProvider, type CloudRemoteFile } from '../lib/api/cloud-import';

type Detail = { folderId: string | null };
const PROVIDERS: Array<{ id: CloudProvider; en: string; ar: string; icon: string }> = [
  { id: 'google', en: 'Google Drive', ar: 'Google Drive', icon: 'G' },
  { id: 'dropbox', en: 'Dropbox', ar: 'Dropbox', icon: 'D' },
  { id: 'onedrive', en: 'OneDrive', ar: 'OneDrive', icon: 'O' },
];
const fmt = (n: number | null) => n == null ? '' : n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : n < 1024 ** 3 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${(n / 1024 ** 3).toFixed(1)} GB`;

export function CloudImportHost() {
  const { locale } = useLocale();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [provider, setProvider] = useState<CloudProvider | null>(null);
  const [providers, setProviders] = useState<any[]>([]);
  const [files, setFiles] = useState<CloudRemoteFile[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [jobs, setJobs] = useState<CloudImportJob[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [connectionId, setConnectionId] = useState<string | null>(null);

  const open = (folderId: string | null) => { setDetail({ folderId }); setProvider(null); setConnectionId(null); setFiles([]); setSelected([]); setJobs([]); setError(''); void refreshProviders(); void loadRecentJobs(); };
  const loadRecentJobs = async () => { try { setJobs(await listCloudImportJobs()); } catch {} };
  const refreshProviders = async () => { try { setProviders(await listCloudProviders()); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load cloud providers'); } };
  useEffect(() => {
    const handler = (event: Event) => { const value = (event as CustomEvent<Detail>).detail; open(value?.folderId ?? null); };
    window.addEventListener('workdrive:cloud-import', handler);
    const params = new URLSearchParams(window.location.search); const connected = params.get('cloudImport'); const returnedConnectionId = params.get('connectionId');
    if (connected) { open(params.get('folderId') || null); setProvider(connected as CloudProvider); if (returnedConnectionId) setConnectionId(returnedConnectionId); window.history.replaceState({}, '', window.location.pathname); }
    return () => window.removeEventListener('workdrive:cloud-import', handler);
  }, []);

  const chooseProvider = async (next: CloudProvider, selectedConnectionId?: string | null) => {
    setProvider(next); setSelected([]); setError(''); setLoading(true);
    try {
      const state = providers.find(p => p.provider === next);
      const selectedId = selectedConnectionId || state?.connectionId || null;
      setConnectionId(selectedId);
      if (!state?.connected) {
        stashBrowserAccessTokenForOAuth(readBrowserAccessToken(localStorage, document.cookie));
        const { url } = await cloudOAuthStart(next, detail?.folderId ?? null);
        window.location.assign(url); return;
      }
      setFiles(await listCloudFiles(next, selectedId));
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to access this cloud provider'); }
    finally { setLoading(false); }
  };
  const importSelected = async () => {
    if (!provider || !detail || !selected.length) return; setBusy(true); setError('');
    try { const created = await createCloudImports(provider, detail.folderId, files.filter(f => selected.includes(f.id)).map(f => ({ id: f.id, name: f.name })), connectionId); setJobs(created); setSelected([]); window.dispatchEvent(new Event('workdrive:content-changed')); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to start cloud import'); } finally { setBusy(false); }
  };
  useEffect(() => {
    const returned = provider;
    if (!detail || !returned || !providers.length || loading || files.length) return;
    const state = providers.find(p => p.provider === returned);
    if (state?.connected) {
      const id = connectionId || state.connectionId || null;
      setConnectionId(id);
      setLoading(true);
      void listCloudFiles(returned, id).then(setFiles).catch(e => setError(e instanceof Error ? e.message : 'Unable to access this cloud provider')).finally(() => setLoading(false));
    }
  }, [detail, provider, providers.length]);

  useEffect(() => {
    if (!jobs.length) return; const ids = jobs.map(j => j.id); let cancelled = false;
    const tick = async () => { try { const next = await listCloudImportJobs(ids); if (!cancelled) { setJobs(next); if (next.some(j => j.status === 'COMPLETED')) window.dispatchEvent(new Event('workdrive:content-changed')); } } catch {} };
    void tick(); const timer = window.setInterval(tick, 2000); return () => { cancelled = true; window.clearInterval(timer); };
  }, [jobs.map(j => j.id).join(',')]);

  if (!detail) return null;
  const selectedFiles = files.filter(f => selected.includes(f.id));
  const allSelected = files.length > 0 && selected.length === files.length;
  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-3 sm:p-5" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-black/35" aria-label="close" onClick={() => !busy && setDetail(null)} />
      <section className="relative flex max-h-[92vh] w-[min(900px,96vw)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="text-[16px] font-semibold text-slate-900">{locale === 'ar' ? 'استيراد من السحابة' : 'Import from cloud'}</h2><p className="mt-1 text-[12px] text-slate-500">{locale === 'ar' ? 'اختر خدمة سحابية ثم حدد الملفات التي تريد نسخها إلى WorkDrive.' : 'Choose a cloud service, then select files to copy into WorkDrive.'}</p></div><button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => !busy && setDetail(null)}><Icons.x size={17}/></button></header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid gap-2 sm:grid-cols-3">{PROVIDERS.map(p => { const connected = providers.find(x => x.provider === p.id)?.connected; return <button key={p.id} type="button" onClick={() => void chooseProvider(p.id)} className={`rounded-xl border px-3 py-3 text-start transition ${provider === p.id ? 'border-[var(--wd-primary)] bg-[#F7FAFF]' : 'border-slate-200 hover:border-slate-300'}`}><div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-[13px] font-semibold">{p.icon}</span><span className="min-w-0 flex-1 text-[12px] font-semibold text-slate-800">{locale === 'ar' ? p.ar : p.en}</span>{connected ? <span className="text-[10px] text-emerald-600">{locale === 'ar' ? 'متصل' : 'Connected'}</span> : <span className="text-[10px] text-slate-400">{locale === 'ar' ? 'اتصال' : 'Connect'}</span>}</div></button>; })}</div>
          {provider && providers.find(p => p.provider === provider)?.connections?.length > 1 ? <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <label className="block text-[10px] font-semibold text-slate-600">{locale === 'ar' ? 'الاتصال المستخدم' : 'Connection used'}</label>
            <select className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-[11px]" value={connectionId ?? ''} onChange={e => void chooseProvider(provider, e.target.value)}>
              {(providers.find(p => p.provider === provider)?.connections ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div> : null}
          {error ? <div className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[11px] text-red-700">{error}</div> : null}
          {provider && <div className="mt-4 overflow-hidden rounded-xl border border-slate-200"><div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-3 py-2"><button type="button" className="text-[11px] text-slate-500 hover:text-slate-800" onClick={() => setSelected(allSelected ? [] : files.map(f => f.id))}>{allSelected ? (locale === 'ar' ? 'إلغاء تحديد الكل' : 'Clear all') : (locale === 'ar' ? 'تحديد الكل' : 'Select all')}</button><span className="ms-auto text-[11px] text-slate-400">{selectedFiles.length}/{files.length}</span></div>{loading ? <div className="p-8 text-center text-[12px] text-slate-400">{locale === 'ar' ? 'جارٍ تحميل الملفات…' : 'Loading cloud files…'}</div> : files.length === 0 ? <div className="p-8 text-center text-[12px] text-slate-400">{locale === 'ar' ? 'لا توجد ملفات قابلة للاستيراد في المستوى الحالي.' : 'No importable files found at the current cloud root.'}</div> : <div className="max-h-[38vh] overflow-y-auto">{files.map(file => <label key={file.id} className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-3 py-2.5 last:border-b-0 hover:bg-slate-50"><input type="checkbox" checked={selected.includes(file.id)} onChange={() => setSelected(s => s.includes(file.id) ? s.filter(id => id !== file.id) : [...s, file.id])} /><span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-medium text-slate-800">{file.name}</span><span className="block truncate text-[10px] text-slate-400">{file.mimeType}{file.size != null ? ` · ${fmt(file.size)}` : ''}</span></span></label>)}</div>}</div>}
          {jobs.length > 0 && <div className="mt-4 space-y-2">{jobs.map(job => <div key={job.id} className="rounded-xl border border-slate-200 p-3"><div className="flex gap-2"><span className="min-w-0 flex-1 truncate text-[12px] font-medium">{job.remoteName}</span><span className="text-[10px] text-slate-400">{job.status === 'COMPLETED' ? '100%' : `${job.progress}%`}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[var(--wd-primary)] transition-all" style={{ width: `${job.progress}%` }} /></div>{job.error ? <div className="mt-1 flex items-center gap-2"><p className="min-w-0 flex-1 text-[10px] text-red-600">{job.error}</p><button type="button" className="shrink-0 text-[10px] font-medium text-[var(--wd-primary)] hover:underline" onClick={() => void retryCloudImport(job.id).then(next => setJobs(current => current.map(item => item.id === next.id ? next : item))).catch(() => undefined)}>{locale === 'ar' ? 'إعادة المحاولة' : 'Retry'}</button></div> : null}</div>)}</div>}
        </div>
        <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-100 px-5 py-3"><span className="text-[10px] text-slate-400">{locale === 'ar' ? 'تستمر عملية الاستيراد على الخادم حتى عند انقطاع اتصال المتصفح.' : 'Imports continue on the server if the browser connection drops.'}</span><div className="flex gap-2"><button type="button" className="wd-pill wd-pill-record" disabled={busy} onClick={() => setDetail(null)}>{locale === 'ar' ? 'إغلاق' : 'Close'}</button><button type="button" className="wd-pill wd-pill-new" disabled={busy || !selected.length || !provider} onClick={() => void importSelected()}>{busy ? (locale === 'ar' ? 'جارٍ البدء…' : 'Starting…') : (locale === 'ar' ? `استيراد (${selected.length})` : `Import (${selected.length})`)}</button></div></footer>
      </section>
    </div>, document.body
  );
}
