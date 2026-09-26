"use client";
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocale } from './locale-provider';
import { Icons } from './layout/icons';
import { readBrowserAccessToken, stashBrowserAccessTokenForOAuth } from './auth-gate-logic';
import { cloudOAuthStart, createCloudImports, listCloudFiles, listCloudImportJobs, listCloudProviders, retryCloudImport, type CloudImportJob, type CloudProvider, type CloudRemoteFile } from '../lib/api/cloud-import';

type Detail = { folderId: string | null };
type TrailItem = { id: string | null; name: string };
const PROVIDERS: Array<{ id: CloudProvider; en: string; ar: string; icon: string }> = [
  { id: 'google', en: 'Google Drive', ar: 'Google Drive', icon: 'G' },
  { id: 'dropbox', en: 'Dropbox', ar: 'Dropbox', icon: 'D' },
  { id: 'onedrive', en: 'OneDrive', ar: 'OneDrive', icon: 'O' },
];
const fmt = (n: number | null) => n == null ? '' : n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : n < 1024 ** 3 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${(n / 1024 ** 3).toFixed(1)} GB`;

export function CloudImportHost() {
  const { locale } = useLocale();
  const ar = locale === 'ar';
  const [detail, setDetail] = useState<Detail | null>(null);
  const [provider, setProvider] = useState<CloudProvider | null>(null);
  const [providers, setProviders] = useState<any[]>([]);
  const [files, setFiles] = useState<CloudRemoteFile[]>([]);
  const [selected, setSelected] = useState<Record<string, CloudRemoteFile>>({});
  const [jobs, setJobs] = useState<CloudImportJob[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [trail, setTrail] = useState<TrailItem[]>([{ id: null, name: 'My Drive' }]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);

  const selectedFiles = useMemo(() => Object.values(selected), [selected]);
  const currentFolders = useMemo(() => files.filter(file => file.kind === 'folder'), [files]);
  const currentFiles = useMemo(() => files.filter(file => file.kind !== 'folder'), [files]);
  const allCurrentSelected = currentFiles.length > 0 && currentFiles.every(file => Boolean(selected[file.id]));

  const open = (folderId: string | null) => {
    setDetail({ folderId }); setProvider(null); setConnectionId(null); setFiles([]); setSelected({}); setJobs([]); setError(''); setTrail([{ id: null, name: 'My Drive' }]); setNextPageToken(null);
    void refreshProviders(); void loadRecentJobs();
  };
  const loadRecentJobs = async () => { try { setJobs(await listCloudImportJobs()); } catch {} };
  const refreshProviders = async () => { try { setProviders(await listCloudProviders()); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load cloud providers'); } };

  useEffect(() => {
    const handler = (event: Event) => { const value = (event as CustomEvent<Detail>).detail; open(value?.folderId ?? null); };
    window.addEventListener('workdrive:cloud-import', handler);
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('cloudImport');
    const returnedConnectionId = params.get('connectionId');
    if (connected) {
      open(params.get('folderId') || null);
      setProvider(connected as CloudProvider);
      if (returnedConnectionId) setConnectionId(returnedConnectionId);
      window.history.replaceState({}, '', window.location.pathname);
    }
    return () => window.removeEventListener('workdrive:cloud-import', handler);
  }, []);

  const loadFolder = async (next: CloudProvider, id: string | null, parentId: string | null, pageToken: string | null = null, append = false) => {
    setLoading(true); setError('');
    try {
      const result = await listCloudFiles(next, id, parentId, pageToken);
      setFiles(current => append ? [...current, ...result.files] : result.files);
      setNextPageToken(result.nextPageToken);
    } catch (e) {
      const message = e instanceof Error ? e.message : (ar ? 'تعذر الوصول إلى الملفات السحابية.' : 'Unable to access cloud files.');
      setError(message);
      setFiles([]); setNextPageToken(null);
    } finally { setLoading(false); }
  };

  const chooseProvider = async (next: CloudProvider, selectedConnectionId?: string | null) => {
    setProvider(next); setSelected({}); setError(''); setTrail([{ id: null, name: next === 'google' ? 'My Drive' : next === 'dropbox' ? 'Dropbox' : 'OneDrive' }]); setNextPageToken(null); setFiles([]); setLoading(true);
    try {
      const state = providers.find(p => p.provider === next);
      const selectedId = selectedConnectionId || state?.connectionId || null;
      setConnectionId(selectedId);
      if (!state?.connected || !selectedId) {
        stashBrowserAccessTokenForOAuth(readBrowserAccessToken(localStorage, document.cookie));
        const { url } = await cloudOAuthStart(next, detail?.folderId ?? null);
        window.location.assign(url); return;
      }
      await loadFolder(next, selectedId, null);
    } catch (e) { setError(e instanceof Error ? e.message : (ar ? 'تعذر الوصول إلى الخدمة السحابية.' : 'Unable to access this cloud provider')); setLoading(false); }
  };

  const openFolder = async (folder: CloudRemoteFile) => {
    if (!provider || !connectionId) return;
    setTrail(current => [...current, { id: folder.id, name: folder.name }]);
    await loadFolder(provider, connectionId, folder.id);
  };
  const goToTrail = async (index: number) => {
    if (!provider || !connectionId) return;
    const item = trail[index];
    setTrail(current => current.slice(0, index + 1));
    await loadFolder(provider, connectionId, item.id);
  };
  const toggleCurrent = (file: CloudRemoteFile) => setSelected(current => {
    const next = { ...current };
    if (next[file.id]) delete next[file.id]; else next[file.id] = file;
    return next;
  });
  const toggleAllCurrent = () => setSelected(current => {
    const next = { ...current };
    if (allCurrentSelected) currentFiles.forEach(file => delete next[file.id]);
    else currentFiles.forEach(file => { next[file.id] = file; });
    return next;
  });
  const importSelected = async () => {
    if (!provider || !detail || !selectedFiles.length) return;
    setBusy(true); setError('');
    try {
      const created = await createCloudImports(provider, detail.folderId, selectedFiles.map(f => ({ id: f.id, name: f.name })), connectionId);
      setJobs(current => [...created, ...current.filter(job => !created.some(item => item.id === job.id))]);
      setSelected({}); window.dispatchEvent(new Event('workdrive:content-changed'));
    } catch (e) { setError(e instanceof Error ? e.message : (ar ? 'تعذر بدء الاستيراد.' : 'Unable to start cloud import')); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    if (!detail || !provider || !providers.length || loading || files.length) return;
    const state = providers.find(p => p.provider === provider);
    if (state?.connected) {
      const id = connectionId || state.connectionId || null;
      setConnectionId(id);
      if (id) void loadFolder(provider, id, null);
    }
  }, [detail, provider, providers.length]);

  useEffect(() => {
    if (!jobs.length) return; const ids = jobs.map(j => j.id); let cancelled = false;
    const tick = async () => { try { const next = await listCloudImportJobs(ids); if (!cancelled) { setJobs(next); if (next.some(j => j.status === 'COMPLETED')) window.dispatchEvent(new Event('workdrive:content-changed')); } } catch {} };
    void tick(); const timer = window.setInterval(tick, 2000); return () => { cancelled = true; window.clearInterval(timer); };
  }, [jobs.map(j => j.id).join(',')]);

  if (!detail) return null;
  const providerState = provider ? providers.find(p => p.provider === provider) : null;
  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-3 sm:p-5" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-black/35" aria-label="close" onClick={() => !busy && setDetail(null)} />
      <section className="relative flex max-h-[92vh] w-[min(900px,96vw)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="text-[16px] font-semibold text-slate-900">{ar ? 'استيراد من السحابة' : 'Import from cloud'}</h2><p className="mt-1 text-[12px] text-slate-500">{ar ? 'اختر اتصالاً سحابياً، تصفح المجلدات، ثم حدد الملفات لنسخها إلى WorkDrive.' : 'Choose a cloud connection, browse folders, then select files to copy into WorkDrive.'}</p></div><button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => !busy && setDetail(null)}><Icons.x size={17}/></button></header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid gap-2 sm:grid-cols-3">{PROVIDERS.map(p => { const state = providers.find(x => x.provider === p.id); const connected = state?.connected; return <button key={p.id} type="button" onClick={() => void chooseProvider(p.id)} className={`rounded-xl border px-3 py-3 text-start transition ${provider === p.id ? 'border-[var(--wd-primary)] bg-[#F7FAFF]' : 'border-slate-200 hover:border-slate-300'}`}><div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-[13px] font-semibold">{p.icon}</span><span className="min-w-0 flex-1 text-[12px] font-semibold text-slate-800">{ar ? p.ar : p.en}</span>{connected ? <span className="text-[10px] text-emerald-600">{ar ? 'متصل' : 'Connected'}</span> : <span className="text-[10px] text-slate-400">{ar ? 'اتصال' : 'Connect'}</span>}</div></button>; })}</div>
          {provider && providerState?.connections?.length > 0 ? <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="flex items-center gap-2"><label className="block flex-1 text-[10px] font-semibold text-slate-600">{ar ? 'الاتصال المستخدم' : 'Connection used'}<select className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-[11px]" value={connectionId ?? ''} onChange={e => void chooseProvider(provider, e.target.value)}>{providerState.connections.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><button type="button" className="mt-4 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-medium" onClick={() => void refreshProviders()}>{ar ? 'تحديث' : 'Refresh'}</button></div></div> : null}
          {provider === 'google' && providerState?.connected ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[10.5px] leading-5 text-amber-800">{ar ? 'يتطلب استعراض Google Drive صلاحية قراءة الملفات. إذا فشل العرض، أعد الاتصال بـ Google ووافق على صلاحية قراءة ملفات Drive.' : 'Google Drive browsing requires file-read access. If listing fails, reconnect Google and approve the Drive file-read permission.'}</div> : null}
          {error ? <div className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[11px] text-red-700">{error}</div> : null}
          {provider && <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-3 py-2">
              <div className="flex min-w-0 flex-1 items-center gap-1 text-[10.5px] text-slate-500">{trail.map((item, index) => <span key={`${item.id ?? 'root'}-${index}`} className="flex items-center gap-1"><button type="button" className={index === trail.length - 1 ? 'font-semibold text-slate-800' : 'hover:text-slate-800'} onClick={() => void goToTrail(index)}>{item.name}</button>{index < trail.length - 1 ? <span>/</span> : null}</span>)}</div>
              <button type="button" className="text-[11px] text-slate-500 hover:text-slate-800" onClick={toggleAllCurrent}>{allCurrentSelected ? (ar ? 'إلغاء تحديد الحالي' : 'Clear current') : (ar ? 'تحديد الملفات الحالية' : 'Select current files')}</button>
              <span className="text-[11px] text-slate-400">{selectedFiles.length}</span>
            </div>
            {loading ? <div className="p-8 text-center text-[12px] text-slate-400">{ar ? 'جارٍ تحميل الملفات…' : 'Loading cloud files…'}</div> : files.length === 0 ? <div className="p-8 text-center text-[12px] text-slate-400">{ar ? 'لا توجد ملفات أو مجلدات في هذا المكان.' : 'No files or folders found here.'}</div> : <div className="max-h-[38vh] overflow-y-auto">
              {currentFolders.map(folder => <button type="button" key={folder.id} className="flex w-full items-center gap-3 border-b border-slate-100 px-3 py-2.5 text-start hover:bg-slate-50" onClick={() => void openFolder(folder)}><span className="text-[14px]">📁</span><span className="min-w-0 flex-1 truncate text-[12px] font-medium text-slate-800">{folder.name}</span><span className="text-[10px] text-slate-400">›</span></button>)}
              {currentFiles.map(file => <label key={file.id} className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-3 py-2.5 last:border-b-0 hover:bg-slate-50"><input type="checkbox" checked={Boolean(selected[file.id])} onChange={() => toggleCurrent(file)} /><span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-medium text-slate-800">{file.name}</span><span className="block truncate text-[10px] text-slate-400">{file.mimeType}{file.size != null ? ` · ${fmt(file.size)}` : ''}</span></span></label>)}
            </div>}
            {nextPageToken && <div className="border-t border-slate-100 px-3 py-2 text-center"><button type="button" className="text-[10.5px] font-medium text-[var(--wd-primary)]" disabled={loading} onClick={() => void loadFolder(provider, connectionId, trail.at(-1)?.id ?? null, nextPageToken, true)}>{ar ? 'تحميل المزيد' : 'Load more'}</button></div>}
          </div>}
          {jobs.length > 0 && <div className="mt-4 space-y-2">{jobs.map(job => <div key={job.id} className="rounded-xl border border-slate-200 p-3"><div className="flex gap-2"><span className="min-w-0 flex-1 truncate text-[12px] font-medium">{job.remoteName}</span><span className="text-[10px] text-slate-400">{job.status === 'COMPLETED' ? '100%' : `${job.progress}%`}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[var(--wd-primary)] transition-all" style={{ width: `${job.progress}%` }} /></div>{job.error ? <div className="mt-1 flex items-center gap-2"><p className="min-w-0 flex-1 text-[10px] text-red-600">{job.error}</p><button type="button" className="shrink-0 text-[10px] font-medium text-[var(--wd-primary)] hover:underline" onClick={() => void retryCloudImport(job.id).then(next => setJobs(current => current.map(item => item.id === next.id ? next : item))).catch(() => undefined)}>{ar ? 'إعادة المحاولة' : 'Retry'}</button></div> : null}</div>)}</div>}
        </div>
        <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-100 px-5 py-3"><span className="text-[10px] text-slate-400">{ar ? `تم تحديد ${selectedFiles.length} ملف. يستمر الاستيراد على الخادم.` : `${selectedFiles.length} file(s) selected. Imports continue on the server.`}</span><div className="flex gap-2"><button type="button" className="wd-pill wd-pill-record" disabled={busy} onClick={() => setDetail(null)}>{ar ? 'إغلاق' : 'Close'}</button><button type="button" className="wd-pill wd-pill-new" disabled={busy || !selectedFiles.length || !provider} onClick={() => void importSelected()}>{busy ? (ar ? 'جارٍ البدء…' : 'Starting…') : (ar ? `استيراد (${selectedFiles.length})` : `Import (${selectedFiles.length})`)}</button></div></footer>
      </section>
    </div>, document.body
  );
}
