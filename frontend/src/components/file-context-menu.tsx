"use client";

// Right-click (context) menu matching Zoho WorkDrive row actions. Implements the
// full 5-section reference hierarchy with a nested "Share..." submenu. A
// client-side toast keeps non-backend actions (workflow, Zia, organize...) alive.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "./locale-provider";
import type { FileActionHandlers } from "./file-actions-menu";
import type { ShareLaunchMode } from "../lib/share-launch-logic";
import { followUpdatesMenuLabel } from "../lib/follow-updates-logic";
import { FileMenuIcons } from "../lib/file-menu-icons";

type SubItem = { key: string; label: string; icon?: React.ReactNode; onSelect?: () => void };
type Item = {
  key: string; label: string; icon?: React.ReactNode; onSelect?: () => void; danger?: boolean; hint?: string;
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
  const rtl = typeof document !== "undefined" && document.documentElement.dir === "rtl";
  const ref = useRef<HTMLDivElement | null>(null);

  const D = (k: keyof typeof DIC) => label(DIC[k]);
  const toast = (k: keyof typeof DIC) => onToast?.(D(k));
  const open = handlers.onOpen;
  const onShare = handlers.onShare;
  const shareInvite = () => onShare?.("invite");
  const shareLink = () => onShare?.("link");
  const shareDownloadLink = () => onShare?.("downloadLink");
  const shareEmbed = () => onShare?.("embed");
  const onMove = handlers.onMove;
  const onDownload = handlers.onDownload;
  const onRename = handlers.onRename;
  const onDelete = handlers.onDelete;

  const sections: Item[][] = [
    [
      { key: "openNewTab", label: D("openNewTab"), icon: FileMenuIcons.openNewTab, onSelect: open ?? (() => toast("openNewTab")) },
      { key: "properties", label: D("properties"), icon: FileMenuIcons.properties, onSelect: handlers.onInspect ?? (() => toast("properties")) },
    ],
    [
      {
        key: "share", label: D("shareMenu"), submenu: true, icon: FileMenuIcons.shareMenu,
        submenuItems: [
          { key: "addMembers", label: D("addMembers"), icon: FileMenuIcons.addMembers, onSelect: shareInvite ?? (() => toast("addMembers")) },
          { key: "external", label: D("externalShareLink"), icon: FileMenuIcons.externalShareLink, onSelect: shareLink ?? (() => toast("externalShareLink")) },
          { key: "downloadLink", label: D("downloadLink"), icon: FileMenuIcons.downloadLink, onSelect: shareDownloadLink ?? (() => toast("downloadLink")) },
          { key: "embed", label: D("embedCode"), icon: FileMenuIcons.embedCode, onSelect: shareEmbed ?? (() => toast("embedCode")) },
          { key: "support", label: D("shareToSupport"), icon: FileMenuIcons.shareToSupport, onSelect: () => toast("shareToSupport") },
        ],
      },
      { key: "copyPermalink", label: D("copyPermalink"), icon: FileMenuIcons.copyPermalink, onSelect: onCopyLink ?? (() => toast("copyPermalink")) },
    ],
    [
      { key: "move", label: `${D("moveTo")} (Z)`, hint: "Z", icon: FileMenuIcons.moveTo, onSelect: onMove ?? (() => toast("moveTo")) },
      { key: "copy", label: `${D("copyTo")} (C)`, hint: "C", icon: FileMenuIcons.copyTo, onSelect: handlers.onCopy ?? (() => toast("copyTo")) },
      { key: "workflow", label: D("assignWorkflow"), icon: FileMenuIcons.assignWorkflow, onSelect: handlers.onAssignWorkflow ?? (() => toast("assignWorkflow")) },
      { key: "organize", label: D("organize"), icon: FileMenuIcons.organize, onSelect: handlers.onOrganize ?? (() => toast("organize")) },
    ],
    [
      { key: "search", label: D("searchInFold"), icon: FileMenuIcons.searchInFold, onSelect: () => toast("searchInFold") },
      { key: "download", label: `${D("download")} (⌃S)`, hint: "⌃S", icon: FileMenuIcons.download, onSelect: onDownload ?? (() => toast("download")) },
      { key: "rename", label: D("rename"), icon: FileMenuIcons.rename, onSelect: onRename ?? (() => toast("rename")) },
      { key: "follow", label: label(followUpdatesMenuLabel(Boolean(handlers.isFollowingUpdates))), icon: handlers.isFollowingUpdates ? FileMenuIcons.unfollowUpdates : FileMenuIcons.followUpdates, onSelect: handlers.onFollowUpdates ?? (() => toast("followUpdates")) },
      handlers.onComment
        ? { key: "more", label: D("moreOptions"), icon: FileMenuIcons.moreOptions, submenu: true, submenuItems: [{ key: "addComment", label: label("menu.addComment"), icon: FileMenuIcons.comment, onSelect: handlers.onComment }] }
        : { key: "more", label: D("moreOptions"), icon: FileMenuIcons.moreOptions, onSelect: () => toast("moreOptions") },
    ],
    [
      { key: "delete", label: D("moveToTrash"), icon: FileMenuIcons.moveToTrash, danger: true, onSelect: onDelete ?? (() => toast("moveToTrash")) },
    ],
  ];

  const [subKey, setSubKey] = useState<string | null>(null);
  const subTimer = useRef<number | null>(null);
  const openSubmenu = (key: string | null) => {
    if (subTimer.current) window.clearTimeout(subTimer.current);
    subTimer.current = window.setTimeout(() => setSubKey(key), key ? 80 : 120);
  };
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (ref.current?.contains(e.target as Node)) return; onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onScroll = () => onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      if (subTimer.current) window.clearTimeout(subTimer.current);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose]);

  const menuW = 252;
  const estH = sections.reduce((n, g) => n + g.length, 0) * 32 + sections.length * 2 + 24;
  const left = Math.min(Math.max(8, x), Math.max(8, window.innerWidth - menuW - 8));
  const top = Math.min(Math.max(8, y), Math.max(8, window.innerHeight - estH - 8));
  const subItem = sections.flat().find((item) => item.key === subKey && item.submenuItems);
  const subLeft = rtl ? left - 244 - 2 : left + menuW + 2;
  const subLeftClamped = Math.min(Math.max(8, subLeft), Math.max(8, window.innerWidth - 244 - 8));

  return createPortal(
    <div ref={ref} role="menu" style={{ left, top, width: menuW }} dir={rtl ? "rtl" : "ltr"}
      className="wd-menu fixed z-[95] overflow-hidden">
      {sections.map((group, gi) => (
        <div key={`g-${gi}`} className={gi > 0 ? "wd-menu-sep !my-1" : ""}>
          {group.map((it) => (
            <button key={it.key} type="button" role="menuitem"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!it.submenu) {
                  onClose();
                  it.onSelect?.();
                }
              }}
              onMouseEnter={() => openSubmenu(it.submenu ? it.key : null)}
              data-active={it.submenu && subKey === it.key ? true : undefined}
              data-danger={it.danger || undefined}
              className="wd-menu-item min-h-[34px] text-start">
              <span className="flex w-6 shrink-0 items-center justify-center" aria-hidden="true">{it.icon ?? null}</span>
              <span className="min-w-0 flex-1 truncate">{it.label}</span>
              {it.submenu ? <span className={`shrink-0 text-[#4F4F4F] ${rtl ? "rotate-180" : ""}`}>▸</span> : it.hint ? <span className="shrink-0 text-[12px] text-[#4F4F4F]">{it.hint}</span> : null}
            </button>
          ))}
        </div>
      ))}
      {subItem?.submenuItems ? (
        <div className="wd-menu fixed z-[96]" dir={rtl ? "rtl" : "ltr"}
          style={{ left: subLeftClamped, top: subKey === "more" ? top + 210 : top + 36, width: 244 }}
          onMouseEnter={() => openSubmenu(subKey)}
          onMouseLeave={() => openSubmenu(null)}>
          {subItem.submenuItems.map((si) => (
            <button key={si.key} type="button" role="menuitem"
              onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onClose();
              si.onSelect?.();
            }}
              className="wd-menu-item min-h-[34px] text-start">
                <span className="flex w-6 shrink-0 items-center justify-center" aria-hidden="true">{si.icon ?? null}</span>
                <span className="min-w-0 flex-1 truncate">{si.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>,
    document.body
  );
}