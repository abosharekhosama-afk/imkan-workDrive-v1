"use client";

import { useLocale } from "./locale-provider";

import { ActionDropdown, type ActionDropdownItem } from "./action-dropdown";
import type { RowActionContext } from "./file-row-actions-logic";
import { followUpdatesMenuLabel } from "../lib/follow-updates-logic";
import { FileMenuIcons } from "../lib/file-menu-icons";

import type { ShareLaunchMode } from "../lib/share-launch-logic";

export interface FileActionHandlers {
  onOpen?: () => void;
  onPreview?: () => void;
  onInspect?: () => void;
  onDownload?: () => void;
  onShare?: (mode?: ShareLaunchMode) => void;
  onCopyLink?: () => void;
  onRename?: () => void;
  onMove?: () => void;
  onCopy?: () => void;
  onFavoriteToggle?: () => void;
  onOrganize?: () => void;
  onLabelAs?: () => void;
  onFollowUpdates?: () => void;
  isFollowingUpdates?: boolean;
  isFavorite?: boolean;
  onVersionHistory?: () => void;
  onComment?: () => void;
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
 * 5-section hierarchy: Open → Share (nested submenu) / Permalink
 * → Move/Copy/Workflow/Organize → Search/Download/Rename/Follow/More
 * → Move to Trash. Copy and move are separate callbacks so each action
 * reaches its own destination picker and backend endpoint.
 */
export function FileActionsMenu({ context, handlers, onCopyLink }: FileActionsMenuProps) {
  const { label } = useLocale();
  const items: ActionDropdownItem[] = [];
  const push = (item: ActionDropdownItem) => items.push(item);

  if (handlers.onOpen) push({ label: label("menu.openNewTab"), icon: FileMenuIcons.openNewTab, onSelect: handlers.onOpen });
  if (handlers.onPreview && handlers.onPreview !== handlers.onOpen) {
    push({ label: label("files.preview"), icon: FileMenuIcons.preview, onSelect: handlers.onPreview });
  }
  if (handlers.onInspect) push({ label: label("menu.properties"), icon: FileMenuIcons.properties, onSelect: handlers.onInspect });
  if (handlers.onShare) {
    push({ label: label("menu.shareMenu"), icon: FileMenuIcons.shareMenu, onSelect: handlers.onShare, dividerBefore: items.length > 0 });
  }
  if (handlers.onCopyLink || onCopyLink) push({ label: label("menu.copyPermalink"), icon: FileMenuIcons.copyPermalink, onSelect: handlers.onCopyLink ?? onCopyLink! });

  if (handlers.onMove) push({ label: `${label("menu.moveTo")} (Z)`, icon: FileMenuIcons.moveTo, onSelect: handlers.onMove, dividerBefore: true });
  if (handlers.onCopy) push({ label: `${label("menu.copyTo")} (C)`, icon: FileMenuIcons.copyTo, onSelect: handlers.onCopy });
  if (handlers.onAssignWorkflow) push({ label: label("menu.assignWorkflow"), icon: FileMenuIcons.assignWorkflow, onSelect: handlers.onAssignWorkflow });
  const organizeItems: ActionDropdownItem[] = [];
  if (handlers.onFavoriteToggle) organizeItems.push({ label: label(context.isFavorite ? "files.unfavorite" : "files.favorite"), icon: context.isFavorite ? FileMenuIcons.unfavorite : FileMenuIcons.favorite, onSelect: handlers.onFavoriteToggle });
  if (handlers.onLabelAs) organizeItems.push({ label: label("nav.labels"), icon: FileMenuIcons.organize, onSelect: handlers.onLabelAs });
  if (handlers.onOrganize) organizeItems.push({ label: label("menu.associateDataTemplate"), icon: FileMenuIcons.organize, onSelect: handlers.onOrganize });
  if (organizeItems.length) push({ label: label("menu.organize"), icon: FileMenuIcons.organize, submenu: organizeItems });

  if (handlers.onDownload) push({ label: `${label("menu.download")} (⌃S)`, icon: FileMenuIcons.download, onSelect: handlers.onDownload, dividerBefore: true });
  if (handlers.onRename) push({ label: label("menu.rename"), icon: FileMenuIcons.rename, onSelect: handlers.onRename });
  if (handlers.onFollowUpdates) {
    push({
      label: label(followUpdatesMenuLabel(Boolean(handlers.isFollowingUpdates))),
      icon: handlers.isFollowingUpdates ? FileMenuIcons.unfollowUpdates : FileMenuIcons.followUpdates,
      onSelect: handlers.onFollowUpdates,
    });
  }
  if (handlers.onVersionHistory) {
    push({ label: label("files.versionHistory"), icon: FileMenuIcons.versionHistory, onSelect: handlers.onVersionHistory });
  }
  if (handlers.onComment) {
    push({
      label: label("menu.moreOptions"),
      icon: FileMenuIcons.moreOptions,
      submenu: [{ label: label("menu.addComment"), icon: FileMenuIcons.comment, onSelect: handlers.onComment }],
    });
  }


  if (handlers.onDelete) push({
    label: label("menu.moveToTrash"),
    icon: FileMenuIcons.moveToTrash,
    onSelect: handlers.onDelete,
    destructive: true,
    dividerBefore: true,
  });
  if (items.length === 0) return null;

  return <ActionDropdown label={label("files.actions")} items={items} />;
}

