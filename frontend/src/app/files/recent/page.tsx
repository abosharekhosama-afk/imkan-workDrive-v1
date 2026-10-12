"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useLocale } from "../../../components/locale-provider";
import { listRecent, type RecentRecord } from "../../../lib/api/recent";
import { fileIconKind, FileTypeIcon } from "../../../components/file-icon";
import { formatBytes, resolveItemSize } from "../../../lib/api/quota";

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
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
    <div className="wd-page recent-page flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden !p-0 wd-list-page">
      <header className="wd-page-head shrink-0 px-4 pt-4 md:px-6">
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

      <div className="recent-scroll min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-auto px-4 pb-6 md:px-6">
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
        <div className="wd-card workflow-like-list wd-list-table-card w-full max-w-full">
          <table className="wd-table workflow-like-table borderless wd-list-table min-w-[48rem]">
            <thead>
              <tr>
                <th className="wd-col-name">{label("files.column.name")}</th>
                <th className="num">{label("files.column.size")}</th>
                <th className="wd-col-location">{label("trash.location")}</th>
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
                      {isFolder ? "—" : formatBytes(resolveItemSize(item) ?? 0)}
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
    </div>
  );
}
