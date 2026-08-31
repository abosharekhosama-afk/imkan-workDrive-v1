"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useLocale } from "../../../components/locale-provider";
import { listRecent, type RecentRecord } from "../../../lib/api/recent";
import { fileIconKind, FileTypeIcon } from "../../../components/file-icon";

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatSize(size: number | null | undefined): string {
  if (size == null) return "—";
  const kb = Number(size) / 1024;
  if (kb < 1024) return `${Math.max(1, Math.round(kb))} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export default function RecentPage() {
  const { label } = useLocale();
  const [items, setItems] = useState<RecentRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setItems(await listRecent());
    } catch {
      setError(label("error.generic"));
    } finally {
      setLoading(false);
    }
  }, [label]);

  useEffect(() => {
    void load();
  }, [load]);

  const actionKeys: Record<string, Parameters<typeof label>[0]> = {
    VIEW: "recent.action.VIEW",
    DOWNLOAD: "recent.action.DOWNLOAD",
    PREVIEW: "recent.action.PREVIEW",
    EDIT: "recent.action.EDIT",
    MOVE: "recent.action.MOVE",
    COPY: "recent.action.COPY",
    DELETE: "recent.action.DELETE",
    RESTORE: "recent.action.RESTORE",
    COMMENT: "recent.action.COMMENT",
    SHARE: "recent.action.SHARE",
  };
  const actionLabel = (action: string) => {
    const key = actionKeys[action];
    return key ? label(key) : action;
  };

  return (
    <div className="wd-page">
      <header className="wd-page-head">
        <div className="wd-page-head-titles">
          <h1>{label("nav.recent")}</h1>
          <p>{label("files.recentDescription")}</p>
        </div>
        <div className="wd-page-head-actions">
          <button
            type="button"
            className="wd-btn wd-btn-ghost"
            onClick={() => void load()}
            disabled={loading}
          >
            ⟳ {label("recent.refresh")}
          </button>
        </div>
      </header>

      {error ? (
        <div className="wd-alert" role="alert">{error}</div>
      ) : null}

      {loading ? (
        <div className="wd-card" aria-busy="true">
          {[46, 62, 54, 70].map((width, index) => (
            <div key={index} className="wd-skel-row" style={{ paddingInline: 16 }}>
              <span className="wd-skel-bar" style={{ width: 30, height: 30 }} />
              <span className="wd-skel-bar flex-1" style={{ width: `${width}%` }} />
              <span className="wd-skel-bar" style={{ width: 96 }} />
              <span className="wd-skel-bar" style={{ width: 130 }} />
            </div>
          ))}
          <span className="sr-only" role="status">{label("common.loading")}</span>
        </div>
      ) : items.length === 0 ? (
        <div className="wd-card">
          <div className="wd-empty">
            <span className="wd-empty-icon" aria-hidden="true">◷</span>
            <h2>{label("nav.recent")}</h2>
            <p>{label("files.recentEmpty")}</p>
          </div>
        </div>
      ) : (
        <div className="wd-card overflow-x-auto">
          <table className="wd-table min-w-[46rem]">
            <thead>
              <tr>
                <th>{label("files.column.name")}</th>
                <th className="num">{label("files.column.size")}</th>
                <th>{label("trash.location")}</th>
                <th>{label("files.recentAccessed")}</th>
                <th className="num"><span className="sr-only">{label("files.actions")}</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const isFolder = item.resourceType === "FOLDER";
                const targetHref =
                  isFolder
                    ? `/files/${item.resourceId}`
                    : item.folderId
                      ? `/files/${item.folderId}`
                      : "/files";
                return (
                  <tr key={item.id}>
                    <td>
                      <div className="wd-name-cell">
                        <span className="icon" aria-hidden="true">
                          <FileTypeIcon size={18} kind={fileIconKind(isFolder ? "folder" : "file", item.mimeType ?? undefined, item.name)} />
                        </span>
                        <span>
                          <Link href={targetHref} className="wd-name-link">{item.name}</Link>
                          <span className="wd-subtext">{actionLabel(item.action)}</span>
                        </span>
                      </div>
                    </td>
                    <td className="num imkan-muted">
                      {isFolder ? "—" : formatSize(item.size)}
                    </td>
                    <td className="imkan-muted">
                      {item.location ?? label("files.breadcrumb.root")}
                    </td>
                    <td className="imkan-muted">{formatDateTime(item.accessedAt)}</td>
                    <td className="num">
                      <Link href={targetHref} className="wd-btn wd-btn-ghost wd-btn-sm">
                        {label("recent.open")}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
