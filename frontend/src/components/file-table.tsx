"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { ColumnKey, SortDir } from "./layout/action-toolbar";
import { Icons } from "./layout/icons";
import { useLocale } from "./locale-provider";
import { FileIcon } from "./file-icon";
import { FileActionsMenu } from "./file-actions-menu";
import { FileContextMenu } from "./file-context-menu";
import { EmptyState } from "./empty-state";
import type { FileRecord, FolderRecord } from "../lib/api/types";
import { formatBytes, resolveItemSize } from "../lib/api/quota";
import { formatDateLocalized, latestOf } from "../lib/localized";

function compareText(a: string, b: string, direction: "asc" | "desc") {
  const result = a.localeCompare(b);
  return direction === "asc" ? result : -result;
}

function compareNumbers(a: number | null | undefined, b: number | null | undefined, direction: "asc" | "desc") {
  const result = (a ?? 0) - (b ?? 0);
  return direction === "asc" ? result : -result;
}

function compareDates(a: string | null | undefined, b: string | null | undefined, direction: "asc" | "desc") {
  const result = new Date(a ?? 0).getTime() - new Date(b ?? 0).getTime();
  return direction === "asc" ? result : -result;
}

function getInitials(name: string | null | undefined, email: string | null | undefined): string {
  if (name) {
    return name.split(/\s+/).map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  }
  if (email) {
    return email.slice(0, 2).toUpperCase();
  }
  return "؟";
}

function OwnerCell({ ownerName, ownerEmail, ownerAvatar }: { ownerName?: string | null; ownerEmail?: string | null; ownerAvatar?: string | null }) {
  const initials = getInitials(ownerName, ownerEmail);
  const hasAvatar = ownerAvatar && ownerAvatar.length > 0;
  
  return (
    <div className="flex items-center gap-2">
      {hasAvatar ? (
        <img
          src={ownerAvatar}
          alt=""
          className="w-6 h-6 rounded-full object-cover"
        />
      ) : (
        <div className="w-6 h-6 rounded-full bg-[color:var(--imkan-color-primary)]/10 flex items-center justify-center text-[color:var(--imkan-color-primary)] text-xs font-medium">
          {initials}
        </div>
      )}
      <span className="truncate">{ownerName ?? ownerEmail ?? "—"}</span>
    </div>
  );
}

interface FileTableProps {
  folders: FolderRecord[];
  files: FileRecord[];
  canMutate?: boolean;
  canShare?: boolean;
  onShare: (resourceType: "FILE" | "FOLDER", resourceId: string) => void;
  onDownload: (fileId: string) => void;
  onRename: (resourceType: "FILE" | "FOLDER", resourceId: string, name: string) => void;
  onDelete: (resourceType: "FILE" | "FOLDER", resourceId: string) => void;
  onFavorite?: (resourceType: "FILE" | "FOLDER", resourceId: string) => void;
  favoriteIds?: Set<string>;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  selectedIds?: Set<string>;
  onSelectRow?: (id: string, isSelected: boolean) => void;
  onSelectAll?: (isSelected: boolean) => void;
  onPreview?: (resourceType: "FILE" | "FOLDER", resourceId: string, resourceName: string, mimeType?: string, size?: number) => void;
  onVersionHistory?: (resourceType: "FILE" | "FOLDER", resourceId: string, resourceName: string, mimeType?: string, size?: number) => void;
  onOpen?: (resourceType: "FILE" | "FOLDER", resourceId: string, resourceName: string) => void;
  onMove?: (resourceType: "FILE" | "FOLDER", resourceId: string, resourceName: string) => void;
  onDropMove?: (resourceType: "FILE" | "FOLDER", resourceId: string, destinationFolderId: string) => void;
  onCopyLink?: (id: string) => void;
  onViewDetails?: (resourceType: "FILE" | "FOLDER", resourceId: string, resourceName: string, mimeType?: string, size?: number) => void;
  /** Aggregate active-file byte size per listed folder (recursive). */
  folderSizes?: ReadonlyMap<string, number>;
  /** Latest contained-file updatedAt per listed folder (recursive). */
  folderUpdatedAt?: ReadonlyMap<string, string | null>;
  onToast?: (message: string) => void;
  compact?: boolean;
  /** Controlled table sorting (driven by the toolbar Sort-by popover). */
  sortField?: ColumnKey;
  sortDir?: SortDir;
  onSortField?: (k: ColumnKey) => void;
  onSortDir?: (d: SortDir) => void;
  columns?: Partial<Record<ColumnKey, boolean>>;
  onColumns?: (cols: Partial<Record<ColumnKey, boolean>>) => void;
}

