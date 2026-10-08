"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { Breadcrumbs } from "./breadcrumbs";
import { ActionToolbar, FILTER_STORAGE_KEY, type AdvancedFileFilter, type ColumnKey, type FilterKey, type SortDir } from "./layout/action-toolbar";
import { SelectionBar } from "./layout/selection-bar";
import { FolderEmptyState } from "./layout/folder-empty-state";
import { ShellScopeSync, useShell } from "./layout/shell-context";
import { FileGridView } from "./file-grid-view";
import { FileTable } from "./file-table";
import { ShareModal } from "./share-modal";
import { useLocale } from "./locale-provider";
import { bulkTrashFolders, createFolder, deleteFolder, getFolder, listRootContents, renameFolder, moveFolder, copyFolder } from "../lib/api/folders";
import { bulkTrashFiles, downloadFilesArchive, renameFile, requestDownload, trashFile, moveFile, copyFile, getFileDetails, runFileControl, type FileControlAction } from "../lib/api/files";
import { triggerDownload } from "../lib/api/download";
import { addFavorite, listFavorites, removeFavorite } from "../lib/api/favorites";
import { ApiError } from "../lib/api/client";
import type { FileRecord, FolderRecord } from "../lib/api/types";
import { searchNames } from "../lib/api/search";
import { DeleteModal } from "./delete-modal";
import { useConfirmAction } from "./confirm-action-modal";
import { RenameModal } from "./rename-modal";
import { Modal } from "./modal";
import { MoveModal } from "./move-modal";
import { Toast } from "./toast";
import { FilePreviewModal } from "./file-preview-modal";
import { VersionHistoryDrawer } from "./files/version-history-drawer";
import { resolveMimeType } from "../lib/api/mime";
import { mapFileRecords, mapFolderRecords } from "../lib/api/table-mappers";

import {
  hasPersonalViewMode,
  persistViewMode,
  readStoredViewMode,
  thumbnailMinPx,
  viewModeFromOrgDefault,
  type ViewMode,
} from "./view-mode-logic";
import { getWorkspacePolicy } from "../lib/api/organization";
import { getTransferDataTemplateMandate, listDataTemplates, type DataTemplate } from "../lib/api/metadata";
import { resolveDataTemplateSchema } from "../lib/data-template-logic";

import { canMutateContent, canShareContent } from "../lib/permissions";
import { listSharedByMe } from "../lib/api/shared";
import { listWorkspaceLabelResources, listWorkspaceLabels } from "../lib/api/workspace-labels";
import { officeEditorPath, isNativeImkanOfficeFile, imkanOfficeEditorPath } from "../lib/office-file-routing";
import { createOfficeCopy } from "../lib/api/office";
import type { FileActionHandlers, FileControlState } from "./file-actions-menu";
import { normalizePublicAppUrl } from "../lib/public-url";
import { findActiveShareForResource, resolveShareTarget } from "../lib/share-resource-logic";
import {
  openResourceInNewTab,
  partitionSelection,
  resolveSelectedResource,
  type SelectionBarActionKey,
} from "../lib/selection-bar-actions-logic";
import { AlertBanner } from "./alert-banner";
import { SkeletonLoader } from "./skeleton-loader";
import { UploadZone } from "./upload-zone";
import { errorMessageForStatus } from "./feedback-state-logic";
import { WorkflowPicker } from "./workflow-picker";
import { ImkanOptionPicker } from "./imkan-option-picker";
import { listWorkflowResourceStatus, type WorkflowResourceStatus } from "../lib/api/workflows";
import { listFollows, unfollowResource } from "../lib/api/follows";
import { FollowUpdatesModal, type FollowTarget } from "./follow-updates-modal";
import { followResourceKey } from "../lib/follow-updates-logic";
import type { ShareLaunchMode } from "../lib/share-launch-logic";
import { DataTemplateAssociationModal, type DataTemplateTarget } from "./data-template-association-modal";
import { LabelAssignmentModal } from "./label-assignment-modal";
import { DlpClassifyModal } from "./dlp-classify-modal";

