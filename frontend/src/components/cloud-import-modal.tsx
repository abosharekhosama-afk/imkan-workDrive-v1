"use client";

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocale } from './locale-provider';
import { Icons } from './layout/icons';
import { readBrowserAccessToken, stashBrowserAccessTokenForOAuth } from './auth-gate-logic';
import {
  cloudOAuthStart,
  createCloudImports,
  listCloudFiles,
  listCloudImportJobs,
  listCloudProviders,
  retryCloudImport,
  type CloudImportJob,
  type CloudProvider,
  type CloudProviderState,
  type CloudRemoteFile,
} from '../lib/api/cloud-import';
import { cloudFilesFromListing } from '../lib/api/cloud-import-listing-logic';

type Detail = { folderId: string | null };
type UiProvider = CloudProvider | 'box' | 'evernote';

type ProviderDefinition = {
  id: UiProvider;
  en: string;
  ar: string;
  available: boolean;
};

const PROVIDERS: ProviderDefinition[] = [
  { id: 'google', en: 'Google Drive', ar: 'Google Drive', available: true },
  { id: 'box', en: 'Box', ar: 'Box', available: false },
  { id: 'dropbox', en: 'Dropbox', ar: 'Dropbox', available: true },
  { id: 'onedrive', en: 'OneDrive', ar: 'OneDrive', available: true },
  { id: 'evernote', en: 'Evernote', ar: 'Evernote', available: false },
];

const fmt = (n: number | null) =>
  n == null
    ? ''
    : n < 1024
      ? `${n} B`
      : n < 1024 ** 2
        ? `${(n / 1024).toFixed(1)} KB`
        : n < 1024 ** 3
          ? `${(n / 1024 ** 2).toFixed(1)} MB`
          : `${(n / 1024 ** 3).toFixed(1)} GB`;

function GoogleDriveIcon() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden="true">
      <path fill="#0F9D58" d="M10.1 4.8 4 15.4l5.2 9h10.4l5.1-9-6.1-10.6z" />
      <path fill="#4285F4" d="m4 15.4 5.2 9h10.4l-3-5.2H7.1z" />
      <path fill="#F4B400" d="M10.1 4.8h8.5l6.1 10.6-5.1 9-5.3-9.2z" />
    </svg>
  );
}

function DropboxIcon() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden="true">
      <path fill="#1683FF" d="m8 6 7 5-5 4-7-5zm16 0-7 5 5 4 7-5zM8 16l7 5 5-4-7-5zm16 0-7 5-5-4 7-5z" />
      <path fill="#1683FF" d="m11 22 5 3 5-3 2 2-7 4-7-4z" />
    </svg>
  );
}

function OneDriveIcon() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden="true">
      <path fill="#1683D8" d="M12.3 23.8H25a4.6 4.6 0 0 0 .8-9.1 8.2 8.2 0 0 0-15.3-3.1A6.2 6.2 0 0 0 12.3 23.8Z" />
      <path fill="#50A9E8" d="M5.9 23.8h14.4a5.4 5.4 0 0 0-1.8-10.5 7.7 7.7 0 0 0-7.4 5.4 5.1 5.1 0 0 0-5.2 5.1Z" />
    </svg>
  );
}

function BoxIcon() {
  return (
    <span className="grid h-7 w-7 place-items-center rounded-[7px] bg-[#1677d2] text-[16px] font-bold leading-none text-white" aria-hidden="true">
      <span className="translate-y-[-1px]">box</span>
    </span>
  );
}

function EvernoteIcon() {
  return (
    <span className="grid h-7 w-7 place-items-center rounded-[7px] bg-[#22b573] text-[18px] font-black leading-none text-white" aria-hidden="true">
      e
    </span>
  );
}

function ProviderIcon({ id }: { id: UiProvider }) {
  if (id === 'google') return <GoogleDriveIcon />;
  if (id === 'dropbox') return <DropboxIcon />;
  if (id === 'onedrive') return <OneDriveIcon />;
  if (id === 'box') return <BoxIcon />;
  return <EvernoteIcon />;
}