export function FileTable({
  folders,
  files,
  canMutate = true,
  canShare = true,
  onShare,
  onDownload,
  onRename,
  onDelete,
  onFavorite,
  onPreview,
  onVersionHistory,
  onOpen,
  onMove,
  onDropMove,
    onCopyLink,
  onViewDetails,
  favoriteIds = new Set(),
  emptyTitle,
  emptyDescription,
  emptyAction,
  selectedIds = new Set(),
  onSelectRow,
  onSelectAll,
  folderSizes,
  folderUpdatedAt,
  onToast,
  compact = false,
  sortField, sortDir, onSortField, onSortDir, columns, onColumns,
}: FileTableProps) {
  const { label, locale } = useLocale();
  // Controlled sorting — driven by the toolbar Sort-by popover (sortField/sortDir)
  // when provided; falls back to internal state otherwise.
  const [sort, setSort] = useState<{ key: ColumnKey; direction: SortDir }>({ key: "name", direction: "asc" });
  useEffect(() => {
    if (sortField !== undefined && sortDir !== undefined) setSort({ key: sortField, direction: sortDir });
  }, [sortField, sortDir]);
  const toggleSort = (key: ColumnKey, dir?: SortDir) => {
    const direction = dir ?? (sort.key === key ? (sort.direction === "asc" ? "desc" : "asc") : "asc");
    setSort({ key, direction });
    onSortField?.(key);
    onSortDir?.(direction);
  };
  const extOf = (name: string) => { const i = name.lastIndexOf("."); return i > 0 && i < name.length - 1 ? name.slice(i + 1).toLowerCase() : ""; };
  const folderDate = (id: string) => latestOf(folders.find((f) => f.id === id)?.updatedAt, folderUpdatedAt?.get(id) ?? undefined);
  const colOn = (k: ColumnKey) => columns?.[k] ?? (k === "lastModified" || k === "size" || k === "name");
  const sortedFolders = useMemo(() => {
    const k = sort.key; const d = sort.direction;
    return [...folders].sort((a, b) => {
      if (k === "lastModified") return compareDates(folderSizes ? folderDate(a.id) : a.updatedAt, folderSizes ? folderDate(b.id) : b.updatedAt, d);
      if (k === "size") return compareNumbers(folderSizes?.get(a.id), folderSizes?.get(b.id), d);
      if (k === "timeCreated") return compareDates(a.updatedAt, b.updatedAt, d);
      if (k === "extension") return compareText(extOf(a.name), extOf(b.name), d);
      return compareText(a.name, b.name, d);
    });
  }, [folders, sort, folderSizes, folderUpdatedAt]);
  const sortedFiles = useMemo(() => {
    const k = sort.key; const d = sort.direction;
    return [...files].sort((a, b) => {
      if (k === "size") return compareNumbers(a.size, b.size, d);
      if (k === "lastModified") return compareDates(a.updatedAt, b.updatedAt, d);
      if (k === "timeCreated") return compareDates(a.updatedAt, b.updatedAt, d);
      if (k === "extension") return compareText(extOf(a.name), extOf(b.name), d);
      if (k === "type") return compareText(a.mimeType ?? "", b.mimeType ?? "", d);
      return compareText(a.name, b.name, d);
    });
  }, [files, sort]);
  const formatDate = (value?: string | null) => formatDateLocalized(value, locale);
  const formatSize = (value?: number | null) => formatBytes(value ?? 0);

  // Right-click context menu state (portal-hosted, positioned at cursor).
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; node: ReactNode } | null>(null);

  // Visible ids in render order (folders then files) → supports Shift+Click ranges.
  const visibleIds = useMemo(
    () => [...sortedFolders.map((f) => f.id), ...sortedFiles.map((f) => f.id)],
    [sortedFolders, sortedFiles]
  );
  const rangeAnchorRef = useRef<string | null>(null);

  const handleRowSelect = (id: string, checked: boolean, shiftKey: boolean) => {
    if (shiftKey && rangeAnchorRef.current) {
      const a = visibleIds.indexOf(rangeAnchorRef.current);
      const b = visibleIds.indexOf(id);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        for (let k = lo; k <= hi; k++) onSelectRow?.(visibleIds[k], checked);
      }
    } else {
      onSelectRow?.(id, checked);
    }
    if (checked) rangeAnchorRef.current = id;
  };

  if (folders.length === 0 && files.length === 0) {
    return <EmptyState title={emptyTitle?? label("files.empty")} description={emptyDescription} action={emptyAction} />;
  }

  return (
    <div className="relative w-full max-w-full overflow-x-hidden">
      <div className="overflow-x-auto w-full max-w-full">
        <table className="imkan-table min-w-[42rem] w-full table-auto">
          <thead>
          <tr className="wd-list-head">
            <th scope="col" className="w-10 ps-[13px] text-start font-medium">
              <input
                type="checkbox"
                className="wd-check"
                onChange={(e) => onSelectAll?.(e.target.checked)}
              />
            </th>
            <th scope="col" className="px-3 text-start font-medium"><button type="button" className="imkan-focusable rounded-[16px] px-3 py-2.5" onClick={() => toggleSort("name")}>{label("files.column.name")} {sort.key === "name" ? (sort.direction === "asc" ? "↑" : "↓") : "↑"}</button></th>
            <th scope="col" className="px-3 text-start font-medium"><button type="button" className="imkan-focusable rounded-[16px] px-3 py-2.5" onClick={() => toggleSort("lastModified")}>{label("files.column.modified")} {sort.key === "lastModified" ? (sort.direction === "asc" ? "↑" : "↓") : "↓"}</button></th>
            {colOn("timeCreated") ? <th scope="col" className="px-3 text-start font-medium">{label("column.timeCreated")}</th> : null}
            <th scope="col" className="px-3 text-start font-medium"><button type="button" className="imkan-focusable rounded-[16px] px-3 py-2.5" onClick={() => toggleSort("size")}>{label("files.column.size")} {sort.key === "size" ? (sort.direction === "asc" ? "↑" : "↓") : ""}</button></th>
            {colOn("type") ? <th scope="col" className="px-3 text-start font-medium">{label("files.column.type")}</th> : null}
            {colOn("extension") ? <th scope="col" className="px-3 text-start font-medium">{label("files.column.extension")}</th> : null}
            <th scope="col" className="px-4 text-end font-medium">
              {onColumns ? <ColumnsPlusBtn columns={columns ?? {}} onChange={onColumns} label={label} /> : <span className="sr-only">{label("files.actions")}</span>}
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedFolders.map((folder) => (
            <tr key={folder.id} draggable={Boolean(canMutate)} onDoubleClick={() => onOpen?.("FOLDER", folder.id, folder.name)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, node: (<FileContextMenu
              handlers={{
                onOpen: onOpen ? () => onOpen("FOLDER", folder.id, folder.name) : undefined,
                onShare: canShare ? () => onShare("FOLDER", folder.id) : undefined,
                onRename: canMutate ? () => onRename("FOLDER", folder.id, folder.name) : undefined,
                onMove: onMove && canMutate ? () => onMove("FOLDER", folder.id, folder.name) : undefined,
                onFavoriteToggle: onFavorite ? () => onFavorite("FOLDER", folder.id) : undefined,
                onViewDetails: onViewDetails ? () => onViewDetails("FOLDER", folder.id, folder.name) : undefined,
                onDelete: canMutate ? () => onDelete("FOLDER", folder.id) : undefined,
              }}
              onCopyLink={onCopyLink ? () => onCopyLink(folder.id) : undefined}
              onToast={onToast}
              x={e.clientX} y={e.clientY} onClose={() => setCtxMenu(null)}
            />)});             }} onDragStart={(e) => { e.dataTransfer.effectAllowed="move"; e.dataTransfer.setData("application/x-workdrive", JSON.stringify({type:"FOLDER",id:folder.id,name:folder.name})); }} className="wd-list-row group cursor-grab" data-compact={compact || undefined} data-selected={selectedIds.has(folder.id) || undefined} onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("ring-2","ring-[var(--wd-primary)]"); }} onDragLeave={(e) => e.currentTarget.classList.remove("ring-2","ring-[var(--wd-primary)]")} onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove("ring-2","ring-[var(--wd-primary)]"); try { const item=JSON.parse(e.dataTransfer.getData("application/x-workdrive")); if(item.id !== folder.id) onDropMove?.(item.type,item.id,folder.id); } catch {} }}>
              <td className="ps-[13px]">
                <input
                  type="checkbox"
                  className="wd-check"
                  checked={selectedIds.has(folder.id)}
                  onChange={(e) => handleRowSelect(folder.id, e.target.checked, false)}
                  onClick={(e) => handleRowSelect(folder.id, (e.currentTarget as HTMLInputElement).checked, e.shiftKey)}
                />
              </td>
              <td className="max-w-[18rem] truncate px-2">
                <Link href={`/files/${folder.id}`} className="imkan-focusable inline-flex max-w-full items-center gap-4 truncate rounded-sm">
                  <FileIcon kind="folder" label={label("files.type.folder")} />
                  <span className="min-w-0 truncate">
                    <span className="wd-list-name block truncate">{folder.name}</span>
                    <span className="wd-list-meta block truncate">{label("files.uploadedBy").replace("{name}", folder.ownerName ?? folder.ownerEmail ?? label("files.type.folder"))}</span>
                  </span>
                </Link>
              </td>
              <td className="wd-list-meta whitespace-nowrap px-3">{folder.ownerName ? label("files.modifiedByLine").replace("{date}", formatDate(folderDate(folder.id))).replace("{name}", folder.ownerName) : formatDate(folderDate(folder.id))}</td>
              {colOn("timeCreated") ? <td className="wd-list-meta whitespace-nowrap px-3">{"–"}</td> : null}
              <td className="wd-list-meta whitespace-nowrap px-3">{folderSizes?.get(folder.id) ? formatSize(folderSizes.get(folder.id)) : "–"}</td>
              {colOn("type") ? <td className="wd-list-meta whitespace-nowrap px-3">{label("files.type.folder")}</td> : null}
              {colOn("extension") ? <td className="wd-list-meta whitespace-nowrap px-3">{"–"}</td> : null}
              <td className="px-3 py-2 text-end">
                <FileActionsMenu
                  context={{
                    resourceType: "FOLDER",
                    canMutate,
                    canShare,
                    canFavorite: onFavorite != null,
                    isFavorite: favoriteIds.has(folder.id),
                  }}
                  handlers={{
                    onOpen: onOpen ? () => onOpen("FOLDER", folder.id, folder.name) : undefined,
                    onShare: canShare ? () => onShare("FOLDER", folder.id) : undefined,
                    onRename: canMutate ? () => onRename("FOLDER", folder.id, folder.name) : undefined,
                    onMove: onMove && canMutate ? () => onMove("FOLDER", folder.id, folder.name) : undefined,
                    onFavoriteToggle: onFavorite ? () => onFavorite("FOLDER", folder.id) : undefined,
                    onViewDetails: onViewDetails ? () => onViewDetails("FOLDER", folder.id, folder.name) : undefined,
                    onDelete: canMutate ? () => onDelete("FOLDER", folder.id) : undefined,
                  }}
                />
              </td>
            </tr>
          ))}
          {sortedFiles.map((file) => (
            <tr key={file.id} draggable={Boolean(canMutate)} onDragStart={(e) => { e.dataTransfer.effectAllowed="move"; e.dataTransfer.setData("application/x-workdrive", JSON.stringify({type:"FILE",id:file.id,name:file.name})); }} onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, node: (<FileContextMenu
              onToast={onToast}
              handlers={{ onOpen: onOpen ? () => onOpen("FILE", file.id, file.name) : undefined, onPreview: onPreview ? () => onPreview("FILE", file.id, file.name, file.mimeType ?? undefined, file.size ?? undefined) : undefined, onDownload: () => onDownload(file.id), onShare: canShare ? () => onShare("FILE", file.id) : undefined, onRename: canMutate ? () => onRename("FILE", file.id, file.name) : undefined, onMove: onMove && canMutate ? () => onMove("FILE", file.id, file.name) : undefined, onFavoriteToggle: onFavorite ? () => onFavorite("FILE", file.id) : undefined, onVersionHistory: onVersionHistory ? () => onVersionHistory("FILE", file.id, file.name, file.mimeType ?? undefined, file.size ?? undefined) : undefined, onDelete: canMutate ? () => onDelete("FILE", file.id) : undefined }}
              onCopyLink={onCopyLink ? () => onCopyLink(file.id) : undefined}
              x={e.clientX} y={e.clientY} onClose={() => setCtxMenu(null)}
            />)}); }} className="wd-list-row group relative cursor-grab active:cursor-grabbing" data-compact={compact || undefined} data-selected={selectedIds.has(file.id) || undefined}>
              <td className="ps-[13px]">
                <input
                  type="checkbox"
                  className="wd-check"
                  checked={selectedIds.has(file.id)}
                  onChange={(e) => handleRowSelect(file.id, e.target.checked, false)}
                  onClick={(e) => handleRowSelect(file.id, (e.currentTarget as HTMLInputElement).checked, e.shiftKey)}
                />
              </td>
              <td className="max-w-[18rem] truncate px-2">
                <button type="button" onClick={() => onPreview?.("FILE", file.id, file.name, file.mimeType ?? undefined, file.size ?? undefined)} className="imkan-focusable inline-flex max-w-full items-center gap-4 truncate rounded-sm text-start hover:underline">
                  <FileIcon kind="file" mimeType={file.mimeType} name={file.name} label={label("files.type.file")} />
                  <span className="min-w-0 truncate">
                    <span className="wd-list-name block truncate">{file.name}</span>
                    <span className="wd-list-meta block truncate">{label("files.uploadedBy").replace("{name}", file.ownerName ?? file.ownerEmail ?? label("files.type.file"))}</span>
                  </span>
                </button>
              </td>
              <td className="wd-list-meta whitespace-nowrap px-3">{file.ownerName ? label("files.modifiedByLine").replace("{date}", formatDate(file.updatedAt)).replace("{name}", file.ownerName) : formatDate(file.updatedAt)}</td>
              {colOn("timeCreated") ? <td className="wd-list-meta whitespace-nowrap px-3">{formatDate(file.updatedAt)}</td> : null}
              <td className="wd-list-meta whitespace-nowrap px-3">{file.size != null ? formatSize(file.size) : "–"}</td>
              {colOn("type") ? <td className="wd-list-meta whitespace-nowrap px-3">{label("files.type.file")}</td> : null}
              {colOn("extension") ? <td className="wd-list-meta whitespace-nowrap px-3">{extOf(file.name) ? extOf(file.name) : "–"}</td> : null}
              <td className="px-3 py-2 text-end">
                <FileActionsMenu
                  context={{
                    resourceType: "FILE",
                    canMutate,
                    canShare,
                    canFavorite: onFavorite != null,
                    isFavorite: favoriteIds.has(file.id),
                  }}
                  handlers={{
                    onOpen: onOpen ? () => onOpen("FILE", file.id, file.name) : undefined,
                    onPreview: onPreview ? () => onPreview("FILE", file.id, file.name, file.mimeType ?? undefined, file.size ?? undefined) : undefined,
                    onViewDetails: onViewDetails ? () => onViewDetails("FILE", file.id, file.name, file.mimeType ?? undefined, file.size ?? undefined) : undefined,
                    onDownload: () => onDownload(file.id),
                    onShare: canShare ? () => onShare("FILE", file.id) : undefined,
                    onRename: canMutate ? () => onRename("FILE", file.id, file.name) : undefined,
                    onMove: onMove && canMutate ? () => onMove("FILE", file.id, file.name) : undefined,
                    onFavoriteToggle: onFavorite ? () => onFavorite("FILE", file.id) : undefined,
                    onVersionHistory: onVersionHistory ? () => onVersionHistory("FILE", file.id, file.name, file.mimeType ?? undefined, file.size ?? undefined) : undefined,
                    onDelete: canMutate ? () => onDelete("FILE", file.id) : undefined,
                  }}
                />
              </td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>
      {ctxMenu ? ctxMenu.node : null}
    </div>
  );
}

