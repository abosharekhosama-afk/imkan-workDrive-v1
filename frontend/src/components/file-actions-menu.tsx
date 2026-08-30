"use client";

import { useLocale } from "./locale-provider";
import type { MessageKey } from "../i18n";
import { ActionDropdown, type ActionDropdownItem } from "./action-dropdown";
import {
  buildFileRowActions,
  type FileActionId,
  type RowActionContext,
} from "./file-row-actions-logic";

export interface FileActionHandlers {
  onOpen?: () => void;
  onPreview?: () => void;
  onViewDetails?: () => void;
  onDownload?: () => void;
  onShare?: () => void;
  onRename?: () => void;
  onMove?: () => void;
  onFavoriteToggle?: () => void;
  onVersionHistory?: () => void;
  onDelete?: () => void;
}

interface FileActionsMenuProps {
  /** Permission/ACL context resolved per row. */
  context: RowActionContext;
  /** Callbacks keyed by action; missing handlers are omitted from the menu. */
  handlers: FileActionHandlers;
}

const ACTION_LABEL_KEYS: Record<FileActionId, MessageKey> = {
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
 * Unified row-level "⋯" actions menu. The visible action set is derived from
 * {@link buildFileRowActions} (share permission + ACL gates), so VIEW-only
 * recipients never see rename/move/delete while owners/editors do. Actions
 * without a handler are omitted, letting each view specialize the menu.
 */
export function FileActionsMenu({ context, handlers }: FileActionsMenuProps) {
  const { label } = useLocale();

  const handlerById: Record<FileActionId, (() => void) | undefined> = {
    open: handlers.onOpen,
    preview: handlers.onPreview,
    details: handlers.onViewDetails,
    download: handlers.onDownload,
    versions: handlers.onVersionHistory,
    share: handlers.onShare,
    rename: handlers.onRename,
    move: handlers.onMove,
    favorite: handlers.onFavoriteToggle,
    unfavorite: handlers.onFavoriteToggle,
    delete: handlers.onDelete,
  };

  const items: ActionDropdownItem[] = [];
  for (const id of buildFileRowActions(context)) {
    const onSelect = handlerById[id];
    if (!onSelect) continue;
    items.push({
      label: label(ACTION_LABEL_KEYS[id]),
      onSelect,
      destructive: id === "delete",
      dividerBefore: id === EDIT_GROUP_START,
    });
  }

  if (items.length === 0) return null;

  return <ActionDropdown label={label("files.actions")} items={items} />;
}

