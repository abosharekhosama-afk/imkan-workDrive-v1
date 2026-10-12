"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "../../../components/locale-provider";
import { listSharedWithMe, type SharedItem } from "../../../lib/api/shared";
import { fileIconKind, FileTypeIcon } from "../../../components/file-icon";
import { FileActionsMenu } from "../../../components/file-actions-menu";
import { permissionAllowsEdit } from "../../../components/file-row-actions-logic";
import { RenameModal } from "../../../components/rename-modal";
import { DeleteModal } from "../../../components/delete-modal";
import { MoveModal } from "../../../components/move-modal";
import { Toast } from "../../../components/toast";
import { renameFile, trashFile, requestDownload, moveFile } from "../../../lib/api/files";
import { triggerDownload } from "../../../lib/api/download";
import { renameFolder, deleteFolder, moveFolder } from "../../../lib/api/folders";
import { formatBytes, resolveItemSize } from "../../../lib/api/quota";
import { WORKDRIVE_PREVIEW_EVENT, type PreviewEventDetail } from "../../../components/global-search";

type Target = { type: "FILE" | "FOLDER"; id: string; name: string };

function permissionBadge(permission?: string): string {
  switch (permission) {
    case "EDIT":
    case "ORGANIZE":
    case "FULL_ACCESS":
      return "wd-badge wd-badge-blue";
    case "COMMENT":
      return "wd-badge wd-badge-amber";
    default:
      return "wd-badge wd-badge-gray";
  }
}