// Local column definitions mirror the toolbar's (name locked, others toggleable).
const COLUMN_DEFS: Array<[ColumnKey, string, boolean]> = [
  ["name", "files.column.name", true],
  ["lastModified", "files.column.modified", true],
  ["timeCreated", "column.timeCreated", false],
  ["size", "files.column.size", true],
  ["type", "files.column.type", false],
  ["extension", "files.column.extension", false],
];

function ColumnsPlusBtn({ columns, onChange, label }: {
  columns: Partial<Record<ColumnKey, boolean>>;
  onChange: (cols: Partial<Record<ColumnKey, boolean>>) => void;
  label: (k: never) => string;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const posElRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Position the popover under the "+" button; listeners confined to useEffect
  // with cleanup + dependency array (no global-re-render event dispatch).
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = anchorRef.current?.getBoundingClientRect();
      if (!r) return;
      const w = 240;
      let left = r.right - w;
      left = Math.min(Math.max(8, left), window.innerWidth - w - 8);
      setPos({ top: r.bottom + 4, left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t)) return;
      if (posElRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const isOn = (k: ColumnKey) => columns[k] ?? (k === "lastModified" || k === "size" || k === "name");

  return (
    <>
      <button ref={anchorRef} type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu"
        title={label("manage.columns" as never)} aria-label={label("manage.columns" as never)}
        className={`flex h-6 w-6 translate-y-[2px] items-center justify-center rounded-full border border-slate-200 bg-white text-[color:var(--wd-primary)] transition-colors ${open ? "bg-[var(--wd-active)]" : "hover:bg-[var(--wd-primary-light)]"}`}>
        <Icons.plus size={14} />
      </button>
      {open && pos ? createPortal(
        <div ref={posElRef} style={{ position: "fixed", top: pos.top, left: pos.left, width: 240 }}
          className="z-[95] rounded-[var(--wd-menu-radius)] border border-slate-200/80 bg-white p-1.5 shadow-[var(--wd-menu-shadow)]" role="menu" aria-label={label("manage.columns" as never)}>
          <div className="mb-1 px-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label("manage.columns" as never)}</div>
          <div className="flex flex-col gap-0.5">
            {COLUMN_DEFS.map(([key, keyName, locked]) => {
              const active = isOn(key);
              return (
                <button key={key} type="button" disabled={locked} onClick={() => { if (!locked) onChange({ ...columns, [key]: !isOn(key) }); }}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] text-start ${locked ? "cursor-not-allowed opacity-70" : "text-slate-600 hover:bg-slate-50"}`}>
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border ${active ? "border-[color:var(--wd-primary)] bg-[color:var(--wd-primary)] text-white" : "border-slate-300 bg-white"}`}>
                    {active ? <Icons.check size={10} /> : null}
                  </span>
                  <span className={locked ? "font-medium text-slate-500" : ""}>{label(keyName as never)}</span>
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      ) : null}
    </>
  );
}
