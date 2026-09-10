"use client";
import { useLocale } from "../locale-provider";
import { Icons } from "./icons";
import { ZohoMenu } from "./zoho-menu";
import { useState } from "react";
export function FolderEmptyState() {
  const { label } = useLocale();
  const [open, setOpen] = useState<"create" | "upload" | "record" | null>(null);
  const toggle = (m: "create" | "upload" | "record") => setOpen((c) => (c === m ? null : m));
  const close = () => setOpen(null);
  const btn = "inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-4 py-2 text-[13px] font-medium text-slate-700 shadow-sm hover:bg-slate-50";
  return (
    <div className="flex flex-col items-center gap-3 py-14 text-center" role="status">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#EEF3FE] text-[#1B66EA]" aria-hidden="true">
        <Icons.folder size={30} />
      </span>
      <p className="text-[13.5px] text-slate-500">{label("empty.ctaTitle")}</p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button id="empty-create-btn" type="button" onClick={() => toggle("create")} aria-expanded={open === "create"} aria-haspopup="menu" className={btn}>
          {label("empty.create")} <Icons.chevD size={14} />
        </button>
        <ZohoMenu open={open === "create"} onClose={close} labelledBy="empty-create-btn"
          onSelect={(k) => { if (k === "folder") window.dispatchEvent(new Event("workdrive:new-folder")); }}
          items={[{ key: "folder", labelKey: "menu.newFolder" }, { key: "doc", labelKey: "menu.doc" }, { key: "sheet", labelKey: "menu.sheet" }, { key: "slide", labelKey: "menu.slide" }]} />
        <button id="empty-upload-btn" type="button" onClick={() => toggle("upload")} aria-expanded={open === "upload"} aria-haspopup="menu" className={btn}>
          {label("empty.upload")} <Icons.chevD size={14} />
        </button>
        <ZohoMenu open={open === "upload"} onClose={close} labelledBy="empty-upload-btn"
          onSelect={() => window.dispatchEvent(new Event("workdrive:trigger-upload"))}
          items={[{ key: "files", labelKey: "menu.uploadFiles" }, { key: "folderUp", labelKey: "menu.uploadFolder" }]} />
        <button id="empty-record-btn" type="button" onClick={() => toggle("record")} aria-expanded={open === "record"} aria-haspopup="menu" className={btn}>
          {label("empty.record")} <Icons.chevD size={14} />
        </button>
        <ZohoMenu open={open === "record"} onClose={close} labelledBy="empty-record-btn"
          onSelect={(k) => window.dispatchEvent(new CustomEvent("workdrive:record", { detail: { kind: k } }))}
          items={[{ key: "screen", labelKey: "menu.screenRecord" }, { key: "video", labelKey: "menu.videoRecord" }, { key: "audio", labelKey: "menu.audioRecord" }]} />
      </div>
    </div>
  );
}
