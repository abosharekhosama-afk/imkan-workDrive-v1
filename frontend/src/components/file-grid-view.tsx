"use client";

import { useLocale } from"./locale-provider";
import { FileIcon } from"./file-icon";
import { OwnerCell } from"./owner-cell";
import { FileActionsMenu } from"./file-actions-menu";
import type { FileActionHandlers } from"./file-actions-menu";
import type { RowActionContext } from"./file-row-actions-logic";
import { formatBytes, resolveItemSize } from"../lib/api/quota";
import { formatDateLocalized, latestOf } from"../lib/localized";
import type { FileRecord, FolderRecord } from"../lib/api/types";

export interface FileGridViewProps {
  folders: FolderRecord[];
  files: FileRecord[];
  canMutate?: boolean;
  canShare?: boolean;
  onOpenFolder: (folderId: string) => void;
  onPreview?: (file: FileRecord) => void;
  onShare?: (resourceType:"FILE"|"FOLDER", resourceId: string) => void;
  onDownload?: (fileId: string) => void;
  onRename?: (resourceType:"FILE"|"FOLDER", resourceId: string, name: string) => void;
  onDelete?: (resourceType:"FILE"|"FOLDER", resourceId: string) => void;
  onMove?: (resourceType:"FILE"|"FOLDER", resourceId: string, name: string) => void;
  onFavorite?: (resourceType:"FILE"|"FOLDER", resourceId: string) => void;
  onVersionHistory?: (resourceType:"FILE"|"FOLDER", resourceId: string, name: string) => void;
  onViewDetails?: (resourceType:"FILE"|"FOLDER", resourceId: string, name: string) => void;
  favoriteIds?: Set<string>;
  canFavorite?: boolean;
  folderSizes?: ReadonlyMap<string, number>;
  folderUpdatedAt?: ReadonlyMap<string, string | null>;
}
function buildFolderContext(canMutate: boolean, canShare: boolean): RowActionContext {
  return { resourceType:"FOLDER", canMutate, canShare, canFavorite: false, isFavorite: false };
}

function buildFileContext(
  fileId: string,
  canMutate: boolean,
  canShare: boolean,
  canFavorite: boolean,
  favoriteIds: Set<string> | undefined,
): RowActionContext {
  return {
    resourceType:"FILE",
    canMutate,
    canShare,
    canFavorite,
    isFavorite: favoriteIds?.has(fileId) ?? false,
  };
}

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
  onMove,
  onFavorite,
  onVersionHistory,
  onViewDetails,
  favoriteIds,
  canFavorite = false,
  folderSizes,
  folderUpdatedAt,
}: FileGridViewProps) {
  const { label, locale } = useLocale();
  const formatDate = (value?: string | null) => formatDateLocalized(value, locale);
  const folderDate = (id: string) =>
    latestOf(folders.find((f) => f.id === id)?.updatedAt, folderUpdatedAt?.get(id) ?? undefined);
  const folderSize = (id: string) => {
    const size = folderSizes?.get(id);
    return size != null && size > 0
      ? formatBytes(size)
      : label("files.itemsCount").replace("{count}", String(folders.find((f) => f.id === id)?.itemCount ?? 0));
  };

  return (
    <div className="zoho-grid-view"role="list"aria-label={label("view.grid")}>
      {folders.map((folder) => {
        const folderContext = buildFolderContext(canMutate, canShare);
        const folderHandlers: FileActionHandlers = {
          onOpen: () => onOpenFolder(folder.id),
          onShare: onShare ? () => onShare("FOLDER", folder.id) : undefined,
          onRename: canMutate && onRename ? () => onRename("FOLDER", folder.id, folder.name) : undefined,
          onMove: canMutate && onMove ? () => onMove("FOLDER", folder.id, folder.name) : undefined,
          onViewDetails: onViewDetails ? () => onViewDetails("FOLDER", folder.id, folder.name) : undefined,
          onDelete: canMutate && onDelete ? () => onDelete("FOLDER", folder.id) : undefined,
        };
        return (
          <div key={folder.id} role="listitem"className="zoho-grid-card">
            <button type="button"className="zoho-grid-main"onClick={() => onOpenFolder(folder.id)}>
              <FileIcon kind="folder"mimeType={null} name={folder.name} label={label("files.type.folder")} />
              <span className="zoho-grid-name"title={folder.name}>{folder.name}</span>
            </button>
            <div className="zoho-grid-meta">
              <OwnerCell name={folder.ownerName} email={folder.ownerEmail} avatarUrl={folder.ownerAvatar} compact />
              <span className="zoho-grid-size">{folderSize(folder.id)}</span>
              <span className="zoho-grid-date">{formatDate(folderDate(folder.id))}</span>
            </div>
            <div className="zoho-grid-actions">
              <FileActionsMenu context={folderContext} handlers={folderHandlers} />
            </div>
          </div>
        );
      })}
      {files.map((file) => {
        const fileContext = buildFileContext(file.id, canMutate, canShare, canFavorite, favoriteIds);
        const fileHandlers: FileActionHandlers = {
          onOpen: onPreview ? () => onPreview(file) : undefined,
          onPreview: onPreview ? () => onPreview(file) : undefined,
          onViewDetails: onViewDetails ? () => onViewDetails("FILE", file.id, file.name) : undefined,
          onDownload: onDownload ? () => onDownload(file.id) : undefined,
          onShare: onShare ? () => onShare("FILE", file.id) : undefined,
          onRename: canMutate && onRename ? () => onRename("FILE", file.id, file.name) : undefined,
          onMove: canMutate && onMove ? () => onMove("FILE", file.id, file.name) : undefined,
          onFavoriteToggle: canFavorite && onFavorite ? () => onFavorite("FILE", file.id) : undefined,
          onVersionHistory: onVersionHistory ? () => onVersionHistory("FILE", file.id, file.name) : undefined,
          onDelete: canMutate && onDelete ? () => onDelete("FILE", file.id) : undefined,
        };
        return (
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
              <span className="zoho-grid-size">{formatBytes(resolveItemSize(file) ?? 0)}</span>
              <span className="zoho-grid-date">{formatDate(file.updatedAt)}</span>
            </div>
            <div className="zoho-grid-actions">
              <FileActionsMenu context={fileContext} handlers={fileHandlers} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
