"use client";

import { useLocale } from "./locale-provider";
import { FileIcon } from "./file-icon";
import { OwnerCell } from "./owner-cell";
import { ActionDropdown } from "./action-dropdown";
import { formatBytes } from "../lib/api/quota";
import { formatDateLocalized, latestOf } from "../lib/localized";
import type { FileRecord, FolderRecord } from "../lib/api/types";

export interface FileGridViewProps {
  folders: FolderRecord[];
  files: FileRecord[];
  canMutate?: boolean;
  canShare?: boolean;
  onOpenFolder: (folderId: string) => void;
  onPreview?: (file: FileRecord) => void;
  onShare?: (resourceType: "FILE" | "FOLDER", resourceId: string) => void;
  onDownload?: (fileId: string) => void;
  onRename?: (resourceType: "FILE" | "FOLDER", resourceId: string, name: string) => void;
  onDelete?: (resourceType: "FILE" | "FOLDER", resourceId: string) => void;
  /** Aggregate active-file byte size per listed folder (recursive). */
  folderSizes?: ReadonlyMap<string, number>;
  /** Latest contained-file updatedAt per listed folder (recursive). */
  folderUpdatedAt?: ReadonlyMap<string, string | null>;
}

/**
 * Grid mode of the dual view — Zoho-style responsive cards with a hover
 * quick-actions menu mirroring the table's context actions.
 */
export function FileGridView({
  folders,
  files,
  canMutate = true,
  canShare = true,
  onOpenFolder,
  onPreview,
  onShare,
  onDownload,
  onRename,
  onDelete,
  folderSizes,
  folderUpdatedAt,
}: FileGridViewProps) {
  const { label, locale } = useLocale();
  const formatDate = (value?: string | null) => formatDateLocalized(value, locale);
  const folderDate = (id: string) => latestOf(folders.find((f) => f.id === id)?.updatedAt, folderUpdatedAt?.get(id) ?? undefined);
  const folderSize = (id: string) => {
    const size = folderSizes?.get(id);
    return size == null || size === 0 ? "—" : formatBytes(size);
  };

  return (
    <div className="zoho-grid-view" role="list" aria-label={label("view.grid")}>
      {folders.map((folder) => (
        <div key={folder.id} role="listitem" className="zoho-grid-card">
          <button type="button" className="zoho-grid-main" onClick={() => onOpenFolder(folder.id)}>
            <FileIcon kind="folder" mimeType={null} name={folder.name} label={label("files.type.folder")} />
            <span className="zoho-grid-name" title={folder.name}>{folder.name}</span>
          </button>
          <div className="zoho-grid-meta">
            <OwnerCell name={folder.ownerName} email={folder.ownerEmail} avatarUrl={folder.ownerAvatar} compact />
            <span className="zoho-grid-size">{folderSize(folder.id)}</span>
            <span className="zoho-grid-date">{formatDate(folderDate(folder.id))}</span>
          </div>
          <div className="zoho-grid-actions">
            <ActionDropdown
              label={label("files.actions")}
              items={[
                ...(onShare ? [{ label: label("files.share"), onSelect: () => onShare("FOLDER", folder.id) }] : []),
                ...(canMutate && onRename ? [{ label: label("files.rename"), onSelect: () => onRename("FOLDER", folder.id, folder.name) }] : []),
                ...(canMutate && onDelete
                  ? [{ label: label("files.delete"), onSelect: () => onDelete("FOLDER", folder.id), destructive: true }]
                  : []),
              ]}
            />
          </div>
        </div>
      ))}
      {files.map((file) => (
        <div key={file.id} role="listitem" className="zoho-grid-card">
          <button
            type="button"
            className="zoho-grid-main"
            onClick={() => onPreview?.(file)}
            title={onPreview ? label("files.preview") : undefined}
          >
            <FileIcon kind="file" mimeType={file.mimeType} name={file.name} label={label("files.type.file")} />
            <span className="zoho-grid-name" title={file.name}>{file.name}</span>
          </button>
          <div className="zoho-grid-meta">
            <OwnerCell name={file.ownerName} email={file.ownerEmail} avatarUrl={file.ownerAvatar} compact />
            <span className="zoho-grid-size">{formatBytes(file.size)}</span>
            <span className="zoho-grid-date">{formatDate(file.updatedAt)}</span>
          </div>
          <div className="zoho-grid-actions">
            <ActionDropdown
              label={label("files.actions")}
              items={[
                ...(onPreview ? [{ label: label("files.preview"), onSelect: () => onPreview(file) }] : []),
                ...(onShare ? [{ label: label("files.share"), onSelect: () => onShare("FILE", file.id) }] : []),
                ...(onDownload ? [{ label: label("files.download"), onSelect: () => onDownload(file.id) }] : []),
                ...(canMutate && onRename ? [{ label: label("files.rename"), onSelect: () => onRename("FILE", file.id, file.name) }] : []),
                ...(canMutate && onDelete
                  ? [{ label: label("files.delete"), onSelect: () => onDelete("FILE", file.id), destructive: true }]
                  : []),
              ]}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
