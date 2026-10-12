"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "../../../components/locale-provider";
import { listFavorites, removeFavorite, type FavoriteRecord } from "../../../lib/api/favorites";
import { fileIconKind, FileTypeIcon } from "../../../components/file-icon";
import { FileActionsMenu } from "../../../components/file-actions-menu";
import { ShareModal } from "../../../components/share-modal";
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

export default function FavoritesPage() {
  const { label } = useLocale();
  const router = useRouter();
  const [items, setItems] = useState<FavoriteRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [shareTarget, setShareTarget] = useState<Target | null>(null);
  const [renameTarget, setRenameTarget] = useState<Target | null>(null);
  const [moveTarget, setMoveTarget] = useState<Target | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Target | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const onOpenShare = (event: Event) => {
      const detail = (event as CustomEvent<{ type: "FILE" | "FOLDER"; id: string }>).detail;
      if (!detail?.id || !detail?.type) return;
      const item = items.find((row) => row.resourceId === detail.id && row.resourceType === detail.type);
      setShareTarget({ type: detail.type, id: detail.id, name: item?.name ?? detail.id });
    };
    window.addEventListener("workdrive:open-share", onOpenShare);
    return () => window.removeEventListener("workdrive:open-share", onOpenShare);
  }, [items]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setItems(await listFavorites());
    } catch {
      setError(label("error.generic"));
    } finally {
      setLoading(false);
    }
  }, [label]);
  useEffect(() => {
    void load();
  }, [load]);

  const reload = useCallback(async () => {
    try {
      setError(null);
      setItems(await listFavorites());
      setToast(label("files.refreshDone"));
    } catch {
      setError(label("error.generic"));
    }
  }, [label]);

  const dispatchPreview = (item: FavoriteRecord) => {
    const detail: PreviewEventDetail = {
      id: item.resourceId,
      name: item.name,
      mimeType: item.mimeType ?? undefined,
      size: item.size ?? undefined,
    };
    window.dispatchEvent(new CustomEvent<PreviewEventDetail>(WORKDRIVE_PREVIEW_EVENT, { detail }));
  };

  /** Double-click navigation: folders open in place, files open the preview. */
  const openFavoriteRow = (item: FavoriteRecord) => {
    if (item.resourceType === "FOLDER") {
      router.push(`/files/${item.resourceId}`);
    } else {
      dispatchPreview(item);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" style={{ fontFamily: "var(--user-font-family), Arial, system-ui, sans-serif" }}>
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-[color:var(--imkan-color-border)] bg-white px-3">
        <h1 className="text-[15px] font-semibold text-[#212121]">
          ☆ {label("nav.favorites")}
          {items.length > 0 ? <span className="ms-2 text-[12px] font-medium text-slate-500">({items.length})</span> : null}
        </h1>
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
            <span className="text-[40px] text-slate-300" aria-hidden="true">☆</span>
            <h2 className="text-[15px] font-medium text-slate-800">{label("nav.favorites")}</h2>
            <p className="text-[13px] text-slate-500">{label("files.favoritesEmpty")}</p>
          </div>
        ) : (
          <table className="w-full table-fixed border-collapse" style={{ fontFamily: "var(--user-font-family), Arial, system-ui, sans-serif" }}>
            <thead>
              <tr className="border-b border-[color:var(--imkan-color-border)]">
                <th className="px-3 py-2 text-start text-[12px] font-medium text-slate-500">{label("files.column.name")}</th>
                <th className="w-[16%] px-3 py-2 text-start text-[12px] font-medium text-slate-500">{label("files.column.type")}</th>
                <th className="w-[14%] px-3 py-2 text-start text-[12px] font-medium text-slate-500">{label("files.column.size")}</th>
                <th className="w-[12%] px-3 py-2 text-end text-[12px] font-medium text-slate-500">{label("files.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-[color:var(--imkan-color-border)] hover:bg-slate-50" onDoubleClick={() => openFavoriteRow(item)}>
                  <td className="px-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <FileTypeIcon size={18} kind={fileIconKind(item.resourceType === "FOLDER" ? "folder" : "file", undefined, item.name)} />
                      {item.resourceType === "FOLDER" ? (
                        <Link href={`/files/${item.resourceId}`} className="truncate text-[13px] text-slate-800 hover:underline">{item.name}</Link>
                      ) : (
                        <button type="button" className="truncate text-start text-[13px] text-slate-800 hover:underline" onClick={() => dispatchPreview(item)}>{item.name}</button>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 truncate text-[13px] text-slate-600">
                    {item.resourceType === "FOLDER" ? label("files.type.folder") : label("files.type.file")}
                  </td>
                  <td className="px-3 py-2.5 truncate text-[13px] text-slate-600">
                    {item.resourceType === "FOLDER" ? "—" : formatBytes(resolveItemSize(item) ?? 0)}
                  </td>
                  <td className="px-3 py-2.5 text-end">
                    <FileActionsMenu
                      context={{
                        resourceType: item.resourceType,
                        canMutate: true,
                        canShare: item.resourceType === "FILE",
                        canFavorite: true,
                        isFavorite: true,
                      }}
                      handlers={{
                        onOpen: item.resourceType === "FOLDER" ? () => router.push(`/files/${item.resourceId}`) : () => dispatchPreview(item),
                        onPreview: item.resourceType === "FILE" ? () => dispatchPreview(item) : undefined,
                        onDownload: item.resourceType === "FILE" ? async () => { const result = await requestDownload(item.resourceId); triggerDownload(result.download_url); } : undefined,
                        onShare: () => setShareTarget({ type: item.resourceType, id: item.resourceId, name: item.name }),
                        onRename: () => setRenameTarget({ type: item.resourceType, id: item.resourceId, name: item.name }),
                        onMove: () => setMoveTarget({ type: item.resourceType, id: item.resourceId, name: item.name }),
                        onFavoriteToggle: async () => { await removeFavorite(item.resourceType, item.resourceId); await reload(); },
                        onDelete: () => setDeleteTarget({ type: item.resourceType, id: item.resourceId, name: item.name }),
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
      {shareTarget ? (
        <ShareModal
          resourceType={shareTarget.type}
          resourceId={shareTarget.id}
          onClose={() => setShareTarget(null)}
        />
      ) : null}
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
