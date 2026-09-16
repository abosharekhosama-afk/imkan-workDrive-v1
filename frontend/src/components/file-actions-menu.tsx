"use client";

import { useLocale } from "./locale-provider";

import { ActionDropdown, type ActionDropdownItem } from "./action-dropdown";
import type { RowActionContext } from "./file-row-actions-logic";

export interface FileActionHandlers {
  onOpen?: () => void;
  onPreview?: () => void;
  onViewDetails?: () => void;
  onDownload?: () => void;
  onShare?: () => void;
  onCopyLink?: () => void;
  onRename?: () => void;
  onMove?: () => void;
  onCopy?: () => void;
  onFavoriteToggle?: () => void;
  onVersionHistory?: () => void;
  onDelete?: () => void;
  onAssignWorkflow?: () => void;
}

interface FileActionsMenuProps {
  /** Permission/ACL context resolved per row. */
  context: RowActionContext;
  /** Callbacks keyed by action; missing handlers are omitted from the menu. */
  handlers: FileActionHandlers;
  /** Optional client-side toast for Zoho parity actions without backend backing. */
  /** Optional permalink copy shortcut used by "Copy Permalink". */
  onCopyLink?: () => void;
}


/**
 * Unified row-level "⋯" actions menu mirroring the full Zoho WorkDrive
 * 5-section hierarchy: Open/Properties → Share (nested submenu) / Permalink
 * → Move/Copy/Workflow/Organize → Search/Download/Rename/Follow/More
 * → Move to Trash. Copy and move are separate callbacks so each action
 * reaches its own destination picker and backend endpoint.
 */
export function FileActionsMenu({ context, handlers, onCopyLink }: FileActionsMenuProps) {
  const { label } = useLocale();
  const items: ActionDropdownItem[] = [];
  const push = (item: ActionDropdownItem) => items.push(item);

  if (handlers.onOpen) push({ label: label("menu.openNewTab"), onSelect: handlers.onOpen });
  if (handlers.onPreview && handlers.onPreview !== handlers.onOpen) {
    push({ label: label("files.preview"), onSelect: handlers.onPreview });
  }
  if (handlers.onViewDetails) push({ label: label("menu.properties"), onSelect: handlers.onViewDetails });

  if (handlers.onShare) {
    push({ label: label("menu.shareMenu"), onSelect: handlers.onShare, dividerBefore: items.length > 0 });
  }
  if (handlers.onCopyLink || onCopyLink) push({ label: label("menu.copyPermalink"), onSelect: handlers.onCopyLink ?? onCopyLink! });

  if (handlers.onMove) push({ label: `${label("menu.moveTo")} (Z)`, onSelect: handlers.onMove, dividerBefore: true });
  if (handlers.onCopy) push({ label: `${label("menu.copyTo")} (C)`, onSelect: handlers.onCopy });
  if (handlers.onAssignWorkflow) push({ label: label("menu.assignWorkflow"), onSelect: handlers.onAssignWorkflow });

  if (handlers.onDownload) push({ label: `${label("menu.download")} (⌃S)`, onSelect: handlers.onDownload, dividerBefore: true });
  if (handlers.onRename) push({ label: label("menu.rename"), onSelect: handlers.onRename });
  if (handlers.onVersionHistory) {
    push({ label: label("files.versionHistory"), onSelect: handlers.onVersionHistory });
  }

  if (handlers.onFavoriteToggle) {
    push({
      label: label(context.isFavorite ? "files.unfavorite" : "files.favorite"),
      onSelect: handlers.onFavoriteToggle,
    });
  }

  if (handlers.onDelete) push({
    label: label("menu.moveToTrash"),
    onSelect: handlers.onDelete,
    destructive: true,
    dividerBefore: true,
  });
  if (items.length === 0) return null;

  return <ActionDropdown label={label("files.actions")} items={items} />;
}

