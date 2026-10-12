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
    <div className="flex min-h-0 flex-1 flex-col" style={{ fontFamily: "var(--user-font-family), Arial, system-ui, sans-serif" }}>
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-[color:var(--imkan-color-border)] bg-white px-3">
        <h1 className="text-[15px] font-semibold text-[#212121]">{label("nav.recent")}</h1>
        <button type="button" className="rounded-md px-2.5 py-1.5 text-[12.5px] text-slate-600 hover:bg-slate-100" onClick={() => void load()} disabled={loading}>
          ⟳ {label("recent.refresh")}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 md:px-5">
        {error ? <div className="mt-3 rounded-lg bg-red-50 p-3 text-[12px] text-red-700" role="alert">{error}</div> : null}
        {loading ? (
          <div className="p-6 text-center text-[13px] text-slate-400">{label("common.loading")}</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <span className="text-[40px] text-slate-300" aria-hidden="true">◷</span>
            <h2 className="text-[15px] font-medium text-slate-800">{label("nav.recent")}</h2>
            <p className="text-[13px] text-slate-500">{label("files.recentEmpty")}</p>
          </div>
        ) : (
          <table className="w-full table-fixed border-collapse" style={{ fontFamily: "var(--user-font-family), Arial, system-ui, sans-serif" }}>
            <thead>
              <tr className="border-b border-[color:var(--imkan-color-border)]">
                <th className="px-3 py-2 text-start text-[12px] font-medium text-slate-500">{label("files.column.name")}</th>
                <th className="w-[14%] px-3 py-2 text-start text-[12px] font-medium text-slate-500">{label("files.column.size")}</th>
                <th className="w-[22%] px-3 py-2 text-start text-[12px] font-medium text-slate-500">{label("trash.location")}</th>
                <th className="w-[22%] px-3 py-2 text-start text-[12px] font-medium text-slate-500">{label("files.recentAccessed")}</th>
                <th className="w-[12%] px-3 py-2 text-end text-[12px] font-medium text-slate-500">{label("files.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const isFolder = item.resourceType === "FOLDER";
                const targetHref = isFolder ? `/files/${item.resourceId}` : item.folderId ? `/files/${item.folderId}` : "/files";
                return (
                  <tr key={item.id} className="border-b border-[color:var(--imkan-color-border)] hover:bg-slate-50">
                    <td className="px-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <FileTypeIcon size={18} kind={fileIconKind(isFolder ? "folder" : "file", item.mimeType ?? undefined, item.name)} />
                        <div className="min-w-0">
                          <Link href={targetHref} className="block truncate text-[13px] text-slate-800 hover:underline">{item.name}</Link>
                          <span className="block truncate text-[11px] text-slate-400">{actionLabel(item.action)}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 truncate text-[13px] text-slate-600">{isFolder ? "—" : formatBytes(resolveItemSize(item) ?? 0)}</td>
                    <td className="px-3 py-2.5 truncate text-[13px] text-slate-600">{item.location ?? label("files.breadcrumb.root")}</td>
                    <td className="px-3 py-2.5 truncate text-[13px] text-slate-600">{formatDateTime(item.accessedAt)}</td>
                    <td className="px-3 py-2.5 text-end">
                      <Link href={targetHref} className="rounded-md px-2.5 py-1.5 text-[12.5px] text-[color:var(--wd-primary,#1B66EA)] hover:bg-[var(--wd-primary-light,#EEF3FD)]">
                        {label("recent.open")}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
