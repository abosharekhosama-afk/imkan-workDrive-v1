"use client";
import { useLocale } from "../locale-provider";
import { Icons } from "./icons";
import { ZohoMenu } from "./zoho-menu";
import { useMemo, useState } from "react";
import type { SelectionBarActionKey } from "../../lib/selection-bar-actions-logic";

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
}) {
  const { label } = useLocale();
  const [shareOpen, setShareOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const total = folderCount + fileCount;
  const needsSingle = !singleSelected;
  const moreItems = useMemo(
    () => [
      { key: "openNewTab", labelKey: "menu.openNewTab" as const, disabled: needsSingle },
      "sep" as const,
      { key: "share", labelKey: "menu.shareMenu" as const, chevron: true, disabled: !canShare || needsSingle },
      { key: "copyPermalink", labelKey: "menu.copyPermalink" as const, disabled: !canShare || needsSingle },
      "sep" as const,
      { key: "moveTo", labelKey: "menu.moveTo" as const, hint: "Z", disabled: !canMutate || needsSingle },
      { key: "copyTo", labelKey: "menu.copyTo" as const, hint: "C", disabled: !canMutate || needsSingle },
      { key: "assignWorkflow", labelKey: "menu.assignWorkflow" as const, disabled: !canMutate || needsSingle },
      { key: "organize", labelKey: "menu.organize" as const, chevron: true, disabled: !canMutate, submenuItems: [
        { key: "associateDataTemplate", labelKey: "menu.associateDataTemplate" as const },
      ] },
      "sep" as const,
      { key: "searchInFold", labelKey: "menu.searchInFold" as const },
      { key: "download", labelKey: "sel.download" as const, hint: "⌃S", disabled: fileCount === 0 },
      { key: "rename", labelKey: "menu.rename" as const, disabled: !canMutate || needsSingle },
      { key: "followUpdates", labelKey: (isFollowingSelected ? "menu.unfollowUpdates" : "menu.followUpdates") as const, disabled: false },
      { key: "moreOptions", labelKey: "menu.moreOptions" as const, disabled: needsSingle },
      "sep" as const,
      { key: "moveToTrash", labelKey: "menu.moveToTrash" as const, danger: true, disabled: !canMutate },
    ],
    [canMutate, canShare, fileCount, needsSingle, isFollowingSelected],
  );
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
            { key: "addMembers", labelKey: "menu.addMembers" },
            { key: "externalShareLink", labelKey: "menu.externalShareLink" },
          ]} />
        <button type="button" onClick={onCopyLink} title={label("menu.copyLink")} aria-label={label("menu.copyLink")}
          className="flex h-7 w-7 items-center justify-center rounded-full text-[color:var(--wd-primary-ink)] hover:bg-[var(--wd-active)]"><Icons.link size={14} /></button>
        <button type="button" onClick={onDownload} title={label("sel.download")} aria-label={label("sel.download")}
          className="flex h-7 w-7 items-center justify-center rounded-full text-[color:var(--wd-primary-ink)] hover:bg-[var(--wd-active)]"><Icons.download size={14} /></button>
        <button id="sel-more-btn" type="button" onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen} aria-haspopup="menu"
          title={label("sel.more")} aria-label={label("sel.more")}
          className={`flex h-7 w-7 items-center justify-center rounded-full text-[color:var(--wd-primary-ink)] hover:bg-[var(--wd-active)] ${moreOpen ? "bg-[var(--wd-active)]" : ""}`}><Icons.dots size={14} /></button>
        <ZohoMenu open={moreOpen} onClose={() => setMoreOpen(false)} labelledBy="sel-more-btn" align="end" widthPx={252}
          onSelect={(k) => {
            if (k === "share" || k === "addMembers") onShare("invite");
            else if (k === "copy" || k === "copyPermalink") onCopyLink();
            else if (k === "download") onDownload();
            else if (k === "organize:associateDataTemplate") onAction("organize");
            else if (!k.includes(":")) onAction(k as SelectionBarActionKey);
          }}
          items={moreItems} />
        <button type="button" onClick={onClear} aria-label={label("sel.clear")} title="Esc"
          className="inline-flex h-8 items-center gap-1 rounded-full bg-[var(--wd-active)] px-3 text-[12px] font-medium text-[color:var(--wd-primary-ink)] transition-colors duration-150 ease-in-out hover:bg-[color:var(--wd-active)]">Esc <Icons.x size={12} /></button>
      </div>
    </div>
  );
}
