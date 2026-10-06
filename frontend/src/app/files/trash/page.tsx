"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "../../../components/locale-provider";
import { useConfirmAction } from "../../../components/confirm-action-modal";
import { ApiError } from "../../../lib/api/client";
import { emptyTrash, permanentDeleteFile } from "../../../lib/api/files";
import { listTrash, restoreFile } from "../../../lib/api/trash";
import type { FileRecord } from "../../../lib/api/types";
import { fileIconKind, FileTypeIcon } from "../../../components/file-icon";
import { errorMessageForStatus } from "../../../components/feedback-state-logic";
import { formatBytes, resolveItemSize } from "../../../lib/api/quota";

function formatDate(value?: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function TrashPage() {
  const { label, locale } = useLocale();
  const { requestConfirm, confirmModal } = useConfirmAction();
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setNotice(null);
      setFiles(await listTrash());
    } catch (cause) {
      setError(
        errorMessageForStatus(cause instanceof ApiError ? cause.status : undefined, {
          unauthenticated: label("error.unauthenticated"),
          forbidden: label("error.forbidden"),
          generic: label("error.generic"),
        }),
      );
    } finally {
      setLoading(false);
    }
  }, [label]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalSize = useMemo(
    () => files.reduce((sum, file) => sum + (file.size ?? 0), 0),
    [files],
  );
  const visibleFiles = useMemo(() => { const q = query.trim().toLowerCase(); return q ? files.filter((f) => f.name.toLowerCase().includes(q) || String(f.folderName ?? "").toLowerCase().includes(q)) : files; }, [files, query]);

  async function handleRestore(fileId: string) {
    setBusyId(fileId);
    setError(null);
    try {
      await restoreFile(fileId);
      await load();
    } catch {
      setError(label("error.generic"));
    } finally {
      setBusyId(null);
    }
  }

  function handleDeleteForever(fileId: string) {
    requestConfirm({
      title: label("trash.confirmPermanent"),
      description: label("trash.confirmPermanent"),
      confirmLabel: label("trash.deleteForever"),
      run: async () => {
        setBusyId(fileId);
        setError(null);
        try {
          await permanentDeleteFile(fileId);
          await load();
        } catch {
          setError(label("error.generic"));
        } finally {
          setBusyId(null);
        }
      },
    });
  }

  function handleEmptyTrash() {
    requestConfirm({
      title: label("trash.emptyTrash"),
      description: label("trash.confirmEmpty"),
      confirmLabel: label("trash.emptyTrash"),
      run: async () => {
        setError(null);
        try {
          await emptyTrash();
          await load();
        } catch {
          setError(label("error.generic"));
        }
      },
    });
  }

  return (
    <div className="wd-page">
      {confirmModal}
      <header className="zoho-trash-head">
        <div><h1>⌫ {label("files.trash")}</h1><p>{files.length} {locale === "ar" ? "عنصر" : "items"} · {formatBytes(totalSize)}</p></div>
        <div className="zoho-trash-actions"><button type="button" className="wd-btn wd-btn-ghost" onClick={() => void load()} disabled={loading}>⟳ {label("recent.refresh")}</button>{files.length > 0 ? <button type="button" className="wd-btn wd-btn-danger" onClick={() => void handleEmptyTrash()}>⌫ {label("trash.emptyTrash")}</button> : null}</div>
      </header>
      <div className="zoho-trash-toolbar"><div className="zoho-trash-search"><span>⌕</span><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder={locale === "ar" ? "البحث في سلة المحذوفات" : "Search trash"}/></div><span className="zoho-trash-retention">{locale === "ar" ? "العناصر المحذوفة يمكن استعادتها من هنا." : "Deleted items can be restored from here."}</span></div>

      {error ? <div className="wd-alert" role="alert">{error}</div> : null}
      {!error && notice ? <div className="wd-alert wd-alert-success" role="status">{notice}</div> : null}

      {loading ? (
        <div className="wd-card" aria-busy="true">
          {[50, 38, 66].map((width, index) => (
            <div key={index} className="wd-skel-row" style={{ paddingInline: 16 }}>
              <span className="wd-skel-bar" style={{ width: 30, height: 30 }} />
              <span className="wd-skel-bar flex-1" style={{ width: `${width}%` }} />
              <span className="wd-skel-bar" style={{ width: 110 }} />
              <span className="wd-skel-bar" style={{ width: 140 }} />
            </div>
          ))}
          <span className="sr-only" role="status">{label("common.loading")}</span>
        </div>
      ) : files.length === 0 ? (
        <div className="wd-card">
          <div className="wd-empty">
            <span className="wd-empty-icon" aria-hidden="true">⌫</span>
            <h2>{label("files.trash")}</h2>
            <p>{label("files.empty")}</p>
            <button type="button" className="wd-btn wd-btn-ghost wd-btn-sm" onClick={() => void load()}>
              ⟳ {label("recent.refresh")}
            </button>
          </div>
        </div>
      ) : (
        <div className="wd-card overflow-x-auto w-full max-w-full">
          <table className="zoho-info-table zoho-trash-table">
            <thead>
              <tr>
                <th>{label("files.column.name")}</th><th>{label("trash.location")}</th><th>{label("trash.deletedAt")}</th><th className="num">{label("files.column.size")}</th><th className="num">{label("files.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {visibleFiles.map((file) => (
                <tr key={file.id}>
                  <td>
                    <div className="wd-name-cell">
                      <span className="icon" aria-hidden="true">
                        <FileTypeIcon size={18} kind={fileIconKind("file", file.mimeType ?? undefined, file.name)} />
                      </span>
                      <span className="wd-name-link" title={file.name}>{file.name}</span>
                    </div>
                  </td>
                  <td className="imkan-muted">{file.folderName ?? label("files.breadcrumb.root")}</td>
                  <td className="imkan-muted">{formatDate(file.deletedAt)}</td>
                  <td className="num imkan-muted">{formatBytes(resolveItemSize(file) ?? 0)}</td>
                  <td className="num">
                    <div style={{ display: "inline-flex", gap: 6 }}>
                      <button
                        type="button"
                        className="wd-btn wd-btn-primary wd-btn-sm"
                        disabled={busyId === file.id}
                        onClick={() => void handleRestore(file.id)}
                      >
                        ↺ {label("files.restore")}
                      </button>
                      <button
                        type="button"
                        className="wd-btn wd-btn-danger wd-btn-sm"
                        disabled={busyId === file.id}
                        onClick={() => void handleDeleteForever(file.id)}
                      >
                        ✕ {label("trash.deleteForever")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
