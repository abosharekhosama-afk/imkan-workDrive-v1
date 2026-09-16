"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { Breadcrumbs } from "./breadcrumbs";
import { ActionToolbar, FILTER_STORAGE_KEY, type AdvancedFileFilter, type ColumnKey, type FilterKey, type SortDir } from "./layout/action-toolbar";
import { SelectionBar } from "./layout/selection-bar";
import { FolderEmptyState } from "./layout/folder-empty-state";
import { ShellScopeSync } from "./layout/shell-context";
import { FileTable } from "./file-table";
import { FileGridView } from "./file-grid-view";
import { ShareModal } from "./share-modal";
import { useLocale } from "./locale-provider";
import { bulkTrashFolders, createFolder, deleteFolder, getFolder, listRootContents, renameFolder, moveFolder, copyFolder } from "../lib/api/folders";
import { bulkTrashFiles, renameFile, requestDownload, trashFile, moveFile, copyFile, getFileDetails } from "../lib/api/files";
import { triggerDownload } from "../lib/api/download";
import { addFavorite, listFavorites, removeFavorite } from "../lib/api/favorites";
import { ApiError } from "../lib/api/client";
import type { FileRecord, FolderRecord } from "../lib/api/types";
import { searchNames } from "../lib/api/search";
import { DeleteModal } from "./delete-modal";
import { RenameModal } from "./rename-modal";
import { Modal } from "./modal";
import { MoveModal } from "./move-modal";
import { Toast } from "./toast";
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
import { UploadZone } from "./upload-zone";
import { errorMessageForStatus } from "./feedback-state-logic";
import { WorkflowPicker } from "./workflow-picker";
import { listWorkflowResourceStatus, type WorkflowResourceStatus } from "../lib/api/workflows";

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
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [copyTarget, setCopyTarget] = useState<{
    type: "FILE" | "FOLDER";
    id: string;
    name: string;
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
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
  const [workflowTarget, setWorkflowTarget] = useState<{type:"FILE"|"FOLDER";id:string;name:string}|null>(null);
  const [workflowStatuses, setWorkflowStatuses] = useState<Map<string, WorkflowResourceStatus>>(new Map());
  const [workflowStatusTarget, setWorkflowStatusTarget] = useState<{ status: WorkflowResourceStatus; resourceName: string } | null>(null);
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
  const [searchActive, setSearchActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  // Dual view preference (list/table ↔ grid), persisted per browser.
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [sortField, setSortField] = useState<ColumnKey>("name");
  const [columns, setColumns] = useState<Partial<Record<ColumnKey, boolean>>>({ lastModified: true, timeCreated: false, size: true, type: false, extension: false });
  const [filter, setFilter] = useState<FilterKey>((searchParams.get("filter") as FilterKey) || "all");
  const [advancedFilter, setAdvancedFilter] = useState<AdvancedFileFilter>({
    type: (searchParams.get("type") as AdvancedFileFilter["type"]) || "all",
    status: (searchParams.get("status") as AdvancedFileFilter["status"]) || "all",
    dateField: (searchParams.get("dateField") as AdvancedFileFilter["dateField"]) || "modified",
    dateFrom: searchParams.get("dateFrom") || "", dateTo: searchParams.get("dateTo") || "", owner: searchParams.get("owner") || "",
  });
  // Folder aggregate metadata surfaced by the API (size / latest file update).
  const [folderSizes, setFolderSizes] = useState<ReadonlyMap<string, number>>(new Map());
  const [folderUpdatedAt, setFolderUpdatedAt] = useState<ReadonlyMap<string, string | null>>(new Map());
  const owners = useMemo(() => { const map = new Map<string,{id:string;name:string|null;email:string}>(); for (const f of files) if (f.ownerId && !map.has(f.ownerId)) map.set(f.ownerId,{id:f.ownerId,name:f.ownerName??null,email:f.ownerEmail??""}); return [...map.values()]; }, [files]);

  const applyContents = (contents: { folders: FolderRecord[]; files: FileRecord[]; folderSizes?: Record<string, number> | null; folderUpdatedAt?: Record<string, string | null> | null }) => {
    setFolders(mapFolderRecords(contents.folders));
    setFiles(mapFileRecords(contents.files));
    setFolderSizes(new Map(Object.entries(contents.folderSizes ?? {})));
    setFolderUpdatedAt(new Map(Object.entries(contents.folderUpdatedAt ?? {})));
  };

  const refreshWorkflowStatuses = async (contents: { folders: FolderRecord[]; files: FileRecord[] }) => {
    const [fileStatus, folderStatus] = await Promise.all([
      listWorkflowResourceStatus('FILE', contents.files.map((item) => item.id)).catch(() => []),
      listWorkflowResourceStatus('FOLDER', contents.folders.map((item) => item.id)).catch(() => []),
    ]);
    const next = new Map<string, WorkflowResourceStatus>();
    for (const item of [...fileStatus, ...folderStatus]) next.set(item.resourceId, item);
    setWorkflowStatuses(next);
  };

  // Selection State (Phase 5)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const canMutate = canMutateContent(role, readOnly);
  const canShare = canShareContent(role, readOnly);

  // The toolbar previously persisted the selected filter but never applied it
  // to the rendered dataset. Keep filtering local to the loaded folder so it
  // works for both API-backed results and search results without changing the
  // backend contract.
  const filteredContents = useMemo(() => {
    const fileMatches = (file: FileRecord) => {
      const mime = (file.mimeType ?? resolveMimeType(undefined, file.name) ?? "").toLowerCase();
      const name = file.name.toLowerCase();
      const isImageVideo = mime.startsWith("image/") || mime.startsWith("video/");
      const isAudio = mime.startsWith("audio/");
      const isArchive = /zip|rar|7z|tar|gzip|compressed/.test(mime) || /\.(zip|rar|7z|tar|gz|tgz)$/i.test(name);
      const isSheet = /spreadsheet|excel|csv|sheet/.test(mime) || /\.(xls|xlsx|ods|csv)$/i.test(name);
      const isSlide = /presentation|powerpoint|keynote|slide/.test(mime) || /\.(ppt|pptx|odp)$/i.test(name);
      const isDocument = /wordprocessing|msword|officedocument\.word|pdf|text\//.test(mime) || /\.(doc|docx|odt|pdf|txt|rtf)$/i.test(name);
      if (advancedFilter.type !== "all") {
        const expected = advancedFilter.type.toUpperCase();
        if (String(file.fileType ?? "").toUpperCase() !== expected && !(expected === "PDF" && mime === "application/pdf")) return false;
      }
      if (advancedFilter.status !== "all" && advancedFilter.status !== "PENDING_APPROVAL" && String(file.status ?? "ACTIVE") !== advancedFilter.status) return false;
      if (advancedFilter.owner && file.ownerId !== advancedFilter.owner) return false;
      const dateValue = advancedFilter.dateField === "created" ? file.createdAt : file.updatedAt;
      if (advancedFilter.dateFrom && Date.parse(dateValue ?? "") < Date.parse(`${advancedFilter.dateFrom}T00:00:00`)) return false;
      if (advancedFilter.dateTo && Date.parse(dateValue ?? "") > Date.parse(`${advancedFilter.dateTo}T23:59:59`)) return false;
      switch (filter) {
        case "folders": return false;
        case "documents": return isDocument;
        case "sheets": return isSheet;
        case "slides": return isSlide;
        case "media": return isImageVideo;
        case "audio": return isAudio;
        case "archives": return isArchive;
        case "favorites": return favoriteIds.has(file.id);
        default: return true;
      }
    };
    const folderMatches = (folder: FolderRecord) => filter === "all" || filter === "folders" || (filter === "favorites" && favoriteIds.has(folder.id));
    const compare = (a: FileRecord | FolderRecord, b: FileRecord | FolderRecord) => {
      let av: string | number = a.name.toLocaleLowerCase();
      let bv: string | number = b.name.toLocaleLowerCase();
      if (sortField === "lastModified") { av = Date.parse(a.updatedAt ?? "") || 0; bv = Date.parse(b.updatedAt ?? "") || 0; }
      else if (sortField === "timeCreated") { av = Date.parse(a.updatedAt ?? "") || 0; bv = Date.parse(b.updatedAt ?? "") || 0; }
      else if (sortField === "size") { av = "size" in a ? (a.size ?? 0) : (folderSizes.get(a.id) ?? 0); bv = "size" in b ? (b.size ?? 0) : (folderSizes.get(b.id) ?? 0); }
      else if (sortField === "type") { av = "mimeType" in a ? (a.mimeType ?? "") : "folder"; bv = "mimeType" in b ? (b.mimeType ?? "") : "folder"; }
      else if (sortField === "extension") { av = a.name.includes(".") ? a.name.split(".").pop()!.toLowerCase() : ""; bv = b.name.includes(".") ? b.name.split(".").pop()!.toLowerCase() : ""; }
      const result = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? result : -result;
    };
    return {
      folders: folders.filter(folderMatches).sort(compare),
      files: files.filter(fileMatches).sort(compare),
    };
  }, [filter, advancedFilter, favoriteIds, files, folders, folderSizes, sortDir, sortField]);

  useEffect(() => {
    const q = new URLSearchParams(searchParams.toString());
    const setOrDelete = (key: string, value: string) => value ? q.set(key, value) : q.delete(key);
    setOrDelete("filter", filter === "all" ? "" : filter); setOrDelete("type", advancedFilter.type === "all" ? "" : advancedFilter.type);
    setOrDelete("status", advancedFilter.status === "all" ? "" : advancedFilter.status); setOrDelete("owner", advancedFilter.owner);
    setOrDelete("dateField", advancedFilter.dateField === "modified" ? "" : advancedFilter.dateField); setOrDelete("dateFrom", advancedFilter.dateFrom); setOrDelete("dateTo", advancedFilter.dateTo);
    const next = q.toString();
    const current = searchParams.toString();
    if (next !== current) router.replace(`${window.location.pathname}${next ? `?${next}` : ""}`, { scroll: false });
  }, [filter, advancedFilter, router, searchParams]);

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
        await refreshWorkflowStatuses(result);
      } else if (folderId) {
        const detail = await getFolder(folderId, { type: advancedFilter.type === "all" ? undefined : advancedFilter.type, status: advancedFilter.status === "all" ? undefined : advancedFilter.status, owner: advancedFilter.owner || undefined, dateField: advancedFilter.dateField, dateFrom: advancedFilter.dateFrom || undefined, dateTo: advancedFilter.dateTo || undefined });
        setFolderName(detail.name);
        applyContents(detail);
        await refreshWorkflowStatuses(detail);
      } else {
        const contents = await listRootContents({ type: advancedFilter.type === "all" ? undefined : advancedFilter.type, status: advancedFilter.status === "all" ? undefined : advancedFilter.status, owner: advancedFilter.owner || undefined, dateField: advancedFilter.dateField, dateFrom: advancedFilter.dateFrom || undefined, dateTo: advancedFilter.dateTo || undefined });
        setFolderName(undefined);
        applyContents(contents);
        await refreshWorkflowStatuses(contents);
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
  }, [folderId, label, routeQuery, advancedFilter]);

  useEffect(() => {
    const focusNewFolder = () => setNewFolderOpen(true);
    const triggerUpload = () => window.dispatchEvent(new Event("workdrive:trigger-upload"));
    const kind = searchParams.get("new");
    if (kind === "folder") setNewFolderOpen(true);
    if (kind === "upload") window.setTimeout(triggerUpload, 50);
    if (kind === "upload-folder") window.setTimeout(() => window.dispatchEvent(new Event("workdrive:trigger-upload-folder")), 50);
    const refreshAfterCreation = () => { void load(); };
    window.addEventListener("workdrive:new-folder", focusNewFolder);
    window.addEventListener("workdrive:content-changed", refreshAfterCreation);
    return () => {
      window.removeEventListener("workdrive:new-folder", focusNewFolder);
      window.removeEventListener("workdrive:content-changed", refreshAfterCreation);
    };
  }, [searchParams]);

  // Inspector deep-link: "Version history" inside the details pane opens the drawer.
  // The handler is read through a ref so the listener subscribes exactly once
  // (fixed dependency array → no re-subscribe churn on every render).
  const onVersionHistoryRef = useRef(onVersionHistory);
  useEffect(() => {
    const onVersion = (event: Event) => {
      const fileId = (event as CustomEvent<{ fileId: string }>).detail?.fileId;
      if (!fileId) return;
      const file = files.find((f) => f.id === fileId);
      if (!file) return;
      onVersionHistoryRef.current("FILE", file.id, file.name, file.mimeType ?? undefined, file.size ?? undefined);
    };
    window.addEventListener("workdrive:version-history", onVersion);
    return () => window.removeEventListener("workdrive:version-history", onVersion);
  }, [files]);

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
    void load();
  }, [load, routeQuery]);

  // Legacy quick-create / inline-search forms were purged (Zoho parity):
  // creation flows through the + New toolbar menu and header search.

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || selectedIds.size === 0) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      e.preventDefault();
      setSelectedIds(new Set());
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedIds]);

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

  const handleViewDetails = async (type: "FILE" | "FOLDER", id: string, name: string, mimeType?: string, size?: number) => {
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
      try {
        const detail = await getFileDetails(id);
        setDetailsTarget({
          resourceType: "FILE", name: detail.name, mimeType: detail.mimeType, size: detail.size,
          updatedAt: detail.updatedAt, createdAt: detail.createdAt, tags: detail.tags.map((tag) => tag.name), ownerName: detail.owner.name, ownerEmail: detail.owner.email,
          permission: detail.visibility, location: detail.location?.name ?? null,
        });
      } catch {
        setDetailsTarget({
          resourceType: "FILE", name, mimeType: mimeType ?? null, size: size ?? null,
          updatedAt: file?.updatedAt ?? null, ownerName: file?.ownerName ?? null,
          ownerEmail: file?.ownerEmail ?? null, permission: null,
        });
      }
    }
  };

  const handleSelectAll = (isSelected: boolean) => {
    const newSelection = new Set<string>();
    const allItems = [...filteredContents.folders, ...filteredContents.files].map(item => item.id);
    if (isSelected) {
      allItems.forEach(id => newSelection.add(id));
    }
    setSelectedIds(newSelection);
  };

  // Stable tree-navigation callback — direct prop wiring (replaces the old
  // `workdrive:tree-open` CustomEvent). Guarded: no redundant navigation when
  // the target folder is already the current one.
  const handleOpenFolder = useCallback((targetId: string) => {
    if (!targetId || targetId === folderId) return;
    router.push(`/files/${targetId}`);
  }, [folderId, router]);

  return (
    <section className="flex min-h-0 flex-1 flex-col w-full max-w-full overflow-x-hidden">
      <ShellScopeSync folderId={folderId} folderName={folderName} />
      <div className="flex min-w-0 flex-1 flex-col bg-white">
        {selectedIds.size === 0 ? (
          <ActionToolbar view={viewMode} onView={(v) => switchViewMode(v)} sortField={sortField} onSortField={setSortField} sortDir={sortDir} onSortDir={setSortDir} filter={filter} onFilter={setFilter} advancedFilter={advancedFilter} onAdvancedFilter={setAdvancedFilter} owners={owners} columns={columns} onColumns={setColumns} folders={folders} currentFolderId={folderId} onOpenFolder={handleOpenFolder} />
        ) : (
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
        )}
        <Breadcrumbs folderId={searchActive ? undefined : folderId} folderName={searchActive ? undefined : folderName} />

      {error ? <AlertBanner message={error} action={<button type="button" className="imkan-button-secondary" onClick={() => void load()}>{label("feedback.retry")}</button>} /> : null}

      <div className="min-h-0 flex-1 overflow-y-auto bg-white">
      {loading ? <SkeletonLoader columns={6} /> : viewMode === "grid" ? (
        <FileGridView
          folders={filteredContents.folders}
          files={filteredContents.files}
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
          folders={filteredContents.folders}
          files={filteredContents.files}
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
          onCopy={(type, id, name) => setCopyTarget({ type, id, name })}
          onDropMove={(type, id, destinationFolderId) => { if (type === "FILE") void moveFile(id, destinationFolderId).then(load); else void moveFolder(id, destinationFolderId).then(load); }}
          onViewDetails={handleViewDetails}
          onRename={(type, id, name) => setRenameTarget({ type, id, name })}
          onDelete={(type, id) => setDeleteTarget({ type, id })}
          onFavorite={handleFavorite}
          favoriteIds={favoriteIds}
          onAssignWorkflow={(type,id,name)=>setWorkflowTarget({type,id,name})}
          workflowStatuses={workflowStatuses}
          onWorkflowStatusClick={(status, resourceName) => setWorkflowStatusTarget({ status, resourceName })}
          onCopyLink={(id) => {
            try {
              void navigator.clipboard.writeText(`${window.location.origin}/files/${id}`);
            } catch { /* clipboard unavailable */ }
          }}
          emptyTitle={searchActive ? label("files.searchEmpty") : filteredContents.folders.length + filteredContents.files.length === 0 && filter !== "all" ? label("files.searchEmpty") : label("empty.title")}
          emptyDescription={searchActive ? label("files.searchEmptyDescription") : filteredContents.folders.length + filteredContents.files.length === 0 && filter !== "all" ? label("files.searchEmptyDescription") : label("empty.subtitle")}
          emptyAction={searchActive || (filteredContents.folders.length + filteredContents.files.length === 0 && filter !== "all") ? undefined : <FolderEmptyState folderId={folderId} />}
          selectedIds={selectedIds}
          onSelectRow={handleSelectRow}
          onSelectAll={handleSelectAll}
          compact={viewMode === "compact"}
          sortField={sortField}
          sortDir={sortDir}
          columns={columns}
          onColumns={setColumns}
        />
      )}
      </div>
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
      {copyTarget ? (
        <MoveModal
          resourceName={copyTarget.name}
          mode="copy"
          onClose={() => setCopyTarget(null)}
          onMove={async (destinationFolderId) => {
            if (copyTarget.type === "FOLDER") {
              await copyFolder(copyTarget.id, destinationFolderId);
            } else {
              await copyFile(copyTarget.id, destinationFolderId);
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
    {workflowStatusTarget ? (
      <Modal title="Workflow status" onClose={() => setWorkflowStatusTarget(null)} footer={<button type="button" className="imkan-button-secondary" onClick={() => setWorkflowStatusTarget(null)}>Close</button>}>
        <div className="space-y-4"><div><div className="text-[11px] text-slate-500">Resource</div><div className="text-sm font-medium">{workflowStatusTarget.resourceName}</div></div><div><div className="text-[11px] text-slate-500">Workflow</div><div className="text-sm font-medium">{workflowStatusTarget.status.workflowName}</div></div><div className="grid grid-cols-2 gap-3"><div><div className="text-[11px] text-slate-500">Status</div><div className="text-sm">{workflowStatusTarget.status.status}</div></div><div><div className="text-[11px] text-slate-500">Current state</div><div className="text-sm">{workflowStatusTarget.status.state?.name ?? '—'}</div></div></div>{workflowStatusTarget.status.myPendingTask ? <div className="rounded-md border border-slate-200 bg-slate-50 p-3"><div className="text-[11px] font-medium text-slate-500">Your action</div><div className="mt-1 text-sm">{workflowStatusTarget.status.myPendingTask.title}</div>{workflowStatusTarget.status.myPendingTask.dueAt ? <div className="mt-1 text-[11px] text-slate-500">Due {new Date(workflowStatusTarget.status.myPendingTask.dueAt).toLocaleString()}</div> : null}</div> : null}</div>
      </Modal>
    ) : null}
    {workflowTarget ? <WorkflowPicker resourceType={workflowTarget.type} resourceId={workflowTarget.id} resourceName={workflowTarget.name} onClose={()=>setWorkflowTarget(null)} onStarted={()=>setToast("Workflow started")} /> : null}
    {detailsTarget ? <FileDetailsModal data={detailsTarget} onClose={() => setDetailsTarget(null)} /> : null}
    {newFolderOpen ? (
      <Modal title={label("menu.newFolder")} onClose={() => setNewFolderOpen(false)}>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const name = newFolderName.trim();
            if (!name) return;
            await createFolder(name, folderId);
            setNewFolderName("");
            setNewFolderOpen(false);
            await load();
          }}
          className="text-[length:var(--imkan-font-size-ui)]"
        >
          <label className="mb-3 flex flex-col gap-1">
            {label("files.folderName")}
            <input
              autoFocus
              value={newFolderName}
              onChange={(event) => setNewFolderName(event.target.value)}
              placeholder={label("files.newFolderPlaceholder")}
              className="imkan-input"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className="imkan-button-secondary" onClick={() => setNewFolderOpen(false)}>{label("share.cancel")}</button>
            <button type="submit" className="imkan-button" disabled={!newFolderName.trim()}>{label("files.createFolder")}</button>
          </div>
        </form>
      </Modal>
    ) : null}
    {/* Keep the real upload inputs mounted even when the visible drop zone is
        not shown. The top-bar New > Upload / Upload folder actions dispatch
        these events, so they must have a live listener in every folder view. */}
    <UploadZone
      folderId={folderId ?? null}
      onUploaded={() => { void load(); }}
      triggerOnly
    />
    {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </section>
  );
}
