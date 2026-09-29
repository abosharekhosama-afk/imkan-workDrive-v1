"use client";
import { useLocale } from "../locale-provider";
import { Icons } from "./icons";
import { ZohoMenu } from "./zoho-menu";
import { FileMenuIcons } from "../../lib/file-menu-icons";
import { useState } from "react";

export function FolderEmptyState({ folderId }: { folderId?: string }) {
  const { label } = useLocale();
  const [open, setOpen] = useState<"create" | "upload" | "record" | null>(null);
  const toggle = (m: "create" | "upload" | "record") => setOpen((c) => (c === m ? null : m));
  const close = () => setOpen(null);
  const btn = "inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-[13px] font-medium text-slate-700 shadow-sm hover:bg-slate-50";
  return (
    <div className="wd-folder-empty flex w-full flex-col items-center justify-center gap-4 py-10 text-center" role="status">
      <div aria-hidden="true" className="flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-[#F1F5F9] text-slate-400">
        <Icons.folder size={34} />
      </div>
      <p className="max-w-md text-[13px] text-slate-500">{label("empty.subtitle")}</p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button id="empty-create-btn" type="button" onClick={() => toggle("create")} aria-expanded={open === "create"} aria-haspopup="menu" className={btn}>
          <Icons.plus size={16} /> {label("empty.create")} <Icons.chevD size={14} />
        </button>
        <ZohoMenu open={open === "create"} onClose={close} labelledBy="empty-create-btn"
          onSelect={(k) => { if (k === "folder") window.dispatchEvent(new Event("workdrive:new-folder")); else if (k === "doc") window.location.href = `/files/templates?create=writer${folderId ? `&folderId=${encodeURIComponent(folderId)}` : ""}`; else if (k === "sheet") window.location.href = `/files/templates?create=sheet${folderId ? `&folderId=${encodeURIComponent(folderId)}` : ""}`; else if (k === "slide") window.location.href = `/files/templates?create=slide${folderId ? `&folderId=${encodeURIComponent(folderId)}` : ""}`; }}
          items={[
            { key: "folder", labelKey: "menu.newFolder", icon: FileMenuIcons.newFolder },
            { key: "doc", labelKey: "menu.writer", icon: FileMenuIcons.writer },
            { key: "sheet", labelKey: "menu.sheet", icon: FileMenuIcons.sheet },
            { key: "slide", labelKey: "menu.show", icon: FileMenuIcons.show },
          ]} />
        <button id="empty-upload-btn" type="button" onClick={() => toggle("upload")} aria-expanded={open === "upload"} aria-haspopup="menu" className={btn}>
          <Icons.upload size={16} /> {label("empty.upload")} <Icons.chevD size={14} />
        </button>
        <ZohoMenu open={open === "upload"} onClose={close} labelledBy="empty-upload-btn"
          onSelect={(k) => {
            if (k === "files") window.dispatchEvent(new Event("workdrive:trigger-upload"));
            else if (k === "folderUp") window.dispatchEvent(new Event("workdrive:trigger-upload-folder"));
            else window.dispatchEvent(new CustomEvent("workdrive:cloud-import", { detail: { folderId: folderId ?? null } }));
          }}
          items={[
            { key: "files", labelKey: "menu.uploadFiles", icon: FileMenuIcons.uploadFiles },
            { key: "folderUp", labelKey: "menu.uploadFolder", icon: FileMenuIcons.uploadFolder },
            { key: "cloud", labelKey: "menu.importCloud", icon: FileMenuIcons.importCloud },
          ]} />
        <button id="empty-record-btn" type="button" onClick={() => toggle("record")} aria-expanded={open === "record"} aria-haspopup="menu" className={btn}>
          <Icons.video size={16} /> {label("empty.record")} <Icons.chevD size={14} />
        </button>
        <ZohoMenu open={open === "record"} onClose={close} labelledBy="empty-record-btn"
          onSelect={(k) => window.dispatchEvent(new CustomEvent("workdrive:record", { detail: { kind: k, folderId: folderId ?? null } }))}
          items={[
            { key: "screen", labelKey: "menu.screenRecord", icon: FileMenuIcons.screenRecord },
            { key: "video", labelKey: "menu.videoRecord", icon: FileMenuIcons.videoRecord },
            { key: "audio", labelKey: "menu.audioRecord", icon: FileMenuIcons.audioRecord },
          ]} />
      </div>
    </div>
  );
}
