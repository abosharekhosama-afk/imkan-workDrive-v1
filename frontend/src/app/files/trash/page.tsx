"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "../../../components/locale-provider";
import { ApiError } from "../../../lib/api/client";
import { emptyTrash, permanentDeleteFile } from "../../../lib/api/files";
import { listTrash, restoreFile } from "../../../lib/api/trash";
import type { FileRecord } from "../../../lib/api/types";
import { fileIconSymbol } from "../../../components/file-icon-logic";
import { errorMessageForStatus } from "../../../components/feedback-state-logic";

function formatDate(value?: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatSize(value?: number | null): string {
  if (value == null) return "—";
  const kb = value / 1024;
  if (kb < 1024) return `${Math.max(1, Math.round(kb))} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export default function TrashPage() {
  const { label } = useLocale();
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

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

  async function handleDeleteForever(fileId: string) {
    if (!window.confirm(label("trash.confirmPermanent"))) return;
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
  }

  async function handleEmptyTrash() {
    if (!window.confirm(label("trash.confirmEmpty"))) return;
    setError(null);
    try {
      await emptyTrash();
      await load();
    } catch {
      setError(label("error.generic"));
    }
  }

  return (
    <div className="wd-page">
      <header className="wd-page-head">
        <div className="wd-page-head-titles">
          <h1>
            {label("files.trash")}
            {files.length > 0 ? <span className="wd-count-pill ms-2 align-middle">{files.length}</span> : null}
          </h1>
          <p>
            {files.length > 0 ? `${formatSize(totalSize)}` : ""}
          </p>
        </div>
        <div className="wd-page-head-actions">
          <button type="button" className="wd-btn wd-btn-ghost" onClick={() => void load()} disabled={loading}>
            ⟳ {label("recent.refresh")}
          </button>
          {files.length > 0 ? (
            <button type="button" className="wd-btn wd-btn-danger" onClick={() => void handleEmptyTrash()}>
              ⌫ {label("trash.emptyTrash")}
            </button>
          ) : null}
        </div>
      </header>

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
          <span className="sr-only" role="status">Loading</span>
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
        <div className="wd-card overflow-x-auto">
          <table className="wd-table min-w-[48rem]">
            <thead>
              <tr>
                <th>{label("files.column.name")}</th>
                <th>{label("trash.location")}</th>
                <th>{label("trash.deletedAt")}</th>
                <th className="num">{label("files.column.size")}</th>
                <th className="num">{label("files.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => (
                <tr key={file.id}>
                  <td>
                    <div className="wd-name-cell">
                      <span className="icon" aria-hidden="true">
                        {fileIconSymbol("file", file.mimeType ?? undefined, file.name)}
                      </span>
                      <span className="wd-name-link" title={file.name}>{file.name}</span>
                    </div>
                  </td>
                  <td className="imkan-muted">{file.folderName ?? label("files.breadcrumb.root")}</td>
                  <td className="imkan-muted">{formatDate(file.deletedAt)}</td>
                  <td className="num imkan-muted">{formatSize(file.size)}</td>
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