export default function SharedWithMePage() {
  const { label } = useLocale();
  const router = useRouter();
  const [rows, setRows] = useState<SharedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [renameTarget, setRenameTarget] = useState<Target | null>(null);
  const [moveTarget, setMoveTarget] = useState<Target | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Target | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setError(null);
      setRows(await listSharedWithMe());
      setToast(label("files.refreshDone"));
    } catch {
      setError(label("error.generic"));
    }
  }, [label]);

  useEffect(() => {
    let active = true;
    void listSharedWithMe()
      .then((v) => {
        if (active) setRows(v);
      })
      .catch(() => {
        if (active) setError(label("error.generic"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [label]);

  const dispatchPreview = (r: SharedItem) => {
    const detail: PreviewEventDetail = {
      id: r.resourceId,
      name: r.name ?? r.resourceId,
      mimeType: r.mimeType ?? undefined,
      size: r.size ?? undefined,
    };
    window.dispatchEvent(new CustomEvent<PreviewEventDetail>(WORKDRIVE_PREVIEW_EVENT, { detail }));
  };

  /** Single-click navigation: folders open in place, files open the preview. */
  const openSharedRow = (r: SharedItem) => {
    if (r.resourceType === "FOLDER") {
      router.push(`/files/${r.resourceId}`);
    } else {
      dispatchPreview(r);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" style={{ fontFamily: "var(--user-font-family), Arial, system-ui, sans-serif" }}>
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-[color:var(--imkan-color-border)] bg-white px-3">
        <h1 className="text-[15px] font-semibold text-[#212121]">
          {label("nav.sharedWithMe")}
          {rows.length > 0 ? <span className="ms-2 text-[12px] font-medium text-slate-500">({rows.length})</span> : null}
        </h1>
        <button type="button" className="rounded-md px-2.5 py-1.5 text-[12.5px] text-slate-600 hover:bg-slate-100" onClick={() => void reload()} disabled={loading}>
          ⟳ {label("recent.refresh")}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 md:px-5">
        {error ? <div className="mt-3 rounded-lg bg-red-50 p-3 text-[12px] text-red-700" role="alert">{error}</div> : null}
        {loading ? (
          <div className="p-6 text-center text-[13px] text-slate-400">{label("common.loading")}</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <span className="text-[40px] text-slate-300" aria-hidden="true">⇄</span>
            <h2 className="text-[15px] font-medium text-slate-800">{label("nav.sharedWithMe")}</h2>
            <p className="text-[13px] text-slate-500">{label("shared.empty")}</p>
          </div>
        ) : (
          <table className="w-full table-fixed border-collapse" style={{ fontFamily: "var(--user-font-family), Arial, system-ui, sans-serif" }}>
            <thead>
              <tr className="border-b border-[color:var(--imkan-color-border)]">
                <th className="px-3 py-2 text-start text-[12px] font-medium text-slate-500">{label("shared.name")}</th>
                <th className="w-[18%] px-3 py-2 text-start text-[12px] font-medium text-slate-500">{label("shared.owner")}</th>
                <th className="w-[14%] px-3 py-2 text-start text-[12px] font-medium text-slate-500">{label("shared.permission")}</th>
                <th className="w-[12%] px-3 py-2 text-start text-[12px] font-medium text-slate-500">{label("files.column.size")}</th>
                <th className="w-[16%] px-3 py-2 text-start text-[12px] font-medium text-slate-500">{label("shared.expires")}</th>
                <th className="w-[10%] px-3 py-2 text-end text-[12px] font-medium text-slate-500">{label("files.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-[color:var(--imkan-color-border)] hover:bg-slate-50" onDoubleClick={() => openSharedRow(r)}>
                  <td className="px-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <FileTypeIcon size={18} kind={fileIconKind(r.resourceType === "FOLDER" ? "folder" : "file", r.mimeType ?? undefined, r.name ?? r.resourceId)} />
                      {r.resourceType === "FOLDER" ? (
                        <Link href={`/files/${r.resourceId}`} className="truncate text-[13px] text-slate-800 hover:underline" onClick={(e) => e.stopPropagation()}>
                          {r.name ?? r.resourceId}
                        </Link>
                      ) : (
                        <button type="button" className="truncate text-start text-[13px] text-slate-800 hover:underline" onClick={(e) => { e.stopPropagation(); dispatchPreview(r); }}>
                          {r.name ?? r.resourceId}
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 truncate text-[13px] text-slate-600">{r.owner?.name || r.owner?.email || "—"}</td>
                  <td className="px-3 py-2.5 truncate text-[13px] text-slate-600">{r.permission ?? "VIEW"}</td>
                  <td className="px-3 py-2.5 truncate text-[13px] text-slate-600">{r.resourceType === "FOLDER" ? "—" : formatBytes(resolveItemSize(r) ?? 0)}</td>
                  <td className="px-3 py-2.5 truncate text-[13px] text-slate-600">{r.expiresAt ? new Date(r.expiresAt).toLocaleDateString() : "—"}</td>
                  <td className="px-3 py-2.5 text-end" onClick={(e) => e.stopPropagation()}>
                    <FileActionsMenu
                      context={{
                        resourceType: r.resourceType,
                        canMutate: permissionAllowsEdit(r.permission),
                        canShare: false,
                        canFavorite: true,
                      }}
                      handlers={{
                        onOpen: r.resourceType === "FOLDER" ? () => router.push(`/files/${r.resourceId}`) : () => dispatchPreview(r),
                        onPreview: r.resourceType === "FILE" ? () => dispatchPreview(r) : undefined,
                        onDownload: r.resourceType === "FILE" ? async () => { const result = await requestDownload(r.resourceId); triggerDownload(result.download_url); } : undefined,
                        onRename: permissionAllowsEdit(r.permission) ? () => setRenameTarget({ type: r.resourceType, id: r.resourceId, name: r.name ?? r.resourceId }) : undefined,
                        onMove: permissionAllowsEdit(r.permission) ? () => setMoveTarget({ type: r.resourceType, id: r.resourceId, name: r.name ?? r.resourceId }) : undefined,
                        onDelete: permissionAllowsEdit(r.permission) ? () => setDeleteTarget({ type: r.resourceType, id: r.resourceId, name: r.name ?? r.resourceId }) : undefined,
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
      {renameTarget ? (
        <RenameModal
          currentName={renameTarget.name}
          onClose={() => setRenameTarget(null)}
          onSubmit={async (name) => {
            if (renameTarget.type === "FOLDER") {
              await renameFolder(renameTarget.id, name);
            } else {
              await renameFile(renameTarget.id, name);
            }
            await reload();
          }}
        />
      ) : null}
      {moveTarget ? (
        <MoveModal
          resourceName={moveTarget.name}
          resourceType={moveTarget.type}
          resourceId={moveTarget.id}
          onClose={() => setMoveTarget(null)}
          onMove={async (destinationFolderId) => {
            if (moveTarget.type === "FOLDER") {
              await moveFolder(moveTarget.id, destinationFolderId);
            } else {
              await moveFile(moveTarget.id, destinationFolderId);
            }
            await reload();
          }}
        />
      ) : null}
      {deleteTarget ? (
        <DeleteModal
          onClose={() => setDeleteTarget(null)}
          onConfirm={async () => {
            if (deleteTarget.type === "FOLDER") {
              await deleteFolder(deleteTarget.id);
            } else {
              await trashFile(deleteTarget.id);
            }
            await reload();
          }}
        />
      ) : null}
    </div>
  );
}
