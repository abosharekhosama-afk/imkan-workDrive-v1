"use client";

import { useCallback, useEffect, useState, useRef, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { Breadcrumbs } from "./breadcrumbs";
import { ActionToolbar, FILTER_STORAGE_KEY, type FilterKey, type SortDir } from "./layout/action-toolbar";
import { SelectionBar } from "./layout/selection-bar";
import { FolderEmptyState } from "./layout/folder-empty-state";
import { ShellScopeSync } from "./layout/shell-context";
import { FileTable } from "./file-table";
import { FileGridView } from "./file-grid-view";
import { ShareModal } from "./share-modal";
import { UploadZone } from "./upload-zone";
import { useLocale } from "./locale-provider";
import { bulkTrashFolders, createFolder, deleteFolder, getFolder, listRootContents, renameFolder, moveFolder } from "../lib/api/folders";
import { bulkTrashFiles, renameFile, requestDownload, trashFile, moveFile } from "../lib/api/files";
import { triggerDownload } from "../lib/api/download";
import { addFavorite, listFavorites, removeFavorite } from "../lib/api/favorites";
import { ApiError } from "../lib/api/client";
import type { FileRecord, FolderRecord } from "../lib/api/types";
import { searchNames } from "../lib/api/search";
import { DeleteModal } from "./delete-modal";
import { RenameModal } from "./rename-modal";
import { MoveModal } from "./move-modal";
import { FileDetailsModal, type FileDetailsData } from "./file-details-modal";
import { FilePreviewModal } from "./file-preview-modal";
import { VersionHistoryDrawer } from "./files/version-history-drawer";
import { resolveMimeType } from "../lib/api/mime";
import { mapFileRecords, mapFolderRecords } from "../lib/api/table-mappers";

import {
  persistViewMode,
  readStoredViewMode,
  type ViewMode,
} from "./view-mode-logic";
import { openInspector } from "./layout/shell-context";

import { canMutateContent, canShareContent } from "../lib/permissions";
import { AlertBanner } from "./alert-banner";
import { SkeletonLoader } from "./skeleton-loader";
import { errorMessageForStatus } from "./feedback-state-logic";

export function FileBrowser({
  folderId,
  role,
  readOnly,
}: {
  folderId?: string;
  role?: string;
  readOnly?: boolean;
}) {
  const { label } = useLocale();
  const searchParams = useSearchParams();
  const router = useRouter();
  const routeQuery = searchParams.get("query")?.trim() ?? "";
  const [folders, setFolders] = useState<FolderRecord[]>([]);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [folderName, setFolderName] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const newFolderInputRef = useRef<HTMLInputElement>(null);
  const [shareTarget, setShareTarget] = useState<{
    type: "FILE" | "FOLDER";
    id: string;
  } | null>(null);
  const [renameTarget, setRenameTarget] = useState<{
    type: "FILE" | "FOLDER";
    id: string;
    name: string;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "FILE" | "FOLDER";
    id: string;
  } | null>(null);
  const [moveTarget, setMoveTarget] = useState<{
    type: "FILE" | "FOLDER";
    id: string;
    name: string;
  } | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<FileDetailsData | null>(null);
  const [previewTarget, setPreviewTarget] = useState<{
    type: "FILE" | "FOLDER";
    id: string;
    name: string;
    mimeType?: string;
    size?: number;
  } | null>(null);
  const [versionHistoryTarget, setVersionHistoryTarget] = useState<{
    type: "FILE" | "FOLDER";
    id: string;
    name: string;
    mimeType?: string;
    size?: number;
  } | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchActive, setSearchActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  // Dual view preference (list/table ↔ grid), persisted per browser.
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filter, setFilter] = useState<FilterKey>("all");
  // Folder aggregate metadata surfaced by the API (size / latest file update).
  const [folderSizes, setFolderSizes] = useState<ReadonlyMap<string, number>>(new Map());
  const [folderUpdatedAt, setFolderUpdatedAt] = useState<ReadonlyMap<string, string | null>>(new Map());

  const applyContents = (contents: { folders: FolderRecord[]; files: FileRecord[]; folderSizes?: Record<string, number> | null; folderUpdatedAt?: Record<string, string | null> | null }) => {
    setFolders(mapFolderRecords(contents.folders));
    setFiles(mapFileRecords(contents.files));
    setFolderSizes(new Map(Object.entries(contents.folderSizes ?? {})));
    setFolderUpdatedAt(new Map(Object.entries(contents.folderUpdatedAt ?? {})));
  };

  // Selection State (Phase 5)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const canMutate = canMutateContent(role, readOnly);
  const canShare = canShareContent(role, readOnly);

  const load = useCallback(async () => {
    await Promise.resolve();
    try {
      setLoading(true);
      setError(null);
      const favorites = await listFavorites();
      setFavoriteIds(new Set(favorites.map((favorite) => favorite.resourceId)));
      if (routeQuery) {
        const result = await searchNames(routeQuery);
        setFolderName(undefined);
        applyContents(result);
      } else if (folderId) {
        const detail = await getFolder(folderId);
        setFolderName(detail.name);
        applyContents(detail);
      } else {
        const contents = await listRootContents();
        setFolderName(undefined);
        applyContents(contents);
      }
    } catch (cause) {
      setError(errorMessageForStatus(cause instanceof ApiError? cause.status : undefined, {
        unauthenticated: label("error.unauthenticated"),
        forbidden: label("error.forbidden"),
        generic: label("error.generic"),
      }));
    } finally {
      setLoading(false);
    }
  }, [folderId, label, routeQuery]);

  useEffect(() => {
    const focusNewFolder = () => newFolderInputRef.current?.focus();
    window.addEventListener("workdrive:new-folder", focusNewFolder);
    return () => window.removeEventListener("workdrive:new-folder", focusNewFolder);
  }, []);

  // Inspector deep-link: "Version history" inside the details pane opens the drawer.
  useEffect(() => {
    const onVersion = (event: Event) => {
      const fileId = (event as CustomEvent<{ fileId: string }>).detail?.fileId;
      if (!fileId) return;
      const file = files.find((f) => f.id === fileId);
      if (!file) return;
      onVersionHistory("FILE", file.id, file.name, file.mimeType ?? undefined, file.size ?? undefined);
    };
    window.addEventListener("workdrive:version-history", onVersion);
    return () => window.removeEventListener("workdrive:version-history", onVersion);
  });

  // Restore the persisted view preference after mount (SSR-safe).
  useEffect(() => {
    setViewMode(readStoredViewMode(typeof window === "undefined" ? null : window.localStorage));
    try {
      const f = window.localStorage.getItem(FILTER_STORAGE_KEY);
      if (f === "folders" || f === "documents" || f === "sheets" || f === "slides" || f === "media" || f === "audio" || f === "archives" || f === "favorites" || f === "all") {
        setFilter(f);
      }
    } catch { /* noop */ }
  }, []);

  function switchViewMode(mode: ViewMode) {
    setViewMode(mode);
    persistViewMode(typeof window === "undefined" ? null : window.localStorage, mode);
  }

  useEffect(() => {
    setSelectedIds(new Set());
    setSearchActive(Boolean(routeQuery));
    setSearchInput(routeQuery);
    void load();
  }, [load, routeQuery]);

  async function onCreateFolder(event: FormEvent) {
    event.preventDefault();
    await createFolder(newFolderName, folderId);
    setNewFolderName("");
    await load();
  }

  async function onSearch(event: FormEvent) {
    event.preventDefault();
    const query = searchInput.trim();
    if (!query) {
      setSearchActive(false);
      await load();
      return;
    }
    try {
      setError(null);
      setSearchActive(true);
      const result = await searchNames(query);
      setFolders(mapFolderRecords(result.folders));
      setFiles(mapFileRecords(result.files));
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 401
          ? label("error.unauthenticated")
          : cause instanceof ApiError && cause.status === 403
            ? label("error.forbidden")
            : label("error.generic"),
      );
    }
  }

  async function onDownload(fileId: string) {
    const result = await requestDownload(fileId);
    triggerDownload(result.download_url);
  }

  async function onPreview(type: "FILE" | "FOLDER", id: string, name: string, mimeType?: string, size?: number) {
    if (type !== "FILE") return;
    // Dynamic MIME detection (P0): fall back to extension sniffing so files
    // uploaded with an empty/octet-stream browser type still preview inline.
    const resolvedMime = resolveMimeType(mimeType, name);
    setPreviewTarget({
      type,
      id,
      name,
      mimeType: resolvedMime,
      size,
    });
  }

  // Universal preview navigation: every file can be walked through with the
  // arrow keys; unsupported types get an elegant download card in the viewer.
  const getPreviewableFiles = useCallback((): FileRecord[] => files, [files]);

  const findFileIndex = useCallback((fileId: string) => {
    const previewableFiles = getPreviewableFiles();
    return previewableFiles.findIndex((f) => f.id === fileId);
  }, [getPreviewableFiles]);

  const handlePrevFile = useCallback(() => {
    if (!previewTarget) return;
    const previewableFiles = getPreviewableFiles();
    const currentIndex = findFileIndex(previewTarget.id);
    if (currentIndex > 0) {
      const prevFile = previewableFiles[currentIndex - 1];
      onPreview("FILE", prevFile.id, prevFile.name, prevFile.mimeType ?? undefined, prevFile.size ?? undefined);
    }
  }, [previewTarget, getPreviewableFiles, findFileIndex]);

  const handleNextFile = useCallback(() => {
    if (!previewTarget) return;
    const previewableFiles = getPreviewableFiles();
    const currentIndex = findFileIndex(previewTarget.id);
    if (currentIndex >= 0 && currentIndex < previewableFiles.length - 1) {
      const nextFile = previewableFiles[currentIndex + 1];
      onPreview("FILE", nextFile.id, nextFile.name, nextFile.mimeType ?? undefined, nextFile.size ?? undefined);
    }
  }, [previewTarget, getPreviewableFiles, findFileIndex]);

  async function onVersionHistory(type: "FILE" | "FOLDER", id: string, name: string, mimeType?: string, size?: number) {
    if (type !== "FILE") return;
    setVersionHistoryTarget({
      type,
      id,
      name,
      mimeType,
      size,
    });
  }

  // Selection Handlers
  const handleSelectRow = (id: string, isSelected: boolean) => {
    const newSelection = new Set(selectedIds);
    if (isSelected) {
      newSelection.add(id);
    } else {
      newSelection.delete(id);
    }
    setSelectedIds(newSelection);
  };

  const handleFavorite = async (type: "FILE" | "FOLDER", id: string) => {
    if (favoriteIds.has(id)) { await removeFavorite(type, id); setFavoriteIds((current) => { const next = new Set(current); next.delete(id); return next; }); }
    else { await addFavorite(type, id); setFavoriteIds((current) => new Set(current).add(id)); }
  };

  const handleOpen = (type: "FILE" | "FOLDER", id: string, name: string) => {
    if (type === "FOLDER") {
      router.push(`/files/${id}`);
    } else {
      onPreview("FILE", id, name);
    }
  };

  const handleMove = (type: "FILE" | "FOLDER", id: string, name: string) => {
    setMoveTarget({ type, id, name });
  };

  const handleViewDetails = (type: "FILE" | "FOLDER", id: string, name: string, mimeType?: string, size?: number) => {
    if (type === "FOLDER") {
      const folder = folders.find((f) => f.id === id);
      if (folder) openInspector({ kind: "FOLDER", folder });
      setDetailsTarget({
        resourceType: "FOLDER",
        name,
        mimeType: null,
        size: null,
        updatedAt: folder?.updatedAt ?? null,
        ownerName: folder?.ownerName ?? null,
        ownerEmail: folder?.ownerEmail ?? null,
        permission: null,
      });
    } else {
      const file = files.find((f) => f.id === id);
      if (file) openInspector({ kind: "FILE", file });
      setDetailsTarget({
        resourceType: "FILE",
        name,
        mimeType: mimeType ?? null,
        size: size ?? null,
        updatedAt: file?.updatedAt ?? null,
        ownerName: file?.ownerName ?? null,
        ownerEmail: file?.ownerEmail ?? null,
        permission: null,
      });
    }
  };

  const handleSelectAll = (isSelected: boolean) => {
    const newSelection = new Set<string>();
    const allItems = [...folders,...files].map(item => item.id);
    if (isSelected) {
      allItems.forEach(id => newSelection.add(id));
    }
    setSelectedIds(newSelection);
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col w-full max-w-full overflow-x-hidden">
      <ShellScopeSync folderId={folderId} folderName={folderName} />
      <ActionToolbar view={viewMode} onView={(v) => switchViewMode(v)} sort={sortDir} onSort={setSortDir} filter={filter} onFilter={setFilter} />
      <SelectionBar
        folderCount={folders.filter((f) => selectedIds.has(f.id)).length}
        fileCount={files.filter((f) => selectedIds.has(f.id)).length}
        onShare={() => {
          const id = Array.from(selectedIds)[0];
          if (!id) return;
          const type = folders.some((f) => f.id === id) ? "FOLDER" : "FILE";
          setShareTarget({ type, id });
        }}
        onCopyLink={() => {
          const id = Array.from(selectedIds)[0];
          if (!id) return;
          try {
            void navigator.clipboard.writeText(`${window.location.origin}/files/${id}`);
          } catch { /* clipboard unavailable */ }
        }}
        onDownload={() => {
          const file = files.find((f) => selectedIds.has(f.id));
          if (file) void onDownload(file.id);
        }}
        onClear={() => setSelectedIds(new Set())}
      />
      <div className="hidden">
        <h1 className="truncate text-[13.5px] font-semibold text-slate-900">
          {label("files.heading")}
        </h1>
        {selectedIds.size > 0 && (
          <div className="imkan-toolbar flex items-center gap-2 bg-[color:var(--imkan-color-surface)] px-4 py-2 rounded-sm shadow-sm border border-[color:var(--imkan-color-border)]">
            <span className="text-[length:var(--imkan-font-size-secondary)] mr-4">{selectedIds.size} {label("files.selected")}</span>
            <button className="imkan-button-secondary" onClick={() => setSelectedIds(new Set())}>{label("files.deselect")}</button>
            <button className="imkan-button-secondary" onClick={async () => {
              const ids = Array.from(selectedIds);
              const folderIds = ids.filter((id) => folders.some((folder) => folder.id === id));
              const fileIds = ids.filter((id) => files.some((file) => file.id === id));
              if (folderIds.length) await bulkTrashFolders(folderIds);
              if (fileIds.length) await bulkTrashFiles(fileIds);
              setSelectedIds(new Set());
              await load();
            }}>{label("files.delete")}</button>
          </div>
        )}
      </div>

      <Breadcrumbs folderId={searchActive? undefined : folderId} folderName={searchActive? undefined : folderName} />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        {canMutate? (
          <form onSubmit={onCreateFolder} className="flex items-end gap-2">
            <label className="flex flex-col gap-1 text-[length:var(--imkan-font-size-secondary)]">
              {label("files.folderName")}
              <input
                value={newFolderName}
                onChange={(event) => setNewFolderName(event.target.value)}
                placeholder={label("files.newFolderPlaceholder")}
                className="imkan-input"
                ref={newFolderInputRef}
              />
            </label>
            <button type="submit" className="imkan-button-secondary">{label("files.createFolder")}</button>
          </form>
        ) : null}
        {canMutate ? <UploadZone folderId={folderId ?? null} onUploaded={() => void load()} /> : null}
        <form onSubmit={(event) => void onSearch(event)} className="flex items-end gap-2">
          <label className="flex flex-col gap-1 text-[length:var(--imkan-font-size-secondary)]">
            {label("files.search")}
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={label("files.searchPlaceholder")}
              className="imkan-input"
            />
          </label>
          <button type="submit" className="imkan-button-secondary">{label("files.search")}</button>
        </form>
      </div>

      {error? <AlertBanner message={error} action={<button type="button" className="imkan-button-secondary" onClick={() => void load()}>{label("feedback.retry")}</button>} /> : null}

      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-100 p-3">
      {loading ? <SkeletonLoader columns={6} /> : viewMode === "grid" ? (
        <FileGridView
          folders={folders}
          files={files}
          canMutate={canMutate}
          canShare={canShare}
          folderSizes={folderSizes}
          folderUpdatedAt={folderUpdatedAt}
          onOpenFolder={(folderId) => router.push(`/files/${folderId}`)}
          onPreview={(file) => void onPreview("FILE", file.id, file.name, file.mimeType ?? undefined, file.size ?? undefined)}
          onShare={(type, id) => setShareTarget({ type, id })}
          onDownload={(fileId) => void onDownload(fileId)}
          onRename={(type, id, name) => setRenameTarget({ type, id, name })}
          onDelete={(type, id) => setDeleteTarget({ type, id })}
          onMove={(type, id, name) => setMoveTarget({ type, id, name })}
          onFavorite={handleFavorite}
          onVersionHistory={onVersionHistory}
          onViewDetails={handleViewDetails}
          favoriteIds={favoriteIds}
          canFavorite={true}
        />
      ) : (
        <FileTable
          folders={folders}
          files={files}
          canMutate={canMutate}
          canShare={canShare}
          folderSizes={folderSizes}
          folderUpdatedAt={folderUpdatedAt}
          onShare={(type, id) => setShareTarget({ type, id })}
          onDownload={onDownload}
          onPreview={onPreview}
          onVersionHistory={onVersionHistory}
          onOpen={handleOpen}
          onMove={handleMove}
          onDropMove={(type, id, destinationFolderId) => { if (type === "FILE") void moveFile(id, destinationFolderId).then(load); else void moveFolder(id, destinationFolderId).then(load); }}
          onViewDetails={handleViewDetails}
          onRename={(type, id, name) => setRenameTarget({ type, id, name })}
          onDelete={(type, id) => setDeleteTarget({ type, id })}
          onFavorite={handleFavorite}
          favoriteIds={favoriteIds}
          onCopyLink={(id) => {
            try {
              void navigator.clipboard.writeText(`${window.location.origin}/files/${id}`);
            } catch { /* clipboard unavailable */ }
          }}
          emptyTitle={searchActive? label("files.searchEmpty") : label("files.empty")}
          emptyDescription={searchActive? label("files.searchEmptyDescription") : label("empty.ctaTitle")}
          emptyAction={searchActive ? undefined : <FolderEmptyState />}
          selectedIds={selectedIds}
          onSelectRow={handleSelectRow}
          onSelectAll={handleSelectAll}
        />
      )}
      </div>

      {shareTarget? (
        <ShareModal
          resourceType={shareTarget.type}
          resourceId={shareTarget.id}
          onClose={() => setShareTarget(null)}
        />
      ) : null}
      {renameTarget? (
        <RenameModal
          currentName={renameTarget.name}
          onClose={() => setRenameTarget(null)}
          onSubmit={async (name) => {
            if (renameTarget.type === "FOLDER") {
              await renameFolder(renameTarget.id, name);
            } else {
              await renameFile(renameTarget.id, name);
            }
            await load();
          }}
        />
      ) : null}
      {deleteTarget? (
        <DeleteModal
          onClose={() => setDeleteTarget(null)}
          onConfirm={async () => {
            if (deleteTarget.type === "FOLDER") {
              await deleteFolder(deleteTarget.id);
            } else {
              await trashFile(deleteTarget.id);
            }
            await load();
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
            await load();
          }}
        />
      ) : null}
      {previewTarget ? (
        <FilePreviewModal
          target={previewTarget.type === "FILE" ? {
            id: previewTarget.id,
            name: previewTarget.name,
            mimeType: previewTarget.mimeType,
            size: previewTarget.size,
          } : null}
          onClose={() => setPreviewTarget(null)}
          onPrevFile={handlePrevFile}
          onNextFile={handleNextFile}
        />
      ) : null}
      {versionHistoryTarget? (
        <VersionHistoryDrawer
          isOpen={!!versionHistoryTarget}
          onClose={() => setVersionHistoryTarget(null)}
          fileId={versionHistoryTarget.id}
          fileName={versionHistoryTarget.name}
          mimeType={versionHistoryTarget.mimeType ?? ""}
          size={versionHistoryTarget.size ?? 0}
          canWrite={canMutate}
          onPreviewVersion={(version) => {
            // Resolve the freshest file record (the drawer's onRestored()/
            // onUploaded() re-fetch via load()) so the preview modal receives
            // the updated stream URL + MIME type instead of stale pre-restore
            // values. `usePreviewUrl` re-issues GET /files/:id/preview-url on
            // mount, which now points at the restored version's real bytes.
            void version;
            const fresh = files.find((candidate) => candidate.id === versionHistoryTarget.id);
            setPreviewTarget({
              type: "FILE",
              id: versionHistoryTarget.id,
              name: versionHistoryTarget.name,
              mimeType: fresh?.mimeType ?? versionHistoryTarget.mimeType,
              size: fresh?.size ?? versionHistoryTarget.size,
            });
          }}
          onRestored={async () => {
            // Re-fetch the main file details so the preview target (and any
            // downstream stream URL / MIME) reflects the restored version.
            await load();
          }}
          onUploaded={async () => {
            await load();
          }}
        />
      ) : null}
    {detailsTarget ? <FileDetailsModal data={detailsTarget} onClose={() => setDetailsTarget(null)} /> : null}
    </section>
  );
}