export function FileBrowser({
  folderId,
  role,
  readOnly,
}: {
  folderId?: string;
  role?: string;
  readOnly?: boolean;
}) {
  const { label, locale } = useLocale();
  const { select, setInspectorTab, setInspectorOpen, setMobileInspectorOpen, inspectorOpen, selected: inspectorSelected } = useShell();
  const searchParams = useSearchParams();
  const router = useRouter();
  const routeQuery = searchParams.get("query")?.trim() ?? "";
  const openFileId = searchParams.get("openFileId");
  const [folders, setFolders] = useState<FolderRecord[]>([]);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [folderName, setFolderName] = useState<string | undefined>();
  const [teamFolderId, setTeamFolderId] = useState<string | null>(null);
  const [dataTemplates, setDataTemplates] = useState<DataTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderMandate, setNewFolderMandate] = useState<DataTemplate | null>(null);
  const [newFolderFields, setNewFolderFields] = useState<Record<string, unknown>>({});
  const [newFolderMandateLoading, setNewFolderMandateLoading] = useState(false);
  const [copyTarget, setCopyTarget] = useState<{
    type: "FILE" | "FOLDER";
    id: string;
    name: string;
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [shareTarget, setShareTarget] = useState<{
    type: "FILE" | "FOLDER";
    id: string;
    name: string;
  } | null>(null);
  const [shareLaunchMode, setShareLaunchMode] = useState<ShareLaunchMode>("link");
  const [renameTarget, setRenameTarget] = useState<{
    type: "FILE" | "FOLDER";
    id: string;
    name: string;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "FILE" | "FOLDER";
    id: string;
  } | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState<{
    type: "FILE" | "FOLDER";
    id: string;
    name: string;
  } | null>(null);
  const [workflowTarget, setWorkflowTarget] = useState<{type:"FILE"|"FOLDER";id:string;name:string}|null>(null);
  const [workflowStatuses, setWorkflowStatuses] = useState<Map<string, WorkflowResourceStatus>>(new Map());
  const [workflowStatusTarget, setWorkflowStatusTarget] = useState<{ status: WorkflowResourceStatus; resourceName: string } | null>(null);
  const [previewTarget, setPreviewTarget] = useState<{
    type: "FILE" | "FOLDER";
    id: string;
    name: string;
    mimeType?: string;
    size?: number;
    panel?: "details" | "comments";
    commentId?: string | null;
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
  const [rowLabels, setRowLabels] = useState<Map<string, { id: string; name: string; color: string }[]>>(new Map());
  const [rowExpiry, setRowExpiry] = useState<Map<string, string | null>>(new Map());
  const [marksTick, setMarksTick] = useState(0);
  // Dual view preference (list/table ↔ grid), persisted per browser.
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [sortField, setSortField] = useState<ColumnKey>("name");
  const [columns, setColumnsState] = useState<Partial<Record<ColumnKey, boolean>>>({ lastModified: true, timeCreated: true, size: true, type: true, extension: true });
  const [filter, setFilter] = useState<FilterKey>((searchParams.get("filter") as FilterKey) || "all");
  const [advancedFilter, setAdvancedFilter] = useState<AdvancedFileFilter>({
    type: (searchParams.get("type") as AdvancedFileFilter["type"]) || "all",
    status: (searchParams.get("status") as AdvancedFileFilter["status"]) || "all",
    dateField: (searchParams.get("dateField") as AdvancedFileFilter["dateField"]) || "modified",
    dateFrom: searchParams.get("dateFrom") || "", dateTo: searchParams.get("dateTo") || "", owner: searchParams.get("owner") || "", dataTemplateId: searchParams.get("dataTemplate") || "", dataTemplateCriteria: (() => { try { const raw = searchParams.get("criteria"); return raw ? JSON.parse(raw) : []; } catch { return []; } })(),
  });
  // Folder aggregate metadata surfaced by the API (size / latest file update).
  const [folderSizes, setFolderSizes] = useState<ReadonlyMap<string, number>>(new Map());
  const [folderUpdatedAt, setFolderUpdatedAt] = useState<ReadonlyMap<string, string | null>>(new Map());
  useEffect(() => { void listDataTemplates(false).then(setDataTemplates).catch(() => setDataTemplates([])); }, []);
  const refreshFollows = useCallback(() => { void listFollows().then((rows) => setFollowIds(new Set(rows.map((row) => followResourceKey(row.resourceType, row.resourceId))))).catch(() => setFollowIds(new Set())); }, []);
  useEffect(() => { refreshFollows(); }, [refreshFollows]);
  useEffect(() => { if (!newFolderOpen) { setNewFolderMandate(null); setNewFolderFields({}); return; } setNewFolderMandateLoading(true); void getTransferDataTemplateMandate(folderId ?? null, "FOLDERS").then((r) => setNewFolderMandate(r.enabled ? r.template : null)).catch(() => setNewFolderMandate(null)).finally(() => setNewFolderMandateLoading(false)); }, [newFolderOpen, folderId]);
  useEffect(() => { const value = searchParams.get("dataTemplate") || ""; setAdvancedFilter((current) => current.dataTemplateId === value ? current : { ...current, dataTemplateId: value }); }, [searchParams]);
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
  const [followIds, setFollowIds] = useState<Set<string>>(new Set());
  const [followTargets, setFollowTargets] = useState<FollowTarget[] | null>(null);
  const [dataTemplateTargets, setDataTemplateTargets] = useState<DataTemplateTarget[] | null>(null);
  const [labelTarget, setLabelTarget] = useState<{type:"FILE"|"FOLDER";id:string;name:string}|null>(null);
  const [classifyTarget, setClassifyTarget] = useState<{type:"FILE"|"FOLDER";id:string;name:string}|null>(null);
  useEffect(() => {
    const onOpenLabels = (event: Event) => {
      const detail = (event as CustomEvent<{ type?: "FILE" | "FOLDER"; id?: string; name?: string }>).detail;
      if (!detail?.id || !detail?.type) return;
      setLabelTarget({ type: detail.type, id: detail.id, name: detail.name || "" });
    };
    window.addEventListener("workdrive:open-labels", onOpenLabels as EventListener);
    return () => window.removeEventListener("workdrive:open-labels", onOpenLabels as EventListener);
  }, []);

  const canMutate = canMutateContent(role, readOnly);
  const canShare = canShareContent(role, readOnly);

  const openShare = useCallback((target: { type: "FILE" | "FOLDER"; id: string; name?: string }, mode: ShareLaunchMode = "link") => {
    if (!canShare) return;
    setShareLaunchMode(mode);
    setShareTarget({ type: target.type, id: target.id, name: target.name ?? "" });
  }, [canShare]);

  const copyShareLink = useCallback(async (target: { type: "FILE" | "FOLDER"; id: string }) => {
    if (!canShare) return;
    try {
      const shares = await listSharedByMe();
      const active = findActiveShareForResource(shares, target.type, target.id);
      if (active?.linkUrl) {
        await navigator.clipboard.writeText(normalizePublicAppUrl(active.linkUrl));
        setToast(label("share.copied"));
        return;
      }
    } catch {
      /* open share modal below */
    }
    openShare(target, "link");
  }, [canShare, label, openShare]);

  const openFollowUpdates = useCallback((targets: FollowTarget[]) => {
    if (!targets.length) return;
    if (targets.length === 1) {
      const target = targets[0];
      const key = followResourceKey(target.type, target.id);
      if (followIds.has(key)) {
        void unfollowResource(target.type, target.id).then(() => {
          refreshFollows();
          setToast(label("follow.stopped").replace("{name}", target.name));
        }).catch(() => setToast(label("error.generic")));
        return;
      }
    }
    setFollowTargets(targets);
  }, [followIds, label, refreshFollows]);

  useEffect(() => {
    const onOpenShare = (event: Event) => {
      const detail = (event as CustomEvent<{ type: "FILE" | "FOLDER"; id: string; tab?: "link" | "invite" }>).detail;
      if (!detail?.id || !detail?.type) return;
      openShare({ type: detail.type, id: detail.id }, detail.tab ?? "link");
    };
    window.addEventListener("workdrive:open-share", onOpenShare);
    return () => window.removeEventListener("workdrive:open-share", onOpenShare);
  }, [openShare]);

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
        const expectedTypes: Record<string, string[]> = {
          document: ["DOCUMENT", "TEXT", "CODE"],
          spreadsheet: ["SPREADSHEET"],
          presentation: ["PRESENTATION"],
          image: ["IMAGE"],
          pdf: ["PDF"],
        };
        const allowed = expectedTypes[advancedFilter.type] ?? [advancedFilter.type.toUpperCase()];
        if (!allowed.includes(String(file.fileType ?? "").toUpperCase()) && !(advancedFilter.type === "pdf" && mime === "application/pdf")) return false;
      }
      if (advancedFilter.status !== "all" && String(file.status ?? "ACTIVE").toUpperCase() !== advancedFilter.status.toUpperCase()) return false;
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
    const folderMatches = (folder: FolderRecord) => {
      if (!(filter === "all" || filter === "folders" || (filter === "favorites" && favoriteIds.has(folder.id)))) return false;
      if (advancedFilter.owner && folder.ownerId !== advancedFilter.owner) return false;
      if (advancedFilter.status !== "all" && advancedFilter.status !== "PENDING_APPROVAL") return false;
      const dateValue = folder.updatedAt;
      if (advancedFilter.dateFrom && Date.parse(dateValue ?? "") < Date.parse(`${advancedFilter.dateFrom}T00:00:00`)) return false;
      if (advancedFilter.dateTo && Date.parse(dateValue ?? "") > Date.parse(`${advancedFilter.dateTo}T23:59:59`)) return false;
      return true;
    };
    const compare = (a: FileRecord | FolderRecord, b: FileRecord | FolderRecord) => {
      let av: string | number = a.name.toLocaleLowerCase();
      let bv: string | number = b.name.toLocaleLowerCase();
      if (sortField === "lastModified") { av = Date.parse(a.updatedAt ?? "") || 0; bv = Date.parse(b.updatedAt ?? "") || 0; }
      else if (sortField === "timeCreated") { const created = (item: FileRecord | FolderRecord) => Date.parse((item as FileRecord).createdAt ?? item.updatedAt ?? "") || 0; av = created(a); bv = created(b); }
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
    setOrDelete("dateField", advancedFilter.dateField === "modified" ? "" : advancedFilter.dateField); setOrDelete("dateFrom", advancedFilter.dateFrom); setOrDelete("dateTo", advancedFilter.dateTo); setOrDelete("dataTemplate", advancedFilter.dataTemplateId); setOrDelete("criteria", advancedFilter.dataTemplateCriteria?.length ? JSON.stringify(advancedFilter.dataTemplateCriteria) : "");
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
        const searchTypeMap: Record<string, string> = {
          documents: 'DOCUMENT',
          sheets: 'SPREADSHEET',
          slides: 'PRESENTATION',
          media: 'IMAGE',
          audio: 'AUDIO',
          archives: 'ARCHIVE',
        };
        const result = await searchNames(routeQuery, filter === 'folders' ? 'folders' : filter === 'all' ? 'all' : 'files', {
          type: searchTypeMap[advancedFilter.type] ?? (advancedFilter.type === 'all' ? undefined : advancedFilter.type),
          owner: advancedFilter.owner || undefined,
          dateField: advancedFilter.dateField,
          dateFrom: advancedFilter.dateFrom || undefined,
          dateTo: advancedFilter.dateTo || undefined,
          dataTemplateId: advancedFilter.dataTemplateId || undefined,
          criteria: advancedFilter.dataTemplateCriteria?.filter((c) => c.value !== "") || undefined,
        });
        setFolderName(undefined);
        setTeamFolderId(null);
        applyContents(result);
        await refreshWorkflowStatuses(result);
      } else if (folderId) {
        const detail = await getFolder(folderId, { type: advancedFilter.type === "all" ? undefined : advancedFilter.type, status: advancedFilter.status === "all" ? undefined : advancedFilter.status, owner: advancedFilter.owner || undefined, dateField: advancedFilter.dateField, dateFrom: advancedFilter.dateFrom || undefined, dateTo: advancedFilter.dateTo || undefined });
        setFolderName(detail.name);
        setTeamFolderId(detail.teamFolderId ?? null);
        applyContents(detail);
        await refreshWorkflowStatuses(detail);
      } else {
        const contents = await listRootContents({ type: advancedFilter.type === "all" ? undefined : advancedFilter.type, status: advancedFilter.status === "all" ? undefined : advancedFilter.status, owner: advancedFilter.owner || undefined, dateField: advancedFilter.dateField, dateFrom: advancedFilter.dateFrom || undefined, dateTo: advancedFilter.dateTo || undefined });
        setFolderName(undefined);
        setTeamFolderId(null);
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
      setMarksTick((tick) => tick + 1);
    }
  }, [folderId, label, routeQuery, advancedFilter, filter]);

  useEffect(() => {
    let live = true;
    void (async () => {
      const [labels, shares] = await Promise.all([
        listWorkspaceLabels().catch(() => []),
        listSharedByMe().catch(() => []),
      ]);
      const attached = await Promise.all(labels.map((item) => listWorkspaceLabelResources(item.id).then((rows) => ({ item, rows })).catch(() => ({ item, rows: [] }))));
      if (!live) return;
      const nextLabels = new Map<string, { id: string; name: string; color: string }[]>();
      for (const { item, rows } of attached) {
        for (const row of rows) {
          const list = nextLabels.get(row.resourceId) ?? [];
          if (!list.some((entry) => entry.id === item.id)) list.push({ id: item.id, name: item.name, color: item.color });
          nextLabels.set(row.resourceId, list);
        }
      }
      const nextExpiry = new Map<string, string | null>();
      const now = Date.now();
      for (const share of shares) {
        if (!share.expiresAt) continue;
        const time = Date.parse(share.expiresAt);
        if (!Number.isFinite(time) || time > now) continue;
        const previous = nextExpiry.get(share.resourceId);
        if (!previous || Date.parse(previous) > time) nextExpiry.set(share.resourceId, new Date(time).toISOString());
      }
      setRowLabels(nextLabels);
      setRowExpiry(nextExpiry);
    })();
    return () => { live = false; };
  }, [marksTick]);

  useEffect(() => {
    const focusNewFolder = () => setNewFolderOpen(true);
    const kind = searchParams.get("new");
    if (kind === "folder") setNewFolderOpen(true);
    const refreshAfterCreation = () => { void load(); };
    window.addEventListener("workdrive:new-folder", focusNewFolder);
    window.addEventListener("workdrive:content-changed", refreshAfterCreation);
    return () => {
      window.removeEventListener("workdrive:new-folder", focusNewFolder);
      window.removeEventListener("workdrive:content-changed", refreshAfterCreation);
    };
  }, [searchParams, load]);

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

  // Personal view wins. Otherwise the organization default from Admin Console is applied.
  useEffect(() => {
    const storage = typeof window === "undefined" ? null : window.localStorage;
    const applyPolicy = () => {
      getWorkspacePolicy().then((policy) => {
        document.documentElement.style.setProperty("--wd-thumb-min", `${thumbnailMinPx(policy.thumbnailSize)}px`);
        if (!hasPersonalViewMode(storage)) setViewMode(viewModeFromOrgDefault(policy.defaultView));
      }).catch(() => undefined);
    };
    if (hasPersonalViewMode(storage)) setViewMode(readStoredViewMode(storage));
    applyPolicy();
    try {
      const storedColumns = window.localStorage.getItem("wd-file-columns");
      if (storedColumns) {
        const parsed = JSON.parse(storedColumns) as Partial<Record<ColumnKey, boolean>>;
        const keys: ColumnKey[] = ["lastModified", "timeCreated", "size", "type", "extension"];
        setColumnsState((current) => {
          const next = { ...current };
          for (const key of keys) if (typeof parsed[key] === "boolean") next[key] = parsed[key] as boolean;
          return next;
        });
      }
      const f = window.localStorage.getItem(FILTER_STORAGE_KEY);
      if (f === "folders" || f === "documents" || f === "sheets" || f === "slides" || f === "media" || f === "audio" || f === "archives" || f === "favorites" || f === "all") {
        setFilter(f);
      }
    } catch { /* noop */ }
    window.addEventListener("workdrive:workspace-policy", applyPolicy);
    return () => window.removeEventListener("workdrive:workspace-policy", applyPolicy);
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

  useEffect(() => {
    if (!openFileId) return;
    let cancelled = false;
    void (async () => {
      try {
        const detail = await getFileDetails(openFileId);
        if (cancelled || !detail) return;
        await onPreview("FILE", detail.id, detail.name, detail.mimeType ?? undefined, Number(detail.size ?? 0));
        router.replace("/files", { scroll: false });
      } catch { /* resource may no longer be accessible */ }
    })();
    return () => { cancelled = true; };
  }, [openFileId, router]);

  // Legacy quick-create / inline-search forms were purged (Zoho parity):
  // creation flows through the + New toolbar menu and header search.

  async function onDownload(fileId: string) {
    const result = await requestDownload(fileId);
    triggerDownload(result.download_url);
  }

  async function onDownloadMany(items: Array<{ type: "FILE" | "FOLDER"; id: string }>) {
    if (items.length === 0) return;
    if (items.length === 1 && items[0].type === "FILE") {
      await onDownload(items[0].id).catch(() => setToast(locale === "ar" ? "تعذر تنزيل الملف" : "Could not download the file"));
      return;
    }
    try {
      await downloadFilesArchive(items);
    } catch {
      setToast(locale === "ar" ? "تعذر إنشاء ملف التنزيل أو التحقق من سلامته" : "Could not create or verify the download archive");
    }
  }

  async function onPreview(type: "FILE" | "FOLDER", id: string, name: string, mimeType?: string, size?: number, panel?: "details" | "comments", commentId?: string | null) {
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
      panel,
      commentId,
    });
  }

  useEffect(() => {
    const fileId = searchParams.get("file");
    if (!fileId) return;
    const commentId = searchParams.get("comment");
    let cancelled = false;
    void getFileDetails(fileId).then((file) => {
      if (!cancelled) void onPreview("FILE", file.id, file.name, file.mimeType ?? undefined, file.size, commentId ? "comments" : undefined, commentId ?? undefined);
    }).catch(() => {
      if (!cancelled) void onPreview("FILE", fileId, "File", undefined, undefined, commentId ? "comments" : undefined, commentId ?? undefined);
    });
    return () => { cancelled = true; };
  }, [searchParams]);

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
    // Zoho WorkDrive opens Version History as a dedicated information surface
    // (General Info / Versions / Activity / Access Stats), not as a small drawer.
    router.push(`/files/details/${encodeURIComponent(id)}?tab=versions`);
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

  const handleInspect = useCallback(
    (type: "FILE" | "FOLDER", id: string) => {
      setSelectedIds(new Set([id]));
      if (type === "FOLDER") {
        const folder = filteredContents.folders.find((f) => f.id === id);
        if (folder) {
          select({ kind: "FOLDER", folder }, { open: true });
          setInspectorTab("details");
          setInspectorOpen(true);
          setMobileInspectorOpen(true);
        }
        return;
      }
      const file = filteredContents.files.find((f) => f.id === id);
      if (file) {
        select({ kind: "FILE", file }, { open: true });
        setInspectorTab("details");
        setInspectorOpen(true);
        setMobileInspectorOpen(true);
      }
    },
    [filteredContents.folders, filteredContents.files, select, setInspectorTab, setInspectorOpen, setMobileInspectorOpen],
  );

  useEffect(() => {
    if (!inspectorOpen) return;

    if (selectedIds.size === 1) {
      const id = Array.from(selectedIds)[0]!;
      const folder = filteredContents.folders.find((f) => f.id === id);
      if (folder) {
        if (inspectorSelected?.kind === "FOLDER" && inspectorSelected.folder.id === id) return;
        select({ kind: "FOLDER", folder }, { open: false });
        return;
      }
      const file = filteredContents.files.find((f) => f.id === id);
      if (file) {
        if (inspectorSelected?.kind === "FILE" && inspectorSelected.file.id === id) return;
        select({ kind: "FILE", file }, { open: false });
      }
      return;
    }

    if (selectedIds.size > 1 && inspectorSelected !== null) {
      select(null, { open: false });
    }
  }, [selectedIds, filteredContents, inspectorOpen, select, inspectorSelected]);

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

  const handleSelectionAction = useCallback((key: SelectionBarActionKey) => {
    const single = resolveSelectedResource(selectedIds, filteredContents.folders, filteredContents.files);
    const { fileIds, folderIds } = partitionSelection(selectedIds, filteredContents.folders, filteredContents.files);

    switch (key) {
      case "openNewTab":
        if (!single) {
          setToast(label("sel.singleItemRequired"));
          return;
        }
        openResourceInNewTab(single.type, single.id);
        return;
      case "share":
        if (single && canShare) openShare(single, "invite");
        return;
      case "copyPermalink":
        if (single && canShare) void copyShareLink(single);
        return;
      case "moveTo":
        if (!canMutate || !single) return;
        handleMove(single.type, single.id, single.name);
        return;
      case "copyTo":
        if (!canMutate || !single) return;
        setCopyTarget({ type: single.type, id: single.id, name: single.name });
        return;
      case "assignWorkflow":
        if (!canMutate || !single) return;
        setWorkflowTarget({ type: single.type, id: single.id, name: single.name });
        return;
      case "organize":
        if (!canMutate) return;
        setDataTemplateTargets([...filteredContents.folders.filter((f) => selectedIds.has(f.id)).map((f) => ({ type: "FOLDER" as const, id: f.id, name: f.name })), ...filteredContents.files.filter((f) => selectedIds.has(f.id)).map((f) => ({ type: "FILE" as const, id: f.id, name: f.name }))]);
        return;
      case "searchInFold": {
        const targetFolderId = single?.type === "FOLDER" ? single.id : folderId;
        const targetFolderName = single?.type === "FOLDER"
          ? single.name
          : (folderName ?? (locale === "ar" ? "المجلد الحالي" : "Current folder"));
        if (targetFolderId) {
          window.dispatchEvent(new CustomEvent("workdrive:search-in-folder", {
            detail: { folderId: targetFolderId, folderName: targetFolderName },
          }));
        }
        window.dispatchEvent(new CustomEvent("workdrive:focus-search"));
        return;
      }
      case "download":
        if (fileIds.length + folderIds.length === 0) {
          setToast(label("sel.noFilesSelected"));
          return;
        }
        void onDownloadMany([
          ...folderIds.map((id) => ({ type: "FOLDER" as const, id })),
          ...fileIds.map((id) => ({ type: "FILE" as const, id })),
        ]);
        return;
      case "rename":
        if (!canMutate || !single) return;
        setRenameTarget({ type: single.type, id: single.id, name: single.name });
        return;
      case "followUpdates":
        openFollowUpdates([...filteredContents.folders.filter((f) => selectedIds.has(f.id)).map((f) => ({ type: "FOLDER" as const, id: f.id, name: f.name })), ...filteredContents.files.filter((f) => selectedIds.has(f.id)).map((f) => ({ type: "FILE" as const, id: f.id, name: f.name }))]);
        return;
      case "moreOptions":
        if (!single) return;
        handleInspect(single.type, single.id);
        setInspectorTab("details");
        setInspectorOpen(true);
        setMobileInspectorOpen(true);
        return;
      case "moveToTrash":
        if (!canMutate) return;
        if (single && selectedIds.size === 1) {
          setDeleteTarget({ type: single.type, id: single.id });
          return;
        }
        if (selectedIds.size > 1) setBulkDeleteOpen(true);
        return;
      default:
        return;
    }
  }, [
    selectedIds,
    filteredContents.folders,
    filteredContents.files,
    canShare,
    canMutate,
    folderId,
    openShare,
    copyShareLink,
    openFollowUpdates,
    handleMove,
    handleInspect,
    setInspectorTab,
    setInspectorOpen,
    setMobileInspectorOpen,
    router,
    label,
  ]);

  useEffect(() => {
    const onControl = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string; isFinal?: boolean; checkedOutById?: string | null; checkedOutAt?: string | null; indexedAt?: string | null }>).detail;
      if (!detail?.id) return;
      setFiles((rows) => rows.map((row) => row.id === detail.id ? { ...row, isFinal: detail.isFinal, checkedOutById: detail.checkedOutById, checkedOutAt: detail.checkedOutAt, indexedAt: detail.indexedAt } : row));
    };
    window.addEventListener("workdrive:file-control", onControl);
    return () => window.removeEventListener("workdrive:file-control", onControl);
  }, []);

  const { requestConfirm, confirmModal } = useConfirmAction();
  const runControl = useCallback(async (id: string, action: FileControlAction) => {
    const ar = locale === "ar";
    const execute = async () => {
      try {
        const result = await runFileControl(id, action);
        setFiles((rows) => rows.map((row) => row.id === id ? { ...row, isFinal: result.isFinal, checkedOutById: result.checkedOutById, checkedOutAt: result.checkedOutAt, indexedAt: result.indexedAt } : row));
        const done = action === "check-out" ? (ar ? "تم سحب الملف" : "File checked out")
          : action === "check-in" ? (ar ? "تم إرجاع الملف" : "File checked in")
          : action === "mark-final" ? (ar ? "تم التعليم كمنتهٍ" : "Marked as final")
          : action === "enable-editing" ? (ar ? "تم تفعيل التعديل" : "Editing enabled")
          : (ar ? "تم تحديث فهرس البحث" : "Search index refreshed");
        setToast(done);
      } catch (error) {
        setToast(error instanceof Error ? error.message : (ar ? "تعذر تنفيذ الإجراء" : "Action failed"));
      }
    };
    if (action === "mark-final") {
      requestConfirm({ title: ar ? "تعليم كمنتهٍ" : "Mark as final", description: ar ? "تعليم هذا الملف كمنتهٍ؟ سيصبح للقراءة فقط." : "Mark this file as final? It will become read-only.", confirmLabel: ar ? "تعليم" : "Mark as final", tone: "primary", run: execute });
      return;
    }
    if (action === "enable-editing") {
      requestConfirm({ title: ar ? "تفعيل التعديل" : "Enable editing", description: ar ? "تفعيل التعديل لهذا الملف المنتهي؟" : "Enable editing for this final file?", confirmLabel: ar ? "تفعيل" : "Enable editing", tone: "primary", run: execute });
      return;
    }
    await execute();
  }, [locale, requestConfirm]);

  const singleId = selectedIds.size === 1 ? [...selectedIds][0] : undefined;
  const singleFolder = singleId ? folders.find((item) => item.id === singleId) : undefined;
  const singleFile = singleId && !singleFolder ? files.find((item) => item.id === singleId) : undefined;
  const singleExtra: FileActionHandlers | undefined = singleFolder ? {
    onOpen: () => handleOpen("FOLDER", singleFolder.id, singleFolder.name),
    onInspect: () => handleInspect("FOLDER", singleFolder.id),
    onLabels: () => setLabelTarget({ type: "FOLDER", id: singleFolder.id, name: singleFolder.name }),
    onClassify: () => setClassifyTarget({ type: "FOLDER", id: singleFolder.id, name: singleFolder.name }),
    onFavoriteToggle: () => { void handleFavorite("FOLDER", singleFolder.id); },
    onCopyLink: canShare ? () => { void copyShareLink({ type: "FOLDER", id: singleFolder.id }); } : undefined,
  } : singleFile ? {
    onOpen: () => handleOpen("FILE", singleFile.id, singleFile.name),
    onPreview: () => { void onPreview("FILE", singleFile.id, singleFile.name, singleFile.mimeType ?? undefined, singleFile.size ?? undefined); },
    onComment: () => { void onPreview("FILE", singleFile.id, singleFile.name, singleFile.mimeType ?? undefined, singleFile.size ?? undefined, "comments"); },
    onVersionHistory: () => { void onVersionHistory("FILE", singleFile.id, singleFile.name, singleFile.mimeType ?? undefined, singleFile.size ?? undefined); },
    onInspect: () => handleInspect("FILE", singleFile.id),
    onLabels: () => setLabelTarget({ type: "FILE", id: singleFile.id, name: singleFile.name }),
    onClassify: () => setClassifyTarget({ type: "FILE", id: singleFile.id, name: singleFile.name }),
    onFavoriteToggle: () => { void handleFavorite("FILE", singleFile.id); },
    onCopyLink: canShare ? () => { void copyShareLink({ type: "FILE", id: singleFile.id }); } : undefined,
    onReindex: () => { void runControl(singleFile.id, "reindex"); },
    onCheckOut: () => { void runControl(singleFile.id, "check-out"); },
    onCheckIn: () => { void runControl(singleFile.id, "check-in"); },
    onMarkFinal: () => { void runControl(singleFile.id, "mark-final"); },
    onEnableEditing: () => { void runControl(singleFile.id, "enable-editing"); },
    onOpenInOffice: officeEditorPath(singleFile.id, singleFile.name, singleFile.mimeType) ? () => {
      // Standard Office files open in Univer; native .imkan files stay on IMKAN Office.
      window.location.assign(officeEditorPath(singleFile.id, singleFile.name, singleFile.mimeType)!);
    } : undefined,
    onConvertToOffice: undefined, // IMKAN Office not activated — Univer is primary
  } : undefined;
  const singleControl: FileControlState | undefined = singleFile ? { status: singleFile.status, isFinal: singleFile.isFinal, checkedOutById: singleFile.checkedOutById } : undefined;

  return (
    <section className="wd-file-browser flex min-h-0 flex-1 flex-col w-full max-w-full overflow-x-hidden">
      <ShellScopeSync folderId={folderId} folderName={folderName} />
      <div className="flex min-w-0 flex-1 flex-col bg-white">
        {selectedIds.size === 0 ? (
          <ActionToolbar context={teamFolderId ? "teamFolder" : "files"} view={viewMode} onView={(v) => switchViewMode(v)} sortField={sortField} onSortField={setSortField} sortDir={sortDir} onSortDir={setSortDir} filter={filter} onFilter={setFilter} advancedFilter={advancedFilter} onAdvancedFilter={setAdvancedFilter} owners={owners} dataTemplates={dataTemplates} folders={folders} currentFolderId={folderId} onOpenFolder={handleOpenFolder} />
        ) : (
          <SelectionBar
            folderCount={folders.filter((f) => selectedIds.has(f.id)).length}
            fileCount={files.filter((f) => selectedIds.has(f.id)).length}
            singleSelected={selectedIds.size === 1}
            canMutate={canMutate}
            canShare={canShare}
            onShare={(mode) => {
              const target = resolveShareTarget(selectedIds, folders, files);
              if (target) {
                const folder = folders.find((f) => f.id === target.id);
                const file = files.find((f) => f.id === target.id);
                openShare({ ...target, name: folder?.name ?? file?.name ?? "" }, mode ?? "link");
              }
            }}
            onCopyLink={() => {
              const target = resolveShareTarget(selectedIds, folders, files);
              if (target) void copyShareLink(target);
            }}
            isFollowingSelected={(() => {
              if (selectedIds.size !== 1) return false;
              const id = Array.from(selectedIds)[0] ?? "";
              const folder = folders.find((f) => f.id === id);
              const file = files.find((f) => f.id === id);
              const type = folder ? "FOLDER" : file ? "FILE" : null;
              return type ? followIds.has(followResourceKey(type, id)) : false;
            })()}
            onDownload={() => {
              const { fileIds } = partitionSelection(selectedIds, folders, files);
              const folderIds = folders.filter((folder) => selectedIds.has(folder.id)).map((folder) => folder.id);
              if (fileIds.length + folderIds.length === 0) {
                setToast(label("sel.noFilesSelected"));
                return;
              }
              void onDownloadMany([
                ...folderIds.map((id) => ({ type: "FOLDER" as const, id })),
                ...fileIds.map((id) => ({ type: "FILE" as const, id })),
              ]);
            }}
            onAction={handleSelectionAction}
            extraHandlers={singleExtra}
            control={singleControl}
            menuResourceType={singleFolder ? "FOLDER" : singleFile ? "FILE" : undefined}
            menuFavorite={singleId ? favoriteIds.has(singleId) : false}
            onClear={() => setSelectedIds(new Set())}
          />
        )}
        {teamFolderId ? null : <Breadcrumbs folderId={searchActive ? undefined : folderId} folderName={searchActive ? undefined : folderName} />}

      {error ? <AlertBanner message={error} action={<button type="button" className="imkan-button-secondary" onClick={() => void load()}>{label("feedback.retry")}</button>} /> : null}

      {/* Active filter chips — always above the results section (not hidden underneath) */}
      {(filter !== "all" || advancedFilter.type !== "all" || advancedFilter.status !== "all" || advancedFilter.owner || advancedFilter.dateFrom || advancedFilter.dateTo || advancedFilter.dataTemplateId || routeQuery) ? (
        <div className="zoho-active-filters flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-3 py-2" style={{ position: "relative", zIndex: 5 }}>
          {routeQuery ? (
            <span className="wd-chip-btn is-active inline-flex items-center gap-1 text-[12px]">
              ⌕ {routeQuery}
              <button type="button" className="ms-1 opacity-70 hover:opacity-100" aria-label="Clear search" onClick={() => { const params = new URLSearchParams(searchParams.toString()); params.delete("query"); router.replace(params.toString() ? `?${params}` : "/files"); }}>×</button>
            </span>
          ) : null}
          {filter !== "all" ? (
            <span className="wd-chip-btn is-active inline-flex items-center gap-1 text-[12px]">
              {label(`filter.${filter}` as never)}
              <button type="button" className="ms-1 opacity-70 hover:opacity-100" aria-label="Clear filter" onClick={() => setFilter("all")}>×</button>
            </span>
          ) : null}
          {advancedFilter.type !== "all" ? (
            <span className="wd-chip-btn is-active inline-flex items-center gap-1 text-[12px]">
              type: {advancedFilter.type}
              <button type="button" className="ms-1 opacity-70 hover:opacity-100" onClick={() => setAdvancedFilter({ ...advancedFilter, type: "all" })}>×</button>
            </span>
          ) : null}
          {advancedFilter.status !== "all" ? (
            <span className="wd-chip-btn is-active inline-flex items-center gap-1 text-[12px]">
              {advancedFilter.status}
              <button type="button" className="ms-1 opacity-70 hover:opacity-100" onClick={() => setAdvancedFilter({ ...advancedFilter, status: "all" })}>×</button>
            </span>
          ) : null}
          {advancedFilter.owner ? (
            <span className="wd-chip-btn is-active inline-flex items-center gap-1 text-[12px]">
              owner
              <button type="button" className="ms-1 opacity-70 hover:opacity-100" onClick={() => setAdvancedFilter({ ...advancedFilter, owner: "" })}>×</button>
            </span>
          ) : null}
          {(advancedFilter.dateFrom || advancedFilter.dateTo) ? (
            <span className="wd-chip-btn is-active inline-flex items-center gap-1 text-[12px]">
              {advancedFilter.dateFrom || "…"} → {advancedFilter.dateTo || "…"}
              <button type="button" className="ms-1 opacity-70 hover:opacity-100" onClick={() => setAdvancedFilter({ ...advancedFilter, dateFrom: "", dateTo: "" })}>×</button>
            </span>
          ) : null}
          {advancedFilter.dataTemplateId ? (
            <span className="wd-chip-btn is-active inline-flex items-center gap-1 text-[12px]">
              template
              <button type="button" className="ms-1 opacity-70 hover:opacity-100" onClick={() => setAdvancedFilter({ ...advancedFilter, dataTemplateId: "", dataTemplateCriteria: [] })}>×</button>
            </span>
          ) : null}
          <button
            type="button"
            className="text-[12px] text-slate-500 underline-offset-2 hover:underline"
            onClick={() => {
              setFilter("all");
              setAdvancedFilter({ type: "all", status: "all", dateField: "modified", dateFrom: "", dateTo: "", owner: "", dataTemplateId: "", dataTemplateCriteria: [] });
              if (routeQuery) {
                const params = new URLSearchParams(searchParams.toString());
                params.delete("query");
                router.replace(params.toString() ? `?${params}` : "/files");
              }
            }}
          >
            {label("share.cancel") || "Clear all"}
          </button>
        </div>
      ) : null}

      <div className={`wd-file-browser-body min-h-0 flex-1 bg-white${viewMode === "index" ? " is-index-view" : ""}`}>
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
          onComment={(file) => void onPreview("FILE", file.id, file.name, file.mimeType ?? undefined, file.size ?? undefined, "comments")}
          onShare={(type, id, mode) => {
            const folder = filteredContents.folders.find((f) => f.id === id);
            const file = filteredContents.files.find((f) => f.id === id);
            openShare({ type, id, name: folder?.name ?? file?.name ?? "" }, mode ?? "link");
          }}
          onDownload={(fileId) => void onDownload(fileId)}
          onRename={(type, id, name) => setRenameTarget({ type, id, name })}
          onDelete={(type, id) => setDeleteTarget({ type, id })}
          onMove={(type, id, name) => setMoveTarget({ type, id, name })}
          onFavorite={handleFavorite}
          onVersionHistory={onVersionHistory}
          onInspect={handleInspect}
          favoriteIds={favoriteIds}
          canFavorite={true}
          onFileControl={(id, action) => { void runControl(id, action); }}
        />
      ) : (
        <FileTable
          folders={filteredContents.folders}
          files={filteredContents.files}
          canMutate={canMutate}
          canShare={canShare}
          folderSizes={folderSizes}
          folderUpdatedAt={folderUpdatedAt}
          onShare={(type, id, mode) => {
            const folder = filteredContents.folders.find((f) => f.id === id);
            const file = filteredContents.files.find((f) => f.id === id);
            openShare({ type, id, name: folder?.name ?? file?.name ?? "" }, mode ?? "link");
          }}
          onDownload={onDownload}
          onPreview={onPreview}
          onComment={(type, id, name, mimeType, size) => void onPreview(type, id, name, mimeType, size, "comments")}
          onVersionHistory={onVersionHistory}
          onOpen={handleOpen}
          onMove={handleMove}
          onCopy={(type, id, name) => setCopyTarget({ type, id, name })}
          onDropMove={(type, id, destinationFolderId) => { if (type === "FILE") void moveFile(id, destinationFolderId).then(load); else void moveFolder(id, destinationFolderId).then(load); }}
          onInspect={handleInspect}
          onRename={(type, id, name) => setRenameTarget({ type, id, name })}
          onDelete={(type, id) => setDeleteTarget({ type, id })}
          onFavorite={handleFavorite}
          favoriteIds={favoriteIds}
          onAssignWorkflow={(type,id,name)=>setWorkflowTarget({type,id,name})}
          onFollowUpdates={(type, id, name) => openFollowUpdates([{ type, id, name }])}
          onLabelAs={(type,id,name)=>setLabelTarget({type,id,name})}
          onClassifyAs={(type,id,name)=>setClassifyTarget({type,id,name})}
          onOrganize={(type,id)=>{ const item = type === "FILE" ? files.find(x=>x.id===id) : folders.find(x=>x.id===id); if (item) setDataTemplateTargets([{ type, id, name: item.name }]); }}
          followIds={followIds}
          onFileControl={(id, action) => { void runControl(id, action); }}
          workflowStatuses={workflowStatuses}
          rowLabels={rowLabels}
          rowExpiry={rowExpiry}
          onWorkflowStatusClick={(status, resourceName) => setWorkflowStatusTarget({ status, resourceName })}
          onDataTemplateBadgeClick={(type,id) => { handleInspect(type,id); setInspectorTab("dataTemplates"); setInspectorOpen(true); setMobileInspectorOpen(true); }}
          onCopyLink={(id) => {
            const target = folders.some((folder) => folder.id === id)
              ? { type: "FOLDER" as const, id }
              : files.some((file) => file.id === id)
                ? { type: "FILE" as const, id }
                : null;
            if (target) void copyShareLink(target);
          }}
          emptyTitle={searchActive ? label("files.searchEmpty") : filteredContents.folders.length + filteredContents.files.length === 0 && filter !== "all" ? label("files.searchEmpty") : label("empty.title")}
          emptyDescription={searchActive ? label("files.searchEmptyDescription") : filteredContents.folders.length + filteredContents.files.length === 0 && filter !== "all" ? label("files.searchEmptyDescription") : label("empty.subtitle")}
          emptyAction={searchActive || (filteredContents.folders.length + filteredContents.files.length === 0 && filter !== "all") ? undefined : <FolderEmptyState folderId={folderId} />}
          selectedIds={selectedIds}
          onSelectRow={handleSelectRow}
          onSelectAll={handleSelectAll}
          compact={viewMode === "compact"}
          indexMode={viewMode === "index"}
          sortField={sortField}
          sortDir={sortDir}
          onSortField={setSortField}
          onSortDir={setSortDir}
          columns={columns}
          onColumns={(next) => { setColumnsState(next); try { window.localStorage.setItem("wd-file-columns", JSON.stringify(next)); } catch { /* ignore quota */ } }}
        />
      )}
      </div>
      </div>

      {shareTarget ? (
        <ShareModal
          resourceType={shareTarget.type}
          resourceId={shareTarget.id}
          resourceName={shareTarget.name}
          launchMode={shareLaunchMode}
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
            setSelectedIds(new Set());
            await load();
          }}
        />
      ) : null}
      {bulkDeleteOpen ? (
        <DeleteModal
          onClose={() => setBulkDeleteOpen(false)}
          onConfirm={async () => {
            const { fileIds, folderIds } = partitionSelection(selectedIds, folders, files);
            if (fileIds.length) await bulkTrashFiles(fileIds);
            if (folderIds.length) await bulkTrashFolders(folderIds);
            setBulkDeleteOpen(false);
            setSelectedIds(new Set());
            await load();
          }}
        />
      ) : null}
      {moveTarget ? (
        <MoveModal
          resourceName={moveTarget.name}
          resourceType={moveTarget.type}
          resourceId={moveTarget.id}
          onClose={() => setMoveTarget(null)}
          onMove={async (destinationFolderId, templateId, customFields) => {
            if (moveTarget.type === "FOLDER") {
              await moveFolder(moveTarget.id, destinationFolderId, templateId, customFields);
            } else {
              await moveFile(moveTarget.id, destinationFolderId, templateId, customFields);
            }
            await load();
          }}
        />
      ) : null}
      {copyTarget ? (
        <MoveModal
          resourceName={copyTarget.name}
          resourceType={copyTarget.type}
          resourceId={copyTarget.id}
          mode="copy"
          onClose={() => setCopyTarget(null)}
          onMove={async (destinationFolderId, templateId, customFields) => {
            if (copyTarget.type === "FOLDER") {
              await copyFolder(copyTarget.id, destinationFolderId, templateId, customFields);
            } else {
              await copyFile(copyTarget.id, destinationFolderId, templateId, customFields);
            }
            // Copy is a successful content mutation; refresh the current view
            // before closing the modal so the new item is visible immediately.
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
          initialPanel={previewTarget.panel}
          focusCommentId={previewTarget.commentId}
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
    {workflowTarget ? <WorkflowPicker
      resourceType={workflowTarget.type}
      resourceId={workflowTarget.id}
      resourceName={workflowTarget.name}
      onClose={()=>setWorkflowTarget(null)}
      onStarted={() => {
        setToast(label("common.success"));
        void load();
      }}
    /> : null}
    {newFolderOpen ? (
      <Modal title={label("menu.newFolder")} onClose={() => setNewFolderOpen(false)}>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const name = newFolderName.trim();
            if (!name) return;
            const mandateValues = newFolderMandate ? newFolderFields : undefined;
            if (newFolderMandate) {
              const schema = resolveDataTemplateSchema(newFolderMandate);
              const missing = schema.filter((field) => field.required && (mandateValues?.[field.key] === undefined || mandateValues?.[field.key] === null || String(mandateValues?.[field.key]).trim() === ""));
              if (missing.length) { setError(`Required Data Template fields: ${missing.map((field) => field.label).join(", ")}`); return; }
            }
            await createFolder(name, folderId, newFolderMandate?.id, mandateValues);
            setNewFolderName(""); setNewFolderFields({}); setNewFolderMandate(null);
            setNewFolderOpen(false);
            await load();
          }}
          className="text-[length:var(--imkan-font-size-ui)]"
        >
          {newFolderMandateLoading ? <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">{label("common.loading")}</div> : null}
          {newFolderMandate ? <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50/60 p-3"><div className="text-[11px] font-semibold text-slate-800">{locale === "ar" ? "خصائص Data Template المطلوبة" : "Required Data Template properties"}</div><div className="mt-1 text-[10px] text-slate-500">{newFolderMandate.name}</div><div className="mt-3 space-y-2">{resolveDataTemplateSchema(newFolderMandate).map((field) => <label key={field.key} className="block text-[10px] text-slate-600">{field.label}{field.required ? " *" : ""}{field.type === "boolean" ? <input type="checkbox" checked={Boolean(newFolderFields[field.key])} onChange={(e)=>setNewFolderFields(v=>({...v,[field.key]:e.target.checked}))} className="ms-2" /> : field.type === "select" || field.type === "radio" ? <ImkanOptionPicker value={String(newFolderFields[field.key] ?? "")} onChange={(value)=>setNewFolderFields(v=>({...v,[field.key]:value}))} ariaLabel={field.label} fullWidth allowEmpty emptyLabel="—" className="mt-1" options={(field.options ?? []).map((o)=>({ value: o, label: o }))} /> : <input type={field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "datetime" ? "datetime-local" : field.type === "email" ? "email" : "text"} value={String(newFolderFields[field.key] ?? "")} onChange={(e)=>setNewFolderFields(v=>({...v,[field.key]:field.type === "number" ? Number(e.target.value) : e.target.value}))} className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-[11px]" />}</label>)}</div></div> : null}
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
    {followTargets?.length ? <FollowUpdatesModal targets={followTargets} onClose={() => setFollowTargets(null)} onChanged={(messageKey, name) => { refreshFollows(); if (messageKey && name) setToast(label(messageKey).replace("{name}", name)); else if (messageKey) setToast(label(messageKey).replace("{name}", followTargets[0]?.name ?? "")); }} /> : null}
    {labelTarget ? <LabelAssignmentModal target={labelTarget} onClose={()=>setLabelTarget(null)} onChanged={()=>void load()} /> : null}
    {classifyTarget ? <DlpClassifyModal target={classifyTarget} onClose={()=>setClassifyTarget(null)} onChanged={()=>void load()} /> : null}
    {dataTemplateTargets?.length ? <DataTemplateAssociationModal targets={dataTemplateTargets} dataTemplates={dataTemplates} onClose={() => setDataTemplateTargets(null)} onChanged={() => { void load(); }} /> : null}
    {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    {confirmModal}
    </section>
  );
}
