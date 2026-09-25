"use client";

import { useEffect, useMemo, useState } from "react";
import { browseConnectionResources, startConnectionOAuth, uploadConnectionFile, type Connection, type ConnectionResource } from "@/lib/api/workflows";
import { buildOAuthStartReturnPath } from "@/app/files/connections/connections-oauth-return-logic";
import { readBrowserAccessToken, stashBrowserAccessTokenForOAuth } from "@/components/auth-gate-logic";
import { connectionBrowseReady, connectionStatusLabel, friendlyConnectionError, googleDriveReconnectRequired, parseConnectionError, providerSupports, reconnectProviderLabel } from "@/components/connection-picker-logic";

function beginOAuth(provider: string, connectionId?: string) {
  const returnTo = buildOAuthStartReturnPath(window.location.pathname, window.location.search);
  stashBrowserAccessTokenForOAuth(readBrowserAccessToken(localStorage, document.cookie));
  return startConnectionOAuth(provider, undefined, connectionId, returnTo).then((result) => { window.location.href = result.url; });
}

export function ConnectionPicker({ connections, value, onChange, provider, capability }: { connections: Connection[]; value: string; onChange: (id: string) => void; provider?: string; capability?: "browse" | "request" }) {
  const rows = useMemo(() => connections.filter((item) => {
    if (provider && item.provider !== provider) return false;
    if (capability === "browse" && !providerSupports(item.provider, "list")) return false;
    return true;
  }), [connections, provider, capability]);
  const selected = rows.find((item) => item.id === value) ?? null;
  const status = connectionStatusLabel(selected?.status);
  const label = provider === "google" ? "Google Drive" : provider === "dropbox" ? "Dropbox" : provider === "microsoft" ? "OneDrive" : "connection";
  const usableRows = useMemo(() => rows.filter((item) => connectionBrowseReady(item)), [rows]);
  const reconnectable = useMemo(() => rows.filter((item) => item.authType === "OAUTH2" && !connectionBrowseReady(item)), [rows]);
  useEffect(() => {
    if (value || typeof window === "undefined") return;
    const returned = new URLSearchParams(window.location.search).get("connectionId");
    if (returned && usableRows.some((item) => item.id === returned)) onChange(returned);
  }, [usableRows, value, onChange]);
  return (
    <label className="workflow-action-field sm:col-span-2">
      <span>Connection</span>
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--wd-line,var(--wd-border,#E0E6EC))] bg-[var(--wd-bg,#fff)] p-3 text-[12px] text-[var(--wd-text,#202B38)]">
          No {label} connection
          <div className="mt-2"><a className="wd-btn wd-btn-primary" href="/files/connections">+ Connect {label}</a></div>
        </div>
      ) : (
        <select className="bg-[var(--wd-bg,#fff)] text-[var(--wd-text,#202B38)]" value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">Select a connection</option>
          {usableRows.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.provider}{item.baseUrl ? ` · ${item.baseUrl}` : ""}</option>)}
          {reconnectable.map((item) => <option key={item.id} value="" disabled>{item.name} · Needs reconnect</option>)}
        </select>
      )}
      {selected && status === "connected" && !googleDriveReconnectRequired(selected) ? <small className="mt-1 block text-[11px] text-emerald-700">Connected · credentials stay server-side</small> : null}
      {selected && (status !== "connected" || googleDriveReconnectRequired(selected)) ? (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          {googleDriveReconnectRequired(selected) ? friendlyConnectionError("INSUFFICIENT_SCOPE: Google Drive file access is not authorized for this connection.") : selected.status === "REAUTH_REQUIRED" || selected.status === "PENDING_AUTH" ? "Connection needs reconnect." : "Connection is not available."}
          {selected.authType === "OAUTH2" && selected.canManage ? <button type="button" className="ms-2 font-semibold underline" onClick={() => void beginOAuth(selected.provider, selected.id)}>{reconnectProviderLabel(selected.provider)}</button> : null}
        </div>
      ) : null}
      {selected?.baseUrl ? <small className="mt-1 block truncate text-[10px] text-slate-400">API base: {selected.baseUrl}</small> : null}
    </label>
  );
}

