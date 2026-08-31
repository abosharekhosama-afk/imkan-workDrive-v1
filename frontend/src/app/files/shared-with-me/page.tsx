"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "../../../components/locale-provider";
import { listSharedWithMe, type SharedItem } from "../../../lib/api/shared";
import { fileIconSymbol } from "../../../components/file-icon-logic";
import { FileActionsMenu } from "../../../components/file-actions-menu";
import { permissionAllowsEdit } from "../../../components/file-row-actions-logic";
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
  const [details, setDetails] = useState<FileDetailsData | null>(null);
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

  /** Double-click navigation: folders open in place, files open the preview. */
  const openSharedRow = (r: SharedItem) => {
    if (r.resourceType === "FOLDER") {
      router.push(`/files/${r.resourceId}`);
    } else {
      dispatchPreview(r);
    }
  };

  return (
    <div className="wd-page">
      <header className="wd-page-head">
        <div className="wd-page-head-titles">
          <h1>{label("shared.withMe")}</h1>
          <p>{label("nav.workspace")}</p>
        </div>
        {rows.length > 0 ? (
          <div className="wd-page-head-actions">
            <span className="wd-badge wd-badge-gray">
              <span className="wd-count-pill">{rows.length}</span> {label("shared.withMe")}
            </span>
          </div>
        ) : null}
      </header>

      {error ? <div className="wd-alert" role="alert">{error}</div> : null}

      {loading ? (
        <div className="wd-card" aria-busy="true">
          {[58, 44, 66].map((width, index) => (
            <div key={index} className="wd-skel-row" style={{ paddingInline: 16 }}>
              <span className="wd-skel-bar" style={{ width: 30, height: 30 }} />
              <span className="wd-skel-bar flex-1" style={{ width: `${width}%` }} />
              <span className="wd-skel-bar" style={{ width: 110 }} />
            </div>
          ))}
          <span className="sr-only" role="status">{label("common.loading")}</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="wd-card">
          <div className="wd-empty">
            <span className="wd-empty-icon" aria-hidden="true">⇄</span>
            <h2>{label("shared.withMe")}</h2>
            <p>{label("shared.noSharedItems")}</p>
          </div>
        </div>
      ) : (
        <div className="wd-card overflow-x-auto">
          <table className="wd-table min-w-[40rem]">
            <thead>
              <tr>
                <th>{label("shared.name")}</th>
                <th>{label("shared.owner")}</th>
                <th>{label("shared.permission")}</th>
                <th>{label("files.column.size")}</th>
                <th>{label("shared.expires")}</th>
                <th className="num"><span className="sr-only">{label("files.actions")}</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="wd-row-clickable"
                  onDoubleClick={() => openSharedRow(r)}
                >
                  <td>
                    <div className="wd-name-cell">
                      <span className="icon" aria-hidden="true">
                        {fileIconSymbol(r.resourceType === "FOLDER" ? "folder" : "file")}
                      </span>
                      {r.resourceType === "FOLDER" ? (
                        <Link href={`/files/${r.resourceId}`} className="wd-name-link">
                          {r.name ?? r.resourceId}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          className="wd-name-link imkan-focusable"
                          onClick={() => dispatchPreview(r)}
                        >
                          {r.name ?? r.resourceId}
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="imkan-muted">{r.owner?.name || r.owner?.email || "—"}</td>
                  <td>
                    <span className={permissionBadge(r.permission)}>{r.permission ?? "VIEW"}</span>
                  </td>
                  <td className="num imkan-muted">{formatBytes(r.size)}</td>
                  <td className="imkan-muted">
                    {r.expiresAt ? new Date(r.expiresAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="num">
                    <FileActionsMenu
                      context={{
                        resourceType: r.resourceType,
                        permission: r.permission,
                        canDownload: r.canDownload,
                        canMutate: permissionAllowsEdit(r.permission),
                        canShare: false,
                      }}
                      handlers={{
                        onOpen:
                          r.resourceType === "FOLDER"
                            ? () => router.push(`/files/${r.resourceId}`)
                            : () => dispatchPreview(r),
                        onPreview:
                          r.resourceType === "FILE" ? () => dispatchPreview(r) : undefined,
                        onDownload:
                          r.resourceType === "FILE"
                            ? async () => {
                                const result = await requestDownload(r.resourceId);
                                triggerDownload(result.download_url);
                              }
                            : undefined,
                        onViewDetails: () =>
                          setDetails({
                            resourceType: r.resourceType,
                            name: r.name ?? r.resourceId,
                            mimeType: r.mimeType ?? null,
                            size: r.size ?? null,
                            updatedAt: r.updatedAt ?? null,
                            ownerName: r.owner?.name ?? null,
                            ownerEmail: r.owner?.email ?? null,
                            permission: r.permission ?? null,
                          }),
                        onRename: permissionAllowsEdit(r.permission)
                          ? () => setRenameTarget({ type: r.resourceType, id: r.resourceId, name: r.name ?? r.resourceId })
                          : undefined,
                        onMove: permissionAllowsEdit(r.permission)
                          ? () => setMoveTarget({ type: r.resourceType, id: r.resourceId, name: r.name ?? r.resourceId })
                          : undefined,
                        onDelete: permissionAllowsEdit(r.permission)
                          ? () => setDeleteTarget({ type: r.resourceType, id: r.resourceId, name: r.name ?? r.resourceId })
                          : undefined,
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
