"use client";
import { useLocale } from "../locale-provider";
import { Icons } from "./icons";
import { ZohoMenu } from "./zoho-menu";
import { useState } from "react";
import type { SelectionBarActionKey } from "../../lib/selection-bar-actions-logic";
import { FileMenuIcons } from "../../lib/file-menu-icons";
import { FileActionsMenu, type FileActionHandlers, type FileControlState } from "../file-actions-menu";

export function SelectionBar({
  folderCount,
  fileCount,
  singleSelected,
  canMutate,
  canShare,
  onShare,
  onCopyLink,
  onDownload,
  onAction,
  onClear,
  isFollowingSelected = false,
  extraHandlers,
  control,
  menuResourceType,
  menuFavorite = false,
}: {
  folderCount: number;
  fileCount: number;
  singleSelected: boolean;
  canMutate: boolean;
  canShare: boolean;
  onShare: (tab?: "link" | "invite") => void;
  onCopyLink: () => void;
  onDownload: () => void;
  onAction: (key: SelectionBarActionKey) => void;
  onClear: () => void;
  isFollowingSelected?: boolean;
  /** Row-equivalent actions for the one selected item. Multi-select keeps the shared set. */
  extraHandlers?: FileActionHandlers;
  control?: FileControlState;
  menuResourceType?: "FILE" | "FOLDER";
  menuFavorite?: boolean;
}) {
  const { label } = useLocale();
  const [shareOpen, setShareOpen] = useState(false);
  const total = folderCount + fileCount;
  const menuHandlers: FileActionHandlers = {
    onOpen: singleSelected ? () => onAction("openNewTab") : undefined,
    onShare: singleSelected && canShare ? () => onAction("share") : undefined,
    onCopyLink: singleSelected && canShare ? onCopyLink : undefined,
    onMove: singleSelected && canMutate ? () => onAction("moveTo") : undefined,
    onCopy: singleSelected && canMutate ? () => onAction("copyTo") : undefined,
    onAssignWorkflow: singleSelected && canMutate ? () => onAction("assignWorkflow") : undefined,
    onOrganize: canMutate ? () => onAction("organize") : undefined,
    onSearchInFolder: () => onAction("searchInFold"),
    onDownload: fileCount > 0 ? onDownload : undefined,
    onRename: singleSelected && canMutate ? () => onAction("rename") : undefined,
    onFollowUpdates: () => onAction("followUpdates"),
    isFollowingUpdates: isFollowingSelected,
    onInspect: singleSelected ? () => onAction("moreOptions") : undefined,
    onDelete: canMutate ? () => onAction("moveToTrash") : undefined,
  };
  const handlers: FileActionHandlers = { ...menuHandlers };
  if (singleSelected && extraHandlers) {
    for (const [key, value] of Object.entries(extraHandlers)) {
      if (value !== undefined) (handlers as Record<string, unknown>)[key] = value;
    }
  }
  if (total === 0) return null;
  const text = (folderCount > 0 && fileCount === 0
    ? label("sel.foldersSelected")
    : fileCount > 0 && folderCount === 0
      ? label("sel.filesSelected")
      : label("sel.itemsSelected")
  ).replace("{count}", String(total));
  return (
    <div className="wd-selbar flex shrink-0 flex-wrap items-center gap-2" role="status" aria-live="polite">
      <button type="button" onClick={onClear} aria-label={label("sel.clear")} title={label("sel.clear")}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--wd-active)] text-[color:var(--wd-primary)]"><Icons.check size={16} /></button>
      <span className="text-[13px] font-medium text-[color:var(--wd-primary-ink)]">{text}</span>
      <div className="ms-auto flex items-center gap-1">
        <button id="sel-share-btn" type="button" onClick={() => setShareOpen((v) => !v)} aria-expanded={shareOpen} aria-haspopup="menu"
          className="wd-pill wd-pill-record inline-flex items-center gap-1.5">
          {label("sel.share")} <Icons.chevD size={13} />
        </button>
        <ZohoMenu open={shareOpen} onClose={() => setShareOpen(false)} labelledBy="sel-share-btn"
          onSelect={(k) => {
            if (k === "addMembers") onShare("invite");
            else if (k === "externalShareLink") onShare("link");
            else if (k === "copy") onCopyLink();
          }}
          items={[
            { key: "addMembers", labelKey: "menu.addMembers", icon: FileMenuIcons.addMembers },
            { key: "externalShareLink", labelKey: "menu.externalShareLink", icon: FileMenuIcons.externalShareLink },
          ]} />
        <button type="button" onClick={onCopyLink} title={label("menu.copyLink")} aria-label={label("menu.copyLink")}
          className="flex h-7 w-7 items-center justify-center rounded-full text-[color:var(--wd-primary-ink)] hover:bg-[var(--wd-active)]"><Icons.link size={14} /></button>
        <button type="button" onClick={onDownload} title={label("sel.download")} aria-label={label("sel.download")}
          className="flex h-7 w-7 items-center justify-center rounded-full text-[color:var(--wd-primary-ink)] hover:bg-[var(--wd-active)]"><Icons.download size={14} /></button>
        <FileActionsMenu
          context={{
            resourceType: menuResourceType ?? (folderCount > 0 && fileCount === 0 ? "FOLDER" : "FILE"),
            canMutate,
            canShare,
            canFavorite: Boolean(handlers.onFavoriteToggle),
            isFavorite: menuFavorite,
          }}
          control={singleSelected ? control : undefined}
          handlers={handlers}
          trigger={<button type="button" title={label("sel.more")} aria-label={label("files.actions")} className="flex h-7 w-7 items-center justify-center rounded-full text-[color:var(--wd-primary-ink)] hover:bg-[var(--wd-active)]"><Icons.dots size={14} /></button>}
        />
        <button type="button" onClick={onClear} aria-label={label("sel.clear")} title="Esc"
          className="inline-flex h-8 items-center gap-1 rounded-full bg-[var(--wd-active)] px-3 text-[12px] font-medium text-[color:var(--wd-primary-ink)] transition-colors duration-150 ease-in-out hover:bg-[color:var(--wd-active)]">Esc <Icons.x size={12} /></button>
      </div>
    </div>
  );
}
