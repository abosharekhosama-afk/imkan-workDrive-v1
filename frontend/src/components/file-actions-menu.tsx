"use client";

import type { ReactNode } from "react";
import { useLocale } from "./locale-provider";
import { ActionDropdown, type ActionDropdownItem } from "./action-dropdown";
import type { RowActionContext } from "./file-row-actions-logic";
import { followUpdatesMenuLabel } from "../lib/follow-updates-logic";
import { FileMenuIcons } from "../lib/file-menu-icons";
import type { ShareLaunchMode } from "../lib/share-launch-logic";
import { fileControlFromRecord } from "../lib/file-control-logic";

export interface FileActionHandlers {
  onOpen?: () => void;
  onPreview?: () => void;
  onOpenInOffice?: () => void;
  onConvertToOffice?: () => void;
  onReindex?: () => void;
  onCheckOut?: () => void;
  onCheckIn?: () => void;
  onMarkFinal?: () => void;
  onEnableEditing?: () => void;
  onInspect?: () => void;
  onDownload?: () => void;
  onShare?: (mode?: ShareLaunchMode) => void;
  onCopyLink?: () => void;
  onRename?: () => void;
  onMove?: () => void;
  onCopy?: () => void;
  onFavoriteToggle?: () => void;
  onOrganize?: () => void;
  onFollowUpdates?: () => void;
  isFollowingUpdates?: boolean;
  isFavorite?: boolean;
  onVersionHistory?: () => void;
  onComment?: () => void;
  onDelete?: () => void;
  onAssignWorkflow?: () => void;
  /** Optional organize submenu targets (Zoho-style secondary panel). */
  onLabels?: () => void;
  onCreateShortcut?: () => void;
  onSearchInFolder?: () => void;
  onSaveAsTemplate?: () => void;
}

/** Normalized lock / final state for Zoho-parity menu visibility. */
export type FileControlState = {
  /** CHECKED_OUT | FINAL | ACTIVE | unknown */
  status?: string | null;
  isFinal?: boolean | null;
  checkedOutById?: string | null;
};

