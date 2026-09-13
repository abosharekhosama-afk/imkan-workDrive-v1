"use client";

import { useLocale } from "./locale-provider";
import type { MessageKey } from "../i18n";
import { type FileActionId } from "./file-row-actions-logic";

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
  onToast?: (message: string) => void;
}

interface FileActionsMenuProps {
  /** Permission/ACL context resolved per row. */
  context: RowActionContext;
  /** Callbacks keyed by action; missing handlers are omitted from the menu. */
  handlers: FileActionHandlers;
  /** Optional client-side toast for Zoho parity actions without backend backing. */
  onToast?: (message: string) => void;
  /** Optional permalink copy shortcut used by "Copy Permalink". */
  onCopyLink?: () => void;
}

const ACTION_LABEL_KEYS: Record<string, MessageKey> = {
  open: "recent.open",
  preview: "files.preview",
  details: "files.details",
  download: "files.download",
  versions: "files.versionHistory",
  share: "files.share",
  rename: "files.rename",
  move: "files.move",
  favorite: "files.favorite",
  unfavorite: "files.unfavorite",
  delete: "files.delete",
};

/** First management action — a divider separates it from the open group. */
const EDIT_GROUP_START: FileActionId = "share";

/**
 * Unified row-level "⋯" actions menu mirroring the full Zoho WorkDrive
 * 5-section hierarchy: Open/Properties → Share (nested submenu) / Permalink
 * → Move/Copy/Workflow/Organize → Search/Download/Rename/Follow/More
 * → Move to Trash. Backend-less parity actions fall back to a toast so no
 * button ever appears dead; `handlers.onMove` doubles as the Copy To…
 * opener while `handlers.onCopy` (when present) takes precedence.
 */
export function FileActionsMenu({ context, handlers, onToast, onCopyLink }: FileActionsMenuProps) {
  const { label } = useLocale();
  const toast = (key: MessageKey) => (onToast ?? handlers.onToast)?.(label(key));
  const shareItems: ActionDropdownItem[] = [];
  if (handlers.onShare) {
    shareItems.push({ label: label("menu.addMembers"), onSelect: handlers.onShare });
  }
  shareItems.push({ label: label("menu.externalShareLink"), onSelect: handlers.onShare ?? (() => toast("menu.externalShareLink")) });
  shareItems.push({ label: label("menu.downloadLink"), onSelect: handlers.onShare ?? (() => toast("menu.downloadLink")) });
  shareItems.push({ label: label("menu.embedCode"), onSelect: handlers.onShare ?? (() => toast("menu.embedCode")) });
  shareItems.push({ label: label("menu.shareToSupport"), onSelect: () => toast("menu.shareToSupport") });

  const items: ActionDropdownItem[] = [];
  const push = (item: ActionDropdownItem) => items.push(item);

  if (handlers.onOpen) push({ label: label("menu.openNewTab"), onSelect: handlers.onOpen });
  if (handlers.onPreview && handlers.onPreview !== handlers.onOpen) {
    push({ label: label("files.preview"), onSelect: handlers.onPreview });
  }
  if (handlers.onViewDetails) push({ label: label("menu.properties"), onSelect: handlers.onViewDetails });

  if (handlers.onShare || handlers.onCopyLink || onCopyLink) {
    const shareTarget = handlers.onShare;
    push({
      label: label("menu.shareMenu"),
      onSelect: shareTarget ?? (() => toast("menu.shareMenu")),
      dividerBefore: items.length > 0,
      submenu: shareItems,
    });
    push({ label: label("menu.copyPermalink"), onSelect: handlers.onCopyLink ?? onCopyLink ?? (() => toast("menu.copyPermalink")) });
  } else if (context.canShare) {
    push({ label: label("menu.shareMenu"), onSelect: () => toast("menu.shareMenu"), dividerBefore: items.length > 0, submenu: shareItems });
  }

  const copyOpener = handlers.onCopy ?? handlers.onMove;
  if (handlers.onMove || handlers.onCopy) {
    push({ label: `${label("menu.moveTo")} (Z)`, onSelect: handlers.onMove ?? (() => toast("menu.moveTo")), dividerBefore: true });
    push({ label: `${label("menu.copyTo")} (C)`, onSelect: copyOpener ?? (() => toast("menu.copyTo")) });
  } else if (context.canMutate) {
    push({ label: `${label("menu.moveTo")} (Z)`, onSelect: () => toast("menu.moveTo"), dividerBefore: true });
    push({ label: `${label("menu.copyTo")} (C)`, onSelect: () => toast("menu.copyTo") });
  }
  push({ label: label("menu.assignWorkflow"), onSelect: () => toast("menu.assignWorkflow") });
  push({ label: label("menu.organize"), onSelect: () => toast("menu.organize") });

  push({ label: label("menu.searchInFold"), onSelect: () => toast("menu.searchInFold"), dividerBefore: true });
  if (handlers.onDownload) push({ label: `${label("menu.download")} (⌃S)`, onSelect: handlers.onDownload });
  if (handlers.onRename) push({ label: label("menu.rename"), onSelect: handlers.onRename });
  push({ label: label("menu.followUpdates"), onSelect: () => toast("menu.followUpdates") });
  if (handlers.onVersionHistory) {
    push({ label: label("files.versionHistory"), onSelect: handlers.onVersionHistory });
  }
  push({ label: label("menu.moreOptions"), onSelect: () => toast("menu.moreOptions") });

  if (handlers.onFavoriteToggle) {
    push({
      label: label(context.isFavorite ? "files.unfavorite" : "files.favorite"),
      onSelect: handlers.onFavoriteToggle,
    });
  }

  push({
    label: label("menu.moveToTrash"),
    onSelect: handlers.onDelete ?? (() => toast("menu.moveToTrash")),
    destructive: true,
    dividerBefore: true,
  });

  if (items.length === 0) return null;

  return <ActionDropdown label={label("files.actions")} items={items} />;
}

