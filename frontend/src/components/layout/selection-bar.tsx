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
  const total = folderCount + fileCount;
  if (total === 0) return null;
  const text = (folderCount > 0 && fileCount === 0
    ? label("sel.foldersSelected")
    : fileCount > 0 && folderCount === 0
      ? label("sel.filesSelected")
      : label("sel.itemsSelected")
  ).replace("{count}", String(total));
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[#C9D8F8] bg-[#EEF3FE] px-3 py-1.5" role="status" aria-live="polite">
      <button type="button" onClick={onClear} aria-label={label("sel.clear")} title={label("sel.clear")}
        className="rounded p-1 text-[#1B66EA] hover:bg-[#DCE7FD]"><Icons.x size={15} /></button>
      <span className="text-[13px] font-medium text-[#1B3A7A]">{text}</span>
      <div className="ms-auto flex items-center gap-1">
        <button id="sel-share-btn" type="button" onClick={() => setShareOpen((v) => !v)} aria-expanded={shareOpen} aria-haspopup="menu"
          className="inline-flex items-center gap-1 rounded-md border border-[#1B66EA]/30 bg-white px-3 py-1.5 text-[13px] font-medium text-[#1B66EA] hover:bg-[#DCE7FD]">
          {label("menu.shareMenu")} <Icons.chevD size={13} />
        </button>
        <ZohoMenu open={shareOpen} onClose={() => setShareOpen(false)} labelledBy="sel-share-btn"
          onSelect={(k) => { if (k === "share") onShare(); else if (k === "copy") onCopyLink(); }}
          items={[
            { key: "share", labelKey: "menu.shareMenu" },
            { key: "copy", labelKey: "menu.copyLink" },
          ]} />
        <button type="button" onClick={onCopyLink} title={label("menu.copyLink")} aria-label={label("menu.copyLink")}
          className="rounded-md p-1.5 text-[#1B3A7A] hover:bg-[#DCE7FD]"><Icons.link size={16} /></button>
        <button type="button" onClick={onDownload} title={label("menu.download")} aria-label={label("menu.download")}
          className="rounded-md p-1.5 text-[#1B3A7A] hover:bg-[#DCE7FD]"><Icons.download size={16} /></button>
        <button type="button" onClick={onShare} title={label("files.actions")} aria-label={label("files.actions")}
          className="rounded-md p-1.5 text-[#1B3A7A] hover:bg-[#DCE7FD]"><Icons.dots size={16} /></button>
      </div>
    </div>
  );
}
