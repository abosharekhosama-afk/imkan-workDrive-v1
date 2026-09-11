"use client";

// Right-click (context) menu matching Zoho WorkDrive row actions. Implements the
// full 5-section reference hierarchy with a nested "Share..." submenu. A
// client-side toast keeps non-backend actions (workflow, Zia, organize...) alive.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "./locale-provider";
import type { FileActionHandlers } from "./file-actions-menu";

type SubItem = { key: string; label: string; onSelect?: () => void };
type Item = {
  key: string; label: string; onSelect?: () => void; danger?: boolean; hint?: string;
  submenu?: boolean; submenuItems?: SubItem[];
};

const DIC = {
  openNewTab: "menu.openNewTab", properties: "menu.properties", shareMenu: "menu.shareMenu",
  addMembers: "menu.addMembers", externalShareLink: "menu.externalShareLink",
  downloadLink: "menu.downloadLink", embedCode: "menu.embedCode", shareToSupport: "menu.shareToSupport",
  copyPermalink: "menu.copyPermalink", moveTo: "menu.moveTo", copyTo: "menu.copyTo",
  assignWorkflow: "menu.assignWorkflow", organize: "menu.organize", searchInFold: "menu.searchInFold",
  download: "menu.download", rename: "menu.rename", followUpdates: "menu.followUpdates",
  moreOptions: "menu.moreOptions", moveToTrash: "menu.moveToTrash",
} as const;

export function FileContextMenu({
  handlers,
  onCopyLink,
  onToast,
  x,
  y,
  onClose,
}: {
  handlers: FileActionHandlers;
  onCopyLink?: () => void;
  onToast?: (message: string) => void;
  x: number;
  y: number;
  onClose: () => void;
}) {
  const { label } = useLocale();
  const ref = useRef<HTMLDivElement | null>(null);

  const D = (k: keyof typeof DIC) => label(DIC[k]);
  const toast = (k: keyof typeof DIC) => onToast?.(D(k));
  const open = handlers.onOpen;
  const props = handlers.onViewDetails;
  const onShare = handlers.onShare;
  const onMove = handlers.onMove;
  const onDownload = handlers.onDownload;
  const onRename = handlers.onRename;
  const onDelete = handlers.onDelete;

  const sections: Item[][] = [
    [
      { key: "openNewTab", label: D("openNewTab"), onSelect: open ?? (() => toast("openNewTab")) },
      { key: "properties", label: D("properties"), onSelect: props ?? (() => toast("properties")) },
    ],
    [
      {
        key: "share", label: D("shareMenu"), submenu: true,
        submenuItems: [
          { key: "addMembers", label: D("addMembers"), onSelect: onShare ?? (() => toast("addMembers")) },
          { key: "external", label: D("externalShareLink"), onSelect: onShare ?? (() => toast("externalShareLink")) },
          { key: "downloadLink", label: D("downloadLink"), onSelect: onShare ?? (() => toast("downloadLink")) },
          { key: "embed", label: D("embedCode"), onSelect: onShare ?? (() => toast("embedCode")) },
          { key: "support", label: D("shareToSupport"), onSelect: () => toast("shareToSupport") },
        ],
      },
      { key: "copyPermalink", label: D("copyPermalink"), onSelect: onCopyLink ?? (() => toast("copyPermalink")) },
    ],
    [
      { key: "move", label: `${D("moveTo")} (Z)`, hint: "Z", onSelect: onMove ?? (() => toast("moveTo")) },
      { key: "copy", label: `${D("copyTo")} (C)`, hint: "C", onSelect: onMove ?? (() => toast("copyTo")) },
      { key: "workflow", label: D("assignWorkflow"), onSelect: () => toast("assignWorkflow") },
      { key: "organize", label: D("organize"), onSelect: () => toast("organize") },
    ],
    [
      { key: "search", label: D("searchInFold"), onSelect: () => toast("searchInFold") },
      { key: "download", label: `${D("download")} (⌃S)`, hint: "⌃S", onSelect: onDownload ?? (() => toast("download")) },
      { key: "rename", label: D("rename"), onSelect: onRename ?? (() => toast("rename")) },
      { key: "follow", label: D("followUpdates"), onSelect: () => toast("followUpdates") },
      { key: "more", label: D("moreOptions"), onSelect: () => toast("moreOptions") },
    ],
    [
      { key: "delete", label: D("moveToTrash"), danger: true, onSelect: onDelete ?? (() => toast("moveToTrash")) },
    ],
  ];

  const [subOpen, setSubOpen] = useState(false);
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (ref.current?.contains(e.target as Node)) return; onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onScroll = () => onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose]);

  const menuW = 252;
  const estH = sections.reduce((n, g) => n + g.length, 0) * 32 + sections.length * 2 + 24;
  const left = Math.min(Math.max(8, x), Math.max(8, window.innerWidth - menuW - 8));
  const top = Math.min(Math.max(8, y), Math.max(8, window.innerHeight - estH - 8));
  const share = sections[1]?.[0];
  const openSub = subOpen && Boolean(share?.submenuItems);

  return createPortal(
    <div ref={ref} role="menu" style={{ left, top, width: menuW }}
      className="fixed z-[95] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-[0_12px_32px_rgba(16,24,40,0.18)]">
      {sections.map((group, gi) => (
        <div key={`g-${gi}`} className={gi > 0 ? "mx-1 my-1 border-t border-slate-100 pt-1" : ""}>
          {group.map((it) => (
            <button key={it.key} type="button" role="menuitem"
              onClick={() => { if (!it.submenu) it.onSelect?.(); onClose(); }}
              onMouseEnter={() => setSubOpen(it.submenu ? true : false)}
              className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-start text-[13px] transition-colors ${it.danger ? "font-medium text-red-600 hover:bg-red-50" : `text-slate-700 hover:bg-[#EEF3FE] hover:text-[#1B66EA] ${it.submenu && openSub ? "bg-[#EEF3FE] text-[#1B66EA]" : ""}`}`}>
              <span className="min-w-0 flex-1 truncate">{it.label}</span>
              {it.submenu ? <span className="shrink-0 text-slate-400">▸</span> : it.hint ? <span className="shrink-0 text-[11px] text-slate-400">{it.hint}</span> : null}
            </button>
          ))}
        </div>
      ))}
      {openSub && share.submenuItems ? (
        <div className="fixed z-[96] rounded-lg border border-slate-200 bg-white py-1 shadow-[0_12px_32px_rgba(16,24,40,0.18)]"
          style={{ left: left + menuW + 4, top: top + 8, width: 244 }}>
          {share.submenuItems.map((si) => (
            <button key={si.key} type="button" role="menuitem"
              onClick={() => { si.onSelect?.(); onClose(); }}
              className="flex w-full items-center px-3 py-1.5 text-start text-[13px] text-slate-700 hover:bg-[#EEF3FE] hover:text-[#1B66EA]">
              <span className="min-w-0 flex-1 truncate">{si.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>,
    document.body
  );
}