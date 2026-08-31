"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useLocale } from "./locale-provider";
import { FileIcon } from "./file-icon";
import { FileActionsMenu } from "./file-actions-menu";
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
  selectedIds?: Set<string>;
  onSelectRow?: (id: string, isSelected: boolean) => void;
  onSelectAll?: (isSelected: boolean) => void;
  onPreview?: (resourceType: "FILE" | "FOLDER", resourceId: string, resourceName: string, mimeType?: string, size?: number) => void;
  onVersionHistory?: (resourceType: "FILE" | "FOLDER", resourceId: string, resourceName: string, mimeType?: string, size?: number) => void;
  onOpen?: (resourceType: "FILE" | "FOLDER", resourceId: string, resourceName: string) => void;
  onMove?: (resourceType: "FILE" | "FOLDER", resourceId: string, resourceName: string) => void;
  onDropMove?: (resourceType: "FILE" | "FOLDER", resourceId: string, destinationFolderId: string) => void;
  onViewDetails?: (resourceType: "FILE" | "FOLDER", resourceId: string, resourceName: string, mimeType?: string, size?: number) => void;
  /** Aggregate active-file byte size per listed folder (recursive). */
  folderSizes?: ReadonlyMap<string, number>;
  /** Latest contained-file updatedAt per listed folder (recursive). */
  folderUpdatedAt?: ReadonlyMap<string, string | null>;
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
  onViewDetails,
  favoriteIds = new Set(),
  emptyTitle,
  emptyDescription,
  selectedIds = new Set(),
  onSelectRow,
  onSelectAll,
  folderSizes,
  folderUpdatedAt,
}: FileTableProps) {
  const { label, locale } = useLocale();
  const [sort, setSort] = useState<{ key: "name" | "modified" | "size"; direction: "asc" | "desc" }>({ key: "name", direction: "asc" });
  const toggleSort = (key: "name" | "modified" | "size") => setSort((current) => current.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" });
  const folderDate = (id: string) => latestOf(folders.find((f) => f.id === id)?.updatedAt, folderUpdatedAt?.get(id) ?? undefined);
  const sortedFolders = useMemo(() => [...folders].sort((a, b) => sort.key === "modified" ? compareDates(folderSizes ? folderDate(a.id) : a.updatedAt, folderSizes ? folderDate(b.id) : b.updatedAt, sort.direction) : sort.key === "size" ? compareNumbers(folderSizes?.get(a.id), folderSizes?.get(b.id), sort.direction) : compareText(a.name, b.name, sort.direction)), [folders, sort, folderSizes, folderUpdatedAt]);
  const sortedFiles = useMemo(() => [...files].sort((a, b) => sort.key === "size" ? compareNumbers(a.size, b.size, sort.direction) : sort.key === "modified" ? compareDates(a.updatedAt, b.updatedAt, sort.direction) : compareText(a.name, b.name, sort.direction)), [files, sort]);
  const formatDate = (value?: string | null) => formatDateLocalized(value, locale);
  const formatSize = (value?: number | null) => formatBytes(value ?? 0);

  if (folders.length === 0 && files.length === 0) {
    return <EmptyState title={emptyTitle?? label("files.empty")} description={emptyDescription} />;
  }

  return (
    <div className="relative">
      <div className="overflow-x-auto">
        <table className="imkan-table min-w-[42rem] w-full table-auto">
          <thead>
          <tr className="imkan-table-row">
            <th scope="col" className="px-3 py-2 text-start font-medium w-10">
              <input
                type="checkbox"
                className="imkan-checkbox"
                onChange={(e) => onSelectAll?.(e.target.checked)}
              />
            </th>
            <th scope="col" className="px-3 py-2 text-start font-medium"><button type="button" className="imkan-focusable rounded-sm" onClick={() => toggleSort("name")}>{label("files.column.name")} {sort.key === "name" ? (sort.direction === "asc" ? "↑" : "↓") : ""}</button></th>
            <th scope="col" className="px-3 py-2 text-start font-medium">{label("files.column.type")}</th>
            <th scope="col" className="px-3 py-2 text-start font-medium">{label("files.column.owner")}</th>
            <th scope="col" className="px-3 py-2 text-start font-medium"><button type="button" className="imkan-focusable rounded-sm" onClick={() => toggleSort("modified")}>{label("files.column.modified")} {sort.key === "modified" ? (sort.direction === "asc" ? "↑" : "↓") : ""}</button></th>
            <th scope="col" className="px-3 py-2 text-start font-medium"><button type="button" className="imkan-focusable rounded-sm" onClick={() => toggleSort("size")}>{label("files.column.size")} {sort.key === "size" ? (sort.direction === "asc" ? "↑" : "↓") : ""}</button></th>
            <th scope="col" className="px-3 py-2 text-end font-medium"><span className="sr-only">{label("files.actions")}</span></th>
          </tr>
        </thead>
        <tbody>
          {sortedFolders.map((folder) => (
            <tr key={folder.id} draggable={Boolean(canMutate)} onDragStart={(e) => { e.dataTransfer.effectAllowed="move"; e.dataTransfer.setData("application/x-workdrive", JSON.stringify({type:"FOLDER",id:folder.id,name:folder.name})); }} className="imkan-table-row hover:bg-[color:var(--imkan-color-surface)] group transition-colors cursor-grab" onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("ring-2","ring-[color:var(--imkan-color-primary)]"); }} onDragLeave={(e) => e.currentTarget.classList.remove("ring-2","ring-[color:var(--imkan-color-primary)]")} onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove("ring-2","ring-[color:var(--imkan-color-primary)]"); try { const item=JSON.parse(e.dataTransfer.getData("application/x-workdrive")); if(item.id !== folder.id) onDropMove?.(item.type,item.id,folder.id); } catch {} }}>
              <td className="px-3 py-2">
                <input
                  type="checkbox"
                  className="imkan-checkbox"
                  checked={selectedIds.has(folder.id)}
                  onChange={(e) => onSelectRow?.(folder.id, e.target.checked)}
                />
              </td>
              <td className="max-w-[18rem] truncate px-3 py-2">
                <Link href={`/files/${folder.id}`} className="imkan-focusable inline-flex max-w-full items-center truncate rounded-sm">
                  <FileIcon kind="folder" label={label("files.type.folder")} />
                  <span className="truncate">{folder.name}</span>
                </Link>
              </td>
              <td className="px-3 py-2">{label("files.type.folder")}</td>
              <td className="px-3 py-2">
                <OwnerCell ownerName={folder.ownerName} ownerEmail={folder.ownerEmail} ownerAvatar={folder.ownerAvatar} />
              </td>
              <td className="imkan-muted px-3 py-2 text-[length:var(--imkan-font-size-secondary)]">{formatDate(folderDate(folder.id))}</td>
              <td className="imkan-muted px-3 py-2 text-[length:var(--imkan-font-size-secondary)]">{folderSizes?.get(folder.id) != null && (folderSizes.get(folder.id) ?? 0) > 0 ? formatBytes(folderSizes.get(folder.id)) : "—"}</td>
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
                    onDelete: canMutate ? () => onDelete("FOLDER", folder.id) : undefined,
                  }}
                />
              </td>
            </tr>
          ))}
          {sortedFiles.map((file) => (
            <tr key={file.id} draggable={Boolean(canMutate)} onDragStart={(e) => { e.dataTransfer.effectAllowed="move"; e.dataTransfer.setData("application/x-workdrive", JSON.stringify({type:"FILE",id:file.id,name:file.name})); }} className="imkan-table-row hover:bg-[color:var(--imkan-color-surface)] group cursor-grab active:cursor-grabbing">
              <td className="px-3 py-2">
                <input
                  type="checkbox"
                  className="imkan-checkbox"
                  checked={selectedIds.has(file.id)}
                  onChange={(e) => onSelectRow?.(file.id, e.target.checked)}
                />
              </td>
              <td className="max-w-[18rem] truncate px-3 py-2">
                <button type="button" onClick={() => onPreview?.("FILE", file.id, file.name, file.mimeType ?? undefined, file.size ?? undefined)} className="imkan-focusable inline-flex max-w-full items-center truncate rounded-sm text-start hover:underline">
                  <FileIcon kind="file" mimeType={file.mimeType} name={file.name} label={label("files.type.file")} />
                  <span className="truncate">{file.name}</span>
                </button>
              </td>
              <td className="px-3 py-2">{label("files.type.file")}</td>
              <td className="px-3 py-2">
                <OwnerCell ownerName={file.ownerName} ownerEmail={file.ownerEmail} ownerAvatar={file.ownerAvatar} />
              </td>
              <td className="imkan-muted px-3 py-2 text-[length:var(--imkan-font-size-secondary)]">{formatDate(file.updatedAt)}</td>
              <td className="imkan-muted px-3 py-2 text-[length:var(--imkan-font-size-secondary)]">{formatSize(resolveItemSize(file))}</td>
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
    </div>
  );
}
