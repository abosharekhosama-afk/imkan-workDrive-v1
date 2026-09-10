"use client";

// Right-click (context) menu matching Zoho WorkDrive row actions. Reuses the
// exact action ordering/gating from buildFileRowActions so the ⋯ menu and the
// context menu always agree, plus an optional "Copy link" entry.

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "./locale-provider";
import type { MessageKey } from "../i18n";
import { buildFileRowActions, type FileActionId, type RowActionContext } from "./file-row-actions-logic";
import type { FileActionHandlers } from "./file-actions-menu";

const ACTION_LABEL_KEYS: Record<FileActionId, MessageKey> = {
  open: "recent.open",
  preview: "files.preview",
  details: "files.details",
  download: "files.download",
  versions: "files.versionHistory",
  share: "files.share",
  rename: "files.rename",
  move: "files.move",
  favorite: "files.favorite",
  unfavorite: "files.unfavorite",
  delete: "files.delete",
};

/** First management action — a divider separates it from the open group. */
const EDIT_GROUP_START: FileActionId = "share";

type Item = { key: string; label: string; onSelect: () => void; danger?: boolean; dividerBefore?: boolean } | "sep";

export function FileContextMenu({
  context,
  handlers,
  onCopyLink,
  x,
  y,
  onClose,
}: {
  context: RowActionContext;
  handlers: FileActionHandlers;
  onCopyLink?: () => void;
  x: number;
  y: number;
  onClose: () => void;
}) {
  const { label } = useLocale();
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && ref.current) {
        e.preventDefault();
        const btns = [...ref.current.querySelectorAll<HTMLButtonElement>("button")];
        const cur = document.activeElement;
        const idx = btns.findIndex((b) => b === cur);
        const next = e.key === "ArrowDown" ? (idx + 1) % btns.length : (idx <= 0 ? btns.length - 1 : idx - 1);
        btns[next]?.focus();
      }
      if (e.key === "Enter" && ref.current) (document.activeElement as HTMLButtonElement)?.click?.();
    };
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

  const handlerById: Record<FileActionId, (() => void) | undefined> = {
    open: handlers.onOpen,
    preview: handlers.onPreview,
    details: handlers.onViewDetails,
    download: handlers.onDownload,
    versions: handlers.onVersionHistory,
    share: handlers.onShare,
    rename: handlers.onRename,
    move: handlers.onMove,
    favorite: handlers.onFavoriteToggle,
    unfavorite: handlers.onFavoriteToggle,
    delete: handlers.onDelete,
  };

  const items: Item[] = [];
  for (const id of buildFileRowActions(context)) {
    const onSelect = handlerById[id];
    if (!onSelect) continue;
    items.push({
      key: id,
      label: label(ACTION_LABEL_KEYS[id]),
      onSelect,
      danger: id === "delete",
      dividerBefore: id === EDIT_GROUP_START,
    });
  }
  if (onCopyLink) {
    const shareIdx = items.findIndex((it) => it !== "sep" && it.key === "share");
    if (shareIdx >= 0) {
      items.splice(shareIdx, 0, { key: "copyLink", label: label("menu.copyLink"), onSelect: onCopyLink, dividerBefore: true });
    } else {
      items.push({ key: "copyLink", label: label("menu.copyLink"), onSelect: onCopyLink });
    }
  }
  if (items.length === 0) return null;

  const rtl = typeof document !== "undefined" && document.documentElement.dir === "rtl";
  const menuW = 228;
  const left = rtl ? Math.max(8, x - menuW) : Math.min(Math.max(8, x), window.innerWidth - menuW - 8);
  const top = Math.min(Math.max(8, y), window.innerHeight - items.length * 34 - 24);

  return createPortal(
    <div
      ref={ref}
      role="menu"
      style={{ left, top, width: menuW }}
      className="fixed z-[95] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-[0_12px_32px_rgba(16,24,40,0.18)]"
    >
      {items.map((it, i) => {
        if (it === "sep") return <div key={`sep-${i}`} className="mx-2 my-1 border-t border-slate-100" role="separator" />;
        const m = it;
        return [
          m.dividerBefore ? <div key={`d-${i}`} className="mx-2 my-1 border-t border-slate-100" role="separator" /> : null,
          <button
            key={m.key}
            type="button"
            role="menuitem"
            onClick={() => { m.onSelect(); onClose(); }}
            className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-start text-[13px] transition-colors ${
              m.danger ? "font-medium text-red-600 hover:bg-red-50" : "text-slate-700 hover:bg-[#EEF3FE] hover:text-[#1B66EA]"
            }`}
          >
            <span className="w-4 shrink-0 text-center text-[12px]" aria-hidden="true">
              {m.key === "open" ? "↗" : m.key === "favorite" ? "☆" : m.key === "unfavorite" ? "★" : m.key === "delete" ? "🗑" : m.key === "preview" ? "▷" : m.key === "details" ? "ⓘ" : m.key === "download" ? "⤓" : m.key === "share" ? "↗" : m.key === "copyLink" ? "⛓" : m.key === "rename" ? "✎" : m.key === "move" ? "⇥" : ""}
            </span>
            <span className="min-w-0 flex-1 truncate">{m.label}</span>
          </button>,
        ];
      })}
    </div>,
    document.body
  );
}