"use client";

// Right-click menu. It mirrors the row action menu and only exposes operations
// that have a real handler for the selected resource and current permissions.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "./locale-provider";
import type { FileActionHandlers } from "./file-actions-menu";
import { followUpdatesMenuLabel } from "../lib/follow-updates-logic";
import { FileMenuIcons } from "../lib/file-menu-icons";
import { clampBoxLeft, readContentLane } from "../lib/overlay-bounds-logic";

type SubItem = { key: string; label: string; icon?: React.ReactNode; onSelect?: () => void };
type Item = {
  key: string; label: string; icon?: React.ReactNode; onSelect?: () => void; danger?: boolean; hint?: string;
  submenu?: boolean; submenuItems?: SubItem[];
};

const DIC = {
  openNewTab: "menu.openNewTab", properties: "menu.properties", shareMenu: "menu.shareMenu",
  addMembers: "menu.addMembers", externalShareLink: "menu.externalShareLink",
  downloadLink: "menu.downloadLink", embedCode: "menu.embedCode",
  copyPermalink: "menu.copyPermalink", moveTo: "menu.moveTo", copyTo: "menu.copyTo",
  assignWorkflow: "menu.assignWorkflow", organize: "menu.organize",
  download: "menu.download", rename: "menu.rename", followUpdates: "menu.followUpdates",
  moreOptions: "menu.moreOptions", moveToTrash: "menu.moveToTrash", preview: "files.preview",
  favorite: "files.favorite", unfavorite: "files.unfavorite", versionHistory: "files.versionHistory", addComment: "menu.addComment", openInOffice: "files.openInOffice", convertToOffice: "files.openInOffice",
} as const;

export function FileContextMenu({
  handlers,
  onCopyLink,
  x,
  y,
  onClose,
}: {
  handlers: FileActionHandlers;
  onCopyLink?: () => void;
  x: number;
  y: number;
  onClose: () => void;
}) {
  const { label } = useLocale();
  const rtl = typeof document !== "undefined" && document.documentElement.dir === "rtl";
  const ref = useRef<HTMLDivElement | null>(null);

  const D = (k: keyof typeof DIC) => k === "openInOffice" ? "Open in IMKAN Office" : k === "convertToOffice" ? "Convert to IMKAN Office" : label(DIC[k]);
  const onShare = handlers.onShare;
  const sections: Item[][] = [
    [
      ...(handlers.onOpen ? [{ key: "openNewTab", label: D("openNewTab"), icon: FileMenuIcons.openNewTab, onSelect: handlers.onOpen }] : []),
      ...(handlers.onPreview ? [{ key: "preview", label: D("preview"), icon: FileMenuIcons.preview, onSelect: handlers.onPreview }] : []),
      ...(handlers.onOpenInOffice ? [{ key: "openInOffice", label: D("openInOffice"), icon: FileMenuIcons.openNewTab, onSelect: handlers.onOpenInOffice }] : []),
      ...(handlers.onReindex ? [{ key: "reindex", label: "Re-index", icon: FileMenuIcons.organize, onSelect: handlers.onReindex }] : []),
      ...(handlers.onCheckOut ? [{ key: "checkOut", label: "Check Out", icon: FileMenuIcons.organize, onSelect: handlers.onCheckOut }] : []),
      ...(handlers.onCheckIn ? [{ key: "checkIn", label: "Check In", icon: FileMenuIcons.organize, onSelect: handlers.onCheckIn }] : []),
      ...(handlers.onMarkFinal ? [{ key: "markFinal", label: "Mark as Final", icon: FileMenuIcons.organize, onSelect: handlers.onMarkFinal }] : []),
      ...(handlers.onEnableEditing ? [{ key: "enableEditing", label: "Enable Editing", icon: FileMenuIcons.organize, onSelect: handlers.onEnableEditing }] : []),
      ...(handlers.onConvertToOffice ? [{ key: "convertToOffice", label: D("convertToOffice"), icon: FileMenuIcons.openNewTab, onSelect: handlers.onConvertToOffice }] : []),
      ...(handlers.onInspect ? [{ key: "properties", label: D("properties"), icon: FileMenuIcons.properties, onSelect: handlers.onInspect }] : []),
    ],
    [
      ...(onShare ? [{
        key: "share", label: D("shareMenu"), submenu: true, icon: FileMenuIcons.shareMenu,
        submenuItems: [
          { key: "addMembers", label: D("addMembers"), icon: FileMenuIcons.addMembers, onSelect: () => onShare("invite") },
          { key: "external", label: D("externalShareLink"), icon: FileMenuIcons.externalShareLink, onSelect: () => onShare("link") },
          { key: "downloadLink", label: D("downloadLink"), icon: FileMenuIcons.downloadLink, onSelect: () => onShare("downloadLink") },
          { key: "embed", label: D("embedCode"), icon: FileMenuIcons.embedCode, onSelect: () => onShare("embed") },
        ],
      }] : []),
      ...(onCopyLink ? [{ key: "copyPermalink", label: D("copyPermalink"), icon: FileMenuIcons.copyPermalink, onSelect: onCopyLink }] : []),
    ],
    [
      ...(handlers.onMove ? [{ key: "move", label: `${D("moveTo")} (Z)`, hint: "Z", icon: FileMenuIcons.moveTo, onSelect: handlers.onMove }] : []),
      ...(handlers.onCopy ? [{ key: "copy", label: `${D("copyTo")} (C)`, hint: "C", icon: FileMenuIcons.copyTo, onSelect: handlers.onCopy }] : []),
      ...(handlers.onAssignWorkflow ? [{ key: "workflow", label: D("assignWorkflow"), icon: FileMenuIcons.assignWorkflow, onSelect: handlers.onAssignWorkflow }] : []),
      ...(handlers.onOrganize ? [{ key: "organize", label: D("organize"), icon: FileMenuIcons.organize, onSelect: handlers.onOrganize }] : []),
    ],
    [
      ...(handlers.onDownload ? [{ key: "download", label: `${D("download")} (⌃S)`, hint: "⌃S", icon: FileMenuIcons.download, onSelect: handlers.onDownload }] : []),
      ...(handlers.onRename ? [{ key: "rename", label: D("rename"), icon: FileMenuIcons.rename, onSelect: handlers.onRename }] : []),
      ...(handlers.onFollowUpdates ? [{ key: "follow", label: label(followUpdatesMenuLabel(Boolean(handlers.isFollowingUpdates))), icon: handlers.isFollowingUpdates ? FileMenuIcons.unfollowUpdates : FileMenuIcons.followUpdates, onSelect: handlers.onFollowUpdates }] : []),
      ...(handlers.onVersionHistory ? [{ key: "versions", label: D("versionHistory"), icon: FileMenuIcons.versionHistory, onSelect: handlers.onVersionHistory }] : []),
      ...(handlers.onComment ? [{ key: "more", label: D("moreOptions"), icon: FileMenuIcons.moreOptions, submenu: true, submenuItems: [{ key: "addComment", label: D("addComment"), icon: FileMenuIcons.comment, onSelect: handlers.onComment }] }] : []),
      ...(handlers.onFavoriteToggle ? [{ key: "favorite", label: handlers.isFavorite ? D("unfavorite") : D("favorite"), icon: handlers.isFavorite ? FileMenuIcons.unfavorite : FileMenuIcons.favorite, onSelect: handlers.onFavoriteToggle }] : []),
    ],
    [
      ...(handlers.onDelete ? [{ key: "delete", label: D("moveToTrash"), icon: FileMenuIcons.moveToTrash, danger: true, onSelect: handlers.onDelete }] : []),
    ],
  ].filter((section) => section.length > 0);

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

  if (sections.length === 0) return null;

  const menuW = 252;
  const estH = sections.reduce((n, g) => n + g.length, 0) * 34 + sections.length * 2 + 24;
  const lane = readContentLane();
  const left = clampBoxLeft(x, menuW, lane);
  const top = Math.min(Math.max(8, y), Math.max(8, window.innerHeight - estH - 8));
  const subItem = sections.flat().find((item) => item.key === subKey && item.submenuItems);
  const subLeft = rtl ? left - 244 - 2 : left + menuW + 2;
  const subLeftClamped = clampBoxLeft(subLeft, 244, lane);

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
