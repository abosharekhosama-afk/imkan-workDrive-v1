"use client";
import { useLocale } from "../locale-provider";
import { Icons } from "./icons";
import { ZohoMenu } from "./zoho-menu";
import { useState } from "react";
export function SelectionBar({ folderCount, fileCount, onShare, onCopyLink, onDownload, onClear }: {
  folderCount: number; fileCount: number;
  onShare: () => void; onCopyLink: () => void; onDownload: () => void; onClear: () => void;
}) {
  const { label } = useLocale();
  const [shareOpen, setShareOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const total = folderCount + fileCount;
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
        className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--wd-active)] text-[color:var(--wd-primary-ink)]"><Icons.check size={14} /></button>
      <span className="text-[13px] font-medium text-[color:var(--wd-primary-ink)]">{text}</span>
      <div className="ms-auto flex items-center gap-1">
        <button id="sel-share-btn" type="button" onClick={() => setShareOpen((v) => !v)} aria-expanded={shareOpen} aria-haspopup="menu"
          className="wd-pill wd-pill-record inline-flex items-center gap-1.5">
          {label("sel.share")} <Icons.chevD size={13} />
        </button>
        <ZohoMenu open={shareOpen} onClose={() => setShareOpen(false)} labelledBy="sel-share-btn"
          onSelect={(k) => { if (k === "share" || k === "addMembers" || k === "externalShareLink") onShare(); else if (k === "copy") onCopyLink(); }}
          items={[
            { key: "addMembers", labelKey: "menu.addMembers" },
            { key: "externalShareLink", labelKey: "menu.externalShareLink" },
            { key: "downloadLink", labelKey: "menu.downloadLink" },
            { key: "embedCode", labelKey: "menu.embedCode" },
            { key: "shareToSupport", labelKey: "menu.shareToSupport" },
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
            if (k === "share" || k === "addMembers") onShare();
            else if (k === "copy" || k === "copyPermalink") onCopyLink();
            else if (k === "download") onDownload();
          }}
          items={[
            { key: "openNewTab", labelKey: "menu.openNewTab" },
            { key: "properties", labelKey: "menu.properties" },
            "sep",
            { key: "share", labelKey: "menu.shareMenu", chevron: true },
            { key: "copyPermalink", labelKey: "menu.copyPermalink" },
            "sep",
            { key: "moveTo", labelKey: "menu.moveTo", hint: "Z" },
            { key: "copyTo", labelKey: "menu.copyTo", hint: "C" },
            { key: "assignWorkflow", labelKey: "menu.assignWorkflow" },
            { key: "organize", labelKey: "menu.organize" },
            "sep",
            { key: "searchInFold", labelKey: "menu.searchInFold" },
            { key: "download", labelKey: "sel.download", hint: "Ctrl+S" },
            { key: "rename", labelKey: "menu.rename" },
            { key: "followUpdates", labelKey: "menu.followUpdates" },
            { key: "moreOptions", labelKey: "menu.moreOptions" },
            "sep",
            { key: "moveToTrash", labelKey: "menu.moveToTrash", danger: true },
          ]} />
        <button type="button" onClick={onClear} aria-label={label("sel.clear")} title="Esc"
          className="inline-flex h-8 items-center gap-1 rounded-full bg-[var(--wd-active)] px-3 text-[12px] font-medium text-[color:var(--wd-primary-ink)] transition-colors duration-150 ease-in-out hover:bg-[color:var(--wd-active)]">Esc <Icons.x size={12} /></button>
      </div>
    </div>
  );
}