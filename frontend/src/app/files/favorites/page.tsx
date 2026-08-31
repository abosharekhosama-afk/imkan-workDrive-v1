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
import { FileDetailsModal, type FileDetailsData } from "../../../components/file-details-modal";
import { Toast } from "../../../components/toast";
import { renameFile, trashFile, requestDownload, moveFile } from "../../../lib/api/files";
import { triggerDownload } from "../../../lib/api/download";
import { renameFolder, deleteFolder, moveFolder } from "../../../lib/api/folders";
import { formatBytes } from "../../../lib/api/quota";
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
  const [details, setDetails] = useState<FileDetailsData | null>(null);
  const [toast, setToast] = useState<string | null>(null);
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
    <div className="wd-page">
      <header className="wd-page-head">
        <div className="wd-page-head-titles">
          <h1>
            ☆ {label("nav.favorites")}
            {items.length > 0 ? <span className="wd-count-pill ms-2 align-middle">{items.length}</span> : null}
          </h1>
          <p>{label("files.favoritesDescription")}</p>
        </div>
        <div className="wd-page-head-actions">
          <button type="button" className="wd-btn wd-btn-ghost" onClick={() => void load()} disabled={loading}>
            ⟳ {label("recent.refresh")}
          </button>
        </div>
      </header>

      {error ? <div className="wd-alert" role="alert">{error}</div> : null}

      {loading ? (
        <div className="wd-card" aria-busy="true">
          {[64, 48, 72].map((width, index) => (
            <div key={index} className="wd-skel-row" style={{ paddingInline: 16 }}>
              <span className="wd-skel-bar" style={{ width: 30, height: 30 }} />
              <span className="wd-skel-bar flex-1" style={{ width: `${width}%` }} />
              <span className="wd-skel-bar" style={{ width: 110 }} />
            </div>
          ))}
          <span className="sr-only" role="status">{label("common.loading")}</span>
        </div>
      ) : items.length === 0 ? (
        <div className="wd-card">
          <div className="wd-empty">
            <span className="wd-empty-icon" aria-hidden="true">☆</span>
            <h2>{label("nav.favorites")}</h2>
            <p>{label("files.favoritesEmpty")}</p>
          </div>
        </div>
      ) : (
        <div className="wd-card overflow-x-auto">
          <table className="wd-table min-w-[36rem]">
            <thead>
              <tr>
                <th>{label("files.column.name")}</th>
                <th>{label("files.column.type")}</th>
                <th>{label("files.column.size")}</th>
                <th className="num"><span className="sr-only">{label("files.actions")}</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="wd-row-clickable"
                  onDoubleClick={() => openFavoriteRow(item)}
                >
                  <td>
                    <div className="wd-name-cell">
                      <span className="icon" aria-hidden="true">
                        <FileTypeIcon size={18} kind={fileIconKind(item.resourceType === "FOLDER" ? "folder" : "file", undefined, item.name)} />
                      </span>
                      {item.resourceType === "FOLDER" ? (
                        <Link href={`/files/${item.resourceId}`} className="wd-name-link">{item.name}</Link>
                      ) : (
                        <button
                          type="button"
                          className="wd-name-link imkan-focusable"
                          onClick={() => dispatchPreview(item)}
                        >
                          {item.name}
                        </button>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className={`wd-badge ${item.resourceType === "FOLDER" ? "wd-badge-amber" : "wd-badge-gray"}`}>
                      {item.resourceType === "FOLDER" ? label("files.type.folder") : label("files.type.file")}
                    </span>
                  </td>
                  <td className="num imkan-muted">{formatBytes(item.size)}</td>
                  <td className="num">
                    <FileActionsMenu
                      context={{
                        resourceType: item.resourceType,
                        canMutate: true,
                        canShare: true,
                        canFavorite: true,
                        isFavorite: true,
                      }}
                      handlers={{
                        onOpen:
                          item.resourceType === "FOLDER"
                            ? () => router.push(`/files/${item.resourceId}`)
                            : () => dispatchPreview(item),
                        onPreview:
                          item.resourceType === "FILE" ? () => dispatchPreview(item) : undefined,
                        onDownload:
                          item.resourceType === "FILE"
                            ? async () => {
                                const result = await requestDownload(item.resourceId);
                                triggerDownload(result.download_url);
                              }
                            : undefined,
                        onViewDetails: () =>
                          setDetails({
                            resourceType: item.resourceType,
                            name: item.name,
                            mimeType: null,
                            size: null,
                            updatedAt: null,
                            ownerName: null,
                            ownerEmail: null,
                            permission: null,
                          }),
                        onShare: () => setShareTarget({ type: item.resourceType, id: item.resourceId, name: item.name }),
                        onRename: () => setRenameTarget({ type: item.resourceType, id: item.resourceId, name: item.name }),
                        onMove: () => setMoveTarget({ type: item.resourceType, id: item.resourceId, name: item.name }),
                        onFavoriteToggle: async () => {
                          await removeFavorite(item.resourceType, item.resourceId);
                          await reload();
                        },
                        onDelete: () => setDeleteTarget({ type: item.resourceType, id: item.resourceId, name: item.name }),
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
      {details ? <FileDetailsModal data={details} onClose={() => setDetails(null)} /> : null}
    </div>
  );
}