export function normalizeFileControlStatus(status?: string | null): "CHECKED_OUT" | "FINAL" | "ACTIVE" {
  const s = String(status ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (s === "CHECKED_OUT" || s === "CHECKOUT" || s === "LOCKED") return "CHECKED_OUT";
  if (s === "FINAL" || s === "MARKED_FINAL" || s === "READONLY" || s === "READ_ONLY") return "FINAL";
  return "ACTIVE";
}

/**
 * Apply Zoho-style mutual exclusion for check-in/out and mark-final/enable-editing.
 * Callers may still pass all four handlers; visibility is decided here from status.
 */
export function resolveControlHandlers(
  handlers: FileActionHandlers,
  control?: FileControlState,
): Pick<FileActionHandlers, "onCheckOut" | "onCheckIn" | "onMarkFinal" | "onEnableEditing" | "onReindex"> {
  const state = fileControlFromRecord(control);
  return {
    onReindex: handlers.onReindex,
    onCheckOut: state === "ACTIVE" ? handlers.onCheckOut : undefined,
    onCheckIn: state === "CHECKED_OUT" ? handlers.onCheckIn : undefined,
    onMarkFinal: state === "ACTIVE" || state === "CHECKED_OUT" ? handlers.onMarkFinal : undefined,
    onEnableEditing: state === "FINAL" ? handlers.onEnableEditing : undefined,
  };
}

interface FileActionsMenuProps {
  context: RowActionContext;
  handlers: FileActionHandlers;
  onCopyLink?: () => void;
  /** When provided, drives Check-in/out and Mark final visibility (Zoho parity). */
  control?: FileControlState;
  /** Custom trigger. The row icon is used when this is omitted. */
  trigger?: ReactNode;
  /** Stacking level. Preview sits above the page, so it passes a higher value. */
  zIndex?: number;
}

/** Shared item builder so row menu, context menu, toolbar, and preview stay aligned. */
export function buildUnifiedFileActionItems(opts: {
  label: (key: string) => string;
  context: RowActionContext;
  handlers: FileActionHandlers;
  onCopyLink?: () => void;
  control?: FileControlState;
}): ActionDropdownItem[] {
  const { label, context, handlers, onCopyLink } = opts;
  const control = resolveControlHandlers(handlers, opts.control);
  const items: ActionDropdownItem[] = [];
  const push = (item: ActionDropdownItem) => items.push(item);

  // —— Open section ——
  if (handlers.onOpen) push({ label: label("menu.openNewTab"), icon: FileMenuIcons.openNewTab, onSelect: handlers.onOpen });
  if (handlers.onPreview && handlers.onPreview !== handlers.onOpen) {
    push({ label: label("files.preview"), icon: FileMenuIcons.preview, onSelect: handlers.onPreview });
  }
  if (handlers.onOpenInOffice) push({ label: label("menu.openInOffice"), icon: FileMenuIcons.openNewTab, onSelect: handlers.onOpenInOffice });
  if (handlers.onConvertToOffice) push({ label: label("menu.convertToOffice"), icon: FileMenuIcons.openNewTab, onSelect: handlers.onConvertToOffice });

  // —— Collaboration controls (status-aware) ——
  const controlItems: ActionDropdownItem[] = [];
  if (control.onCheckOut) controlItems.push({ label: label("menu.checkOut"), icon: FileMenuIcons.organize, onSelect: control.onCheckOut });
  if (control.onCheckIn) controlItems.push({ label: label("menu.checkIn"), icon: FileMenuIcons.organize, onSelect: control.onCheckIn });
  if (control.onMarkFinal) controlItems.push({ label: label("menu.markAsFinal"), icon: FileMenuIcons.organize, onSelect: control.onMarkFinal });
  if (control.onEnableEditing) controlItems.push({ label: label("menu.enableEditing"), icon: FileMenuIcons.organize, onSelect: control.onEnableEditing });
  if (control.onReindex) controlItems.push({ label: label("menu.reindex"), icon: FileMenuIcons.organize, onSelect: control.onReindex });
  controlItems.forEach((item, i) => push({ ...item, dividerBefore: i === 0 && items.length > 0 }));

  if (handlers.onInspect) push({ label: label("menu.properties"), icon: FileMenuIcons.properties, onSelect: handlers.onInspect, dividerBefore: controlItems.length === 0 && items.length > 0 });

  // —— Share ——
  if (handlers.onShare) {
    push({
      label: label("menu.shareMenu"),
      icon: FileMenuIcons.shareMenu,
      onSelect: handlers.onShare,
      dividerBefore: items.length > 0,
      submenu: [
        { label: label("menu.shareMenu"), icon: FileMenuIcons.shareMenu, onSelect: () => handlers.onShare?.() },
        ...(handlers.onCopyLink || onCopyLink
          ? [{ label: label("menu.copyPermalink"), icon: FileMenuIcons.copyPermalink, onSelect: (handlers.onCopyLink ?? onCopyLink)! }]
          : []),
      ],
    });
  } else if (handlers.onCopyLink || onCopyLink) {
    push({ label: label("menu.copyPermalink"), icon: FileMenuIcons.copyPermalink, onSelect: handlers.onCopyLink ?? onCopyLink!, dividerBefore: items.length > 0 });
  }

  // —— Move / Copy / Workflow / Organize (submenu) ——
  if (handlers.onMove) push({ label: label("menu.moveTo"), icon: FileMenuIcons.moveTo, onSelect: handlers.onMove, dividerBefore: true });
  if (handlers.onCopy) push({ label: label("menu.copyTo"), icon: FileMenuIcons.copyTo, onSelect: handlers.onCopy });
  if (handlers.onSaveAsTemplate) push({ label: label("menu.saveAsTemplate"), icon: FileMenuIcons.organize, onSelect: handlers.onSaveAsTemplate });
  if (handlers.onAssignWorkflow) push({ label: label("menu.assignWorkflow"), icon: FileMenuIcons.assignWorkflow, onSelect: handlers.onAssignWorkflow });

  if (handlers.onOrganize || handlers.onLabels || handlers.onCreateShortcut || handlers.onInspect) {
    const organizeSub: ActionDropdownItem[] = [];
    if (handlers.onOrganize) organizeSub.push({ label: label("menu.organize"), icon: FileMenuIcons.organize, onSelect: handlers.onOrganize });
    if (handlers.onLabels) organizeSub.push({ label: label("menu.labels"), icon: FileMenuIcons.organize, onSelect: handlers.onLabels });
    if (handlers.onCreateShortcut) organizeSub.push({ label: label("menu.createShortcut"), icon: FileMenuIcons.organize, onSelect: handlers.onCreateShortcut });
    if (handlers.onInspect) organizeSub.push({ label: label("menu.properties"), icon: FileMenuIcons.properties, onSelect: handlers.onInspect });
    if (organizeSub.length === 1 && handlers.onOrganize) {
      push({ label: label("menu.organize"), icon: FileMenuIcons.organize, onSelect: handlers.onOrganize });
    } else if (organizeSub.length > 0) {
      push({
        label: label("menu.organize"),
        icon: FileMenuIcons.organize,
        onSelect: handlers.onOrganize ?? organizeSub[0]!.onSelect,
        submenu: organizeSub,
      });
    }
  }

  // —— Download / Rename / Follow / Versions ——
  if (handlers.onDownload) push({ label: label("menu.download"), icon: FileMenuIcons.download, onSelect: handlers.onDownload, dividerBefore: true });
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
  if (handlers.onSearchInFolder) {
    push({ label: label("menu.searchInFold"), icon: FileMenuIcons.searchInFold, onSelect: handlers.onSearchInFolder });
  }

  // —— More options (secondary panel) ——
  const moreSub: ActionDropdownItem[] = [];
  if (handlers.onComment) moreSub.push({ label: label("menu.addComment"), icon: FileMenuIcons.comment, onSelect: handlers.onComment });
  if (handlers.onInspect) moreSub.push({ label: label("menu.properties"), icon: FileMenuIcons.properties, onSelect: handlers.onInspect });
  if (control.onReindex) moreSub.push({ label: label("menu.reindex"), icon: FileMenuIcons.organize, onSelect: control.onReindex });
  if (handlers.onFavoriteToggle) {
    moreSub.push({
      label: label(context.isFavorite ? "files.unfavorite" : "files.favorite"),
      icon: context.isFavorite ? FileMenuIcons.unfavorite : FileMenuIcons.favorite,
      onSelect: handlers.onFavoriteToggle,
    });
  }
  if (moreSub.length > 0) {
    push({
      label: label("menu.moreOptions"),
      icon: FileMenuIcons.moreOptions,
      onSelect: moreSub[0]!.onSelect,
      submenu: moreSub,
      dividerBefore: true,
    });
  } else if (handlers.onFavoriteToggle) {
    push({
      label: label(context.isFavorite ? "files.unfavorite" : "files.favorite"),
      icon: context.isFavorite ? FileMenuIcons.unfavorite : FileMenuIcons.favorite,
      onSelect: handlers.onFavoriteToggle,
      dividerBefore: true,
    });
  }

  if (handlers.onDelete) {
    push({
      label: label("menu.moveToTrash"),
      icon: FileMenuIcons.moveToTrash,
      onSelect: handlers.onDelete,
      destructive: true,
      dividerBefore: true,
    });
  }

  return items;
}

/**
 * Unified row-level "⋯" actions menu (Zoho WorkDrive parity):
 * Open → controls (status-aware) → Share submenu → Move/Copy/Workflow/Organize submenu
 * → Download/Rename/Follow → More options submenu → Trash
 */
export function FileActionsMenu({ context, handlers, onCopyLink, control, trigger, zIndex }: FileActionsMenuProps) {
  const { label } = useLocale();
  const items = buildUnifiedFileActionItems({ label: (k) => label(k as never), context, handlers, onCopyLink, control });
  if (items.length === 0) return null;
  return <ActionDropdown label={label("files.actions")} items={items} trigger={trigger} zIndex={zIndex} />;
}