function ProviderRailItem({
  provider,
  active,
  connected,
  expanded,
  disabled,
  onClick,
  locale,
}: {
  provider: ProviderDefinition;
  active: boolean;
  connected: boolean;
  expanded: boolean;
  disabled: boolean;
  onClick: () => void;
  locale: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={expanded ? undefined : locale === 'ar' ? provider.ar : provider.en}
      aria-label={locale === 'ar' ? provider.ar : provider.en}
      onClick={onClick}
      className={`group/provider relative flex h-[58px] w-full items-center rounded-[8px] px-[13px] text-left transition-colors ${
        active ? 'bg-white' : 'hover:bg-white/70'
      } ${disabled ? 'cursor-default opacity-70' : 'cursor-pointer'}`}
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center">
        <ProviderIcon id={provider.id} />
      </span>
      <span
        className={`ml-3 min-w-0 whitespace-nowrap text-[13px] font-medium text-[#435065] transition-opacity duration-150 ${
          expanded ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {locale === 'ar' ? provider.ar : provider.en}
      </span>
      {connected ? (
        <span
          className={`ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-[#18a66a] transition-opacity ${
            expanded ? 'opacity-100' : 'opacity-0'
          }`}
          aria-label={locale === 'ar' ? 'متصل' : 'Connected'}
        />
      ) : null}
    </button>
  );
}

export function CloudImportHost() {
  const { locale } = useLocale();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [provider, setProvider] = useState<UiProvider>('google');
  const [providers, setProviders] = useState<CloudProviderState[]>([]);
  const [files, setFiles] = useState<CloudRemoteFile[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [jobs, setJobs] = useState<CloudImportJob[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [railExpanded, setRailExpanded] = useState(false);
  const [showAccounts, setShowAccounts] = useState(false);
  const [filesRequested, setFilesRequested] = useState(false);

  const connectedState = useMemo(
    () => (provider === 'box' || provider === 'evernote' ? null : providers.find((p) => p.provider === provider) ?? null),
    [provider, providers],
  );

  const activeConnections = connectedState?.connections ?? [];

  const open = (folderId: string | null) => {
    setDetail({ folderId });
    setProvider('google');
    setConnectionId(null);
    setFiles([]);
    setSelected([]);
    setJobs([]);
    setError('');
    setFilesRequested(false);
    setShowAccounts(false);
    void refreshProviders();
    void loadRecentJobs();
  };

  const loadRecentJobs = async () => {
    try {
      setJobs(await listCloudImportJobs());
    } catch {
      // Job history is secondary UI; keep the picker usable if it is unavailable.
    }
  };

  const refreshProviders = async () => {
    try {
      setProviders(await listCloudProviders());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load cloud providers');
    }
  };

  useEffect(() => {
    const handler = (event: Event) => {
      const value = (event as CustomEvent<Detail>).detail;
      open(value?.folderId ?? null);
    };
    window.addEventListener('workdrive:cloud-import', handler);

    const params = new URLSearchParams(window.location.search);
    const connected = params.get('cloudImport');
    const returnedConnectionId = params.get('connectionId');
    if (connected) {
      open(params.get('folderId') || null);
      setProvider(connected as UiProvider);
      if (returnedConnectionId) setConnectionId(returnedConnectionId);
      window.history.replaceState({}, '', window.location.pathname);
    }

    return () => window.removeEventListener('workdrive:cloud-import', handler);
  }, []);

  const chooseProvider = async (next: UiProvider, selectedConnectionId?: string | null) => {
    if (next === 'box' || next === 'evernote') return;

    setProvider(next);
    setSelected([]);
    setFiles([]);
    setFilesRequested(false);
    setShowAccounts(false);
    setError('');
    setLoading(true);

    try {
      const state = providers.find((p) => p.provider === next);
      const selectedId = selectedConnectionId || state?.connectionId || null;
      setConnectionId(selectedId);
      if (!state?.connected) {
        stashBrowserAccessTokenForOAuth(readBrowserAccessToken(localStorage, document.cookie));
        const { url } = await cloudOAuthStart(next, detail?.folderId ?? null);
        window.location.assign(url);
        return;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to access this cloud provider');
    } finally {
      setLoading(false);
    }
  };

  const requestFiles = async () => {
    if (!connectedState || provider === 'box' || provider === 'evernote') return;
    setFilesRequested(true);
    setSelected([]);
    setError('');
    setLoading(true);
    try {
      const next = await listCloudFiles(provider, connectionId || connectedState.connectionId || null);
      setFiles(cloudFilesFromListing(next));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to access this cloud provider');
    } finally {
      setLoading(false);
    }
  };

  const switchConnection = async (nextId: string) => {
    setConnectionId(nextId);
    setShowAccounts(false);
    setFiles([]);
    setSelected([]);
    setFilesRequested(false);
    setError('');
  };

  const authenticateAnotherAccount = async () => {
    if (provider === 'box' || provider === 'evernote') return;
    try {
      stashBrowserAccessTokenForOAuth(readBrowserAccessToken(localStorage, document.cookie));
      const { url } = await cloudOAuthStart(provider, detail?.folderId ?? null);
      window.location.assign(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to start authentication');
    }
  };

  const importSelected = async () => {
    if (!provider || provider === 'box' || provider === 'evernote' || !detail || !selected.length) return;
    setBusy(true);
    setError('');
    try {
      const created = await createCloudImports(
        provider,
        detail.folderId,
        cloudFilesFromListing(files).filter((f) => selected.includes(f.id)).map((f) => ({ id: f.id, name: f.name })),
        connectionId,
      );
      setJobs(created);
      setSelected([]);
      window.dispatchEvent(new Event('workdrive:content-changed'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to start cloud import');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!detail || !provider || !providers.length || loading || files.length || filesRequested) return;
    const state = providers.find((p) => p.provider === provider);
    if (state?.connected && connectionId && connectionId !== state.connectionId) {
      setConnectionId(connectionId);
    } else if (state?.connected && !connectionId) {
      setConnectionId(state.connectionId);
    }
  }, [detail, provider, providers, loading, files.length, filesRequested, connectionId]);

  useEffect(() => {
    const activeJobs = jobs.filter((job) => job.status === 'PENDING' || job.status === 'IN_PROGRESS');
    if (!activeJobs.length) return;
    const ids = activeJobs.map((j) => j.id);
    let cancelled = false;
    let contentRefreshSent = false;
    const tick = async () => {
      try {
        const next = await listCloudImportJobs(ids);
        if (cancelled) return;
        setJobs((current) => {
          const byId = new Map(next.map((job) => [job.id, job]));
          return current.map((job) => byId.get(job.id) ?? job);
        });
        if (!contentRefreshSent && next.some((j) => j.status === 'COMPLETED')) {
          contentRefreshSent = true;
          window.dispatchEvent(new Event('workdrive:content-changed'));
        }
      } catch {
        // Keep the current job state while polling is temporarily unavailable.
      }
    };
    void tick();
    const timer = window.setInterval(tick, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [jobs.filter((j) => j.status === 'PENDING' || j.status === 'IN_PROGRESS').map((j) => j.id).join(',')]);

  if (!detail) return null;

  const fileRows = cloudFilesFromListing(files);
  const selectedFiles = fileRows.filter((f) => selected.includes(f.id));
  const allSelected = fileRows.length > 0 && selected.length === fileRows.length;
  const currentProvider = PROVIDERS.find((p) => p.id === provider) ?? PROVIDERS[0];
  const hasConnection = Boolean(connectedState?.connected);
  const accountName = connectedState?.connectionName || activeConnections.find((c) => c.id === connectionId)?.name || 'Google Drive';

  return createPortal(
    <div className="imkan-cloud-import-overlay" role="dialog" aria-modal="true" aria-label={locale === 'ar' ? 'استيراد من السحابة' : 'Import from cloud'}>
      <button className="imkan-cloud-import-backdrop" aria-label="close" onClick={() => !busy && setDetail(null)} />

      <section className="imkan-cloud-import-modal">
        <aside
          className={`imkan-cloud-provider-rail ${railExpanded ? 'is-expanded' : ''}`}
          onMouseEnter={() => setRailExpanded(true)}
          onMouseLeave={() => setRailExpanded(false)}
          onFocus={() => setRailExpanded(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setRailExpanded(false);
          }}
        >
          <div className="imkan-cloud-provider-rail-inner">
            {PROVIDERS.map((item) => {
              const state = item.available && item.id !== 'box' && item.id !== 'evernote' ? providers.find((p) => p.provider === item.id) : undefined;
              return (
                <ProviderRailItem
                  key={item.id}
                  provider={item}
                  active={provider === item.id}
                  connected={Boolean(state?.connected)}
                  expanded={railExpanded}
                  disabled={!item.available}
                  locale={locale}
                  onClick={() => void chooseProvider(item.id)}
                />
              );
            })}
          </div>
        </aside>

        <button className="imkan-cloud-import-close" type="button" onClick={() => !busy && setDetail(null)} aria-label={locale === 'ar' ? 'إغلاق' : 'Close'}>
          <Icons.x size={22} />
        </button>

        {hasConnection ? (
          <button type="button" className="imkan-cloud-account-chip" onClick={() => setShowAccounts((v) => !v)} aria-label={locale === 'ar' ? 'إدارة الحسابات' : 'Manage accounts'}>
            <span className="imkan-cloud-account-avatar">{accountName.trim().charAt(0).toUpperCase()}</span>
            <Icons.chevD size={14} />
          </button>
        ) : null}

        {showAccounts && hasConnection ? (
          <div className="imkan-cloud-accounts-panel">
            <div className="imkan-cloud-accounts-title">
              <ProviderIcon id={provider} />
              <span>{locale === 'ar' ? 'إدارة الحسابات' : 'Manage accounts'}</span>
              <button type="button" onClick={() => setShowAccounts(false)} aria-label="Close">
                <Icons.x size={16} />
              </button>
            </div>
            <div className="imkan-cloud-accounts-list">
              {(activeConnections.length ? activeConnections : [{ id: connectionId || '', name: accountName, updatedAt: '', expiresAt: null }]).map((account) => (
                <button key={account.id} type="button" className={`imkan-cloud-account-row ${account.id === connectionId ? 'is-active' : ''}`} onClick={() => void switchConnection(account.id)}>
                  <span className="imkan-cloud-account-avatar">{account.name.trim().charAt(0).toUpperCase()}</span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-[13px] font-semibold text-[#263248]">{account.name}</span>
                    <span className="block text-[11px] text-[#7a8496]">{account.id === connectionId ? (locale === 'ar' ? 'الحساب المستخدم' : 'Current account') : ''}</span>
                  </span>
                  {account.id === connectionId ? <Icons.check size={17} /> : null}
                </button>
              ))}
            </div>
            <button type="button" className="imkan-cloud-auth-another" onClick={() => void authenticateAnotherAccount()}>
              <span className="grid h-7 w-7 place-items-center rounded-full border border-[#dfe5ee] text-[#4285f4]"><Icons.plus size={15} /></span>
              <span>{locale === 'ar' ? 'مصادقة حساب آخر' : 'Authenticate another account'}</span>
            </button>
          </div>
        ) : null}

        <main className="imkan-cloud-import-main">
          <div className="imkan-cloud-import-content">
            {error ? <div className="imkan-cloud-import-error">{error}</div> : null}

            {filesRequested && fileRows.length > 0 ? (
              <div className="imkan-cloud-files-view">
                <div className="imkan-cloud-files-toolbar">
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-semibold text-[#273247]">{locale === 'ar' ? 'ملفات Google Drive' : `${currentProvider.en} files`}</div>
                    <div className="mt-0.5 text-[11px] text-[#8a93a3]">{selectedFiles.length} / {fileRows.length} {locale === 'ar' ? 'محدد' : 'selected'}</div>
                  </div>
                  <button type="button" className="imkan-cloud-select-all" onClick={() => setSelected(allSelected ? [] : fileRows.map((f) => f.id))}>
                    {allSelected ? (locale === 'ar' ? 'إلغاء تحديد الكل' : 'Clear all') : locale === 'ar' ? 'تحديد الكل' : 'Select all'}
                  </button>
                </div>
                {loading ? (
                  <div className="imkan-cloud-empty"><span className="imkan-cloud-spinner" />{locale === 'ar' ? 'جارٍ تحميل الملفات…' : 'Loading cloud files…'}</div>
                ) : (
                  <div className="imkan-cloud-files-list">
                    {fileRows.map((file) => (
                      <label key={file.id} className="imkan-cloud-file-row">
                        <input type="checkbox" checked={selected.includes(file.id)} onChange={() => setSelected((s) => (s.includes(file.id) ? s.filter((id) => id !== file.id) : [...s, file.id]))} />
                        <span className="imkan-cloud-file-icon"><Icons.doc size={18} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-[#2d374b]">{file.name}</span>
                          <span className="block truncate text-[10px] text-[#8b95a5]">{file.mimeType}{file.size != null ? ` · ${fmt(file.size)}` : ''}</span>
                        </span>
                        <span className="text-[11px] text-[#9aa3b2]">{file.modifiedAt ? new Date(file.modifiedAt).toLocaleDateString() : ''}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="imkan-cloud-access-state">
                <div className="imkan-cloud-illustration" aria-hidden="true">
                  <div className="imkan-cloud-illustration-person" />
                  <div className="imkan-cloud-illustration-screen"><span>✓</span></div>
                  <div className="imkan-cloud-illustration-folder" />
                </div>
                <h1>{locale === 'ar' ? 'يلزم الوصول إلى الملفات' : 'Files access required'}</h1>
                <p>
                  {hasConnection
                    ? locale === 'ar'
                      ? `${currentProvider.ar} متصل. اختر الملفات التي تريد السماح لـ IMKAN WorkDrive بالوصول إليها.`
                      : `IMKAN WorkDrive doesn't have access to ${currentProvider.en} files. Select preferred files to allow access.`
                    : locale === 'ar'
                      ? `اربط حساب ${currentProvider.ar} للوصول إلى ملفاتك.`
                      : `Connect your ${currentProvider.en} account to access your files.`}
                </p>
                <button type="button" className="imkan-cloud-primary-action" disabled={loading} onClick={() => (hasConnection ? void requestFiles() : void chooseProvider(provider))}>
                  {loading ? <span className="imkan-cloud-spinner imkan-cloud-spinner-light" /> : null}
                  {hasConnection ? (locale === 'ar' ? 'تحديد الملفات' : 'Select files') : locale === 'ar' ? `مصادقة ${currentProvider.ar}` : `Authenticate ${currentProvider.en}`}
                </button>
                <span className="imkan-cloud-action-hint">
                  {hasConnection ? (locale === 'ar' ? 'يفتح محدد الملفات لاختيار الملفات' : 'Opens the cloud file picker for selection') : locale === 'ar' ? 'يبدأ اتصال OAuth آمن' : 'Starts a secure OAuth connection'}
                </span>
                <div className="imkan-cloud-access-actions">
                  <button type="button" className="imkan-cloud-footer-secondary" disabled={busy} onClick={() => setDetail(null)}>{locale === 'ar' ? 'إغلاق' : 'Close'}</button>
                  <button type="button" className="imkan-cloud-footer-primary" disabled={busy || !selected.length || !provider || provider === 'box' || provider === 'evernote'} onClick={() => void importSelected()}>
                    {busy ? (locale === 'ar' ? 'جارٍ البدء…' : 'Starting…') : locale === 'ar' ? `إرفاق (${selected.length})` : `Attach (${selected.length})`}
                    <Icons.chevR size={15} />
                  </button>
                </div>
              </div>
            )}

            {filesRequested && !loading && fileRows.length === 0 ? (
              <div className="imkan-cloud-empty imkan-cloud-empty-large">
                {locale === 'ar' ? 'لا توجد ملفات قابلة للاستيراد في هذا الحساب.' : 'No importable files found in this cloud account.'}
              </div>
            ) : null}

            {jobs.length > 0 ? (
              <div className="imkan-cloud-jobs">
                {jobs.map((job) => (
                  <div key={job.id} className="imkan-cloud-job">
                    <div className="flex gap-2">
                      <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{job.remoteName}</span>
                      <span className="text-[10px] text-[#8b95a5]">{job.status === 'COMPLETED' ? '100%' : `${job.progress}%`}</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#eef1f5]"><div className="h-full rounded-full bg-[var(--wd-primary)] transition-all" style={{ width: `${job.progress}%` }} /></div>
                    {job.error ? (
                      <div className="mt-1 flex items-center gap-2">
                        <p className="min-w-0 flex-1 text-[10px] text-red-600">{job.error}</p>
                        <button type="button" className="text-[10px] font-medium text-[var(--wd-primary)] hover:underline" onClick={() => void retryCloudImport(job.id).then((next) => setJobs((current) => current.map((item) => (item.id === next.id ? next : item)))).catch(() => undefined)}>
                          {locale === 'ar' ? 'إعادة المحاولة' : 'Retry'}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </main>

        {filesRequested && fileRows.length > 0 ? (
          <footer className="imkan-cloud-import-footer">
            <span>{locale === 'ar' ? 'تستمر عملية الاستيراد على الخادم حتى عند انقطاع اتصال المتصفح.' : 'Imports continue on the server if the browser connection drops.'}</span>
            <div className="flex items-center gap-2">
              <button type="button" className="imkan-cloud-footer-secondary" disabled={busy} onClick={() => setDetail(null)}>{locale === 'ar' ? 'إغلاق' : 'Close'}</button>
              <button type="button" className="imkan-cloud-footer-primary" disabled={busy || !selected.length || !provider || provider === 'box' || provider === 'evernote'} onClick={() => void importSelected()}>
                {busy ? (locale === 'ar' ? 'جارٍ البدء…' : 'Starting…') : locale === 'ar' ? `إرفاق (${selected.length})` : `Attach (${selected.length})`}
                <Icons.chevR size={15} />
              </button>
            </div>
          </footer>
        ) : null}
      </section>
    </div>,
    document.body,
  );
}