export function ResourcePicker({ connectionId, provider, value, label, onChange }: { connectionId: string; provider?: string; value: string; label?: string; onChange: (resource: ConnectionResource) => void }) {
  const [parent, setParent] = useState<string | undefined>(undefined);
  const [trail, setTrail] = useState<Array<{ id?: string; name: string }>>([{ name: "My files" }]);
  const [folders, setFolders] = useState<ConnectionResource[]>([]);
  const [files, setFiles] = useState<ConnectionResource[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const visibleFolders = useMemo(() => folders.filter((item) => item.name.toLowerCase().includes(query.toLowerCase())), [folders, query]);
  const visibleFiles = useMemo(() => files.filter((item) => item.name.toLowerCase().includes(query.toLowerCase())), [files, query]);

  useEffect(() => {
    setParent(undefined);
    setTrail([{ name: "My files" }]);
    setQuery("");
    setNextPageToken(null);
  }, [connectionId, provider]);

  useEffect(() => {
    if (!connectionId || !providerSupports(provider, "list")) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    browseConnectionResources(connectionId, parent).then((result) => {
      if (cancelled) return;
      setFolders(result.folders);
      setFiles(result.files);
      setNextPageToken(result.nextPageToken ?? null);
    }).catch((reason: unknown) => {
      if (!cancelled) setError(friendlyConnectionError(reason instanceof Error ? reason.message : "Couldn't load files"));
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [connectionId, parent, provider, reload]);

  const loadMore = () => {
    if (!connectionId || !nextPageToken || loading) return;
    setLoading(true);
    void browseConnectionResources(connectionId, parent, nextPageToken).then((result) => {
      setFolders((current) => [...current, ...result.folders]);
      setFiles((current) => [...current, ...result.files]);
      setNextPageToken(result.nextPageToken ?? null);
    }).catch((reason: unknown) => setError(friendlyConnectionError(reason instanceof Error ? reason.message : "Couldn't load files"))).finally(() => setLoading(false));
  };

  if (!connectionId || !providerSupports(provider, "list")) return null;
  return (
    <div className="workflow-action-field sm:col-span-2 text-[var(--wd-text,#202B38)]">
      <span>Folder and file</span>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-[var(--wd-text-muted,#667085)]">
        <span>{trail.map((item) => item.name).join(" / ")}</span>
        {label ? <strong className="text-[var(--wd-text,#202B38)]">{label}</strong> : null}
        <button type="button" className="underline" onClick={() => setReload((item) => item + 1)}>Refresh</button>
      </div>
      <input className="mb-2 w-full" aria-label="Filter files" placeholder="Filter this folder" value={query} onChange={(event) => setQuery(event.target.value)} />
      {loading ? <p className="text-[12px]">Loading folders...</p> : null}
      {error ? <p className="text-[12px]">{error} {(() => { const parsed = parseConnectionError(error); if (parsed.code === "INSUFFICIENT_SCOPE" || parsed.code === "DRIVE_SCOPE_REQUIRED") return <button type="button" className="ms-1 font-semibold underline" onClick={() => void beginOAuth(provider ?? "", connectionId)}>{reconnectProviderLabel(provider)}</button>; return <button type="button" className="underline" onClick={() => setReload((item) => item + 1)}>Retry</button>; })()}</p> : null}
      {!loading && !error && visibleFolders.length === 0 && visibleFiles.length === 0 ? <p className="text-[12px]">No files found</p> : null}
      <div className="max-h-52 overflow-auto rounded-lg border border-[var(--wd-line,var(--wd-border,#E0E6EC))] bg-[var(--wd-bg,#fff)]">
        {trail.length > 1 ? <button type="button" className="block w-full px-3 py-2 text-start text-[12px]" onClick={() => { const next = trail.slice(0, -1); setTrail(next); setParent(next.at(-1)?.id); }}>Back</button> : null}
        {visibleFolders.map((folder) => <button type="button" key={folder.id} className="block w-full px-3 py-2 text-start text-[12px]" onClick={() => { setTrail((current) => [...current, { id: folder.id, name: folder.name }]); setParent(folder.id); }}>{folder.name}</button>)}
        {visibleFiles.map((file) => <button type="button" key={file.id} className="block w-full px-3 py-2 text-start text-[12px]" onClick={() => onChange(file)}>{file.name}{file.id === value ? " · selected" : ""}</button>)}
      </div>
      {nextPageToken ? <button type="button" className="mt-2 text-[11px] font-semibold text-[var(--wd-primary)] underline" onClick={() => loadMore()} disabled={loading}>Load more</button> : null}
      {value ? <details className="mt-2 text-[11px]"><summary>Advanced</summary><button type="button" className="mt-1 underline" onClick={() => void navigator.clipboard.writeText(value)}>Copy internal reference</button></details> : null}
    </div>
  );
}

export function ConnectionUpload({ connectionId, provider, parentId, parentName }: { connectionId: string; provider?: string; parentId?: string; parentName?: string }) {
  const [status, setStatus] = useState("");
  const [uploaded, setUploaded] = useState("");
  if (!connectionId || !providerSupports(provider, "upload")) return null;
  return (
    <div className="workflow-action-field sm:col-span-2">
      <span>Upload</span>
      <input type="file" aria-label="Choose file" onChange={(event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setStatus("Uploading...");
        const reader = new FileReader();
        reader.onload = () => {
          const content = String(reader.result ?? "");
          const contentBase64 = content.includes(",") ? content.split(",")[1] : content;
          void uploadConnectionFile(connectionId, { parentId, name: file.name, contentBase64 }).then((result) => {
            setUploaded(result.name);
            setStatus(`Upload completed · ${result.name}${parentName ? ` · ${parentName}` : ""}`);
          }).catch((reason: unknown) => setStatus(friendlyConnectionError(reason instanceof Error ? reason.message : "")));
        };
        reader.readAsDataURL(file);
      }} />
      {status ? <p className="mt-1 text-[12px]">{status}</p> : null}
      {uploaded ? <p className="text-[12px]">Uploaded file: {uploaded}</p> : null}
    </div>
  );
}
