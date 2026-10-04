"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "../locale-provider";
import type { MessageKey } from "../../i18n";
import { clampBoxLeft, placeFloatingMenu, readContentLane } from "../../lib/overlay-bounds-logic";
export type MenuItem = {
  key: string;
  labelKey: MessageKey;
  descKey?: MessageKey;
  hint?: string;
  hintPill?: boolean;
  danger?: boolean;
  checked?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  chevron?: boolean;
  submenuItems?: Array<MenuItem | "sep">;
};
export function ZohoMenu({ open, onClose, onSelect, items, labelledBy, align = "start", width = "w-56", widthPx, zIndex = 90, constrainToLane = true }: {
  open: boolean; onClose: () => void; onSelect: (key: string) => void;
  items: Array<MenuItem | "sep" | { header: MessageKey }>; labelledBy: string;
  align?: "start" | "end"; width?: string; widthPx?: number;
  zIndex?: number;
  constrainToLane?: boolean;
}) {
  const { label } = useLocale();
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; start: number } | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [submenuPos, setSubmenuPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const anchorRef = useRef<Element | null>(null);
  const menuW = widthPx ?? 240;
  useEffect(() => {
    if (!open) { setPos(null); setActiveKey(null); setSubmenuPos(null); anchorRef.current = null; return; }
    const el = document.getElementById(labelledBy);
    anchorRef.current = el;
    const place = () => {
      const r = el?.getBoundingClientRect();
      if (!r) return;
      const isRtl = typeof document !== "undefined" && document.documentElement.dir === "rtl";
      let start: number;
      if (align === "end") {
        start = isRtl ? r.left : r.right - menuW;
      } else {
        start = isRtl ? r.right - menuW : r.left;
      }
      start = constrainToLane
        ? clampBoxLeft(start, menuW, readContentLane())
        : Math.min(Math.max(8, start), Math.max(8, window.innerWidth - menuW - 8));
      setPos({ top: r.bottom + 4, start });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open, labelledBy, align, menuW, constrainToLane]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open, onClose]);
  if (!open || !pos) return null;
  const rtl = typeof document !== "undefined" && document.documentElement.dir === "rtl";
  // Show the full actions card without internal scrolling. When the card is tall
  // (few table rows / large menu), the table/page is the scrollable surface.
  // Flip upward if there is not enough space below the trigger.
  const estimatedHeight = Math.min(items.length * 40 + 24, window.innerHeight - 16);
  const spaceBelow = window.innerHeight - pos.top - 8;
  const openUpward = spaceBelow < estimatedHeight && pos.top > estimatedHeight + 8;
  const style: React.CSSProperties = {
    top: openUpward ? Math.max(8, pos.top - estimatedHeight - 4) : pos.top,
    width: menuW,
    maxHeight: "none",
    overflowY: "visible",
    ...(rtl ? { right: Math.max(8, window.innerWidth - pos.start - menuW) } : { left: pos.start }),
  };
  return createPortal(
    <div ref={ref} role="menu" aria-labelledby={labelledBy}
      className={`wd-menu fixed ${widthPx ? "" : width} overflow-visible`}
      style={{ ...style, zIndex }}>
      {items.map((it, i) => {
        if (it === "sep") return <div key={`sep-${i}`} className="wd-menu-sep" role="separator" />;
        if (typeof it === "object" && "header" in it) {
          return <div key={`h-${i}`} className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label(it.header)}</div>;
        }
        const m = it as MenuItem;
        const hasDesc = Boolean(m.descKey);
        const hasSubmenu = Boolean(m.submenuItems?.length);
        const openSubmenu = (target: HTMLElement) => {
          if (!hasSubmenu) { setActiveKey(m.key); return; }
          const r = target.getBoundingClientRect();
          const subW = 250;
          const isRtl = typeof document !== "undefined" && document.documentElement.dir === "rtl";
          const height = (m.submenuItems?.length ?? 1) * 36 + 12;
          const placed = placeFloatingMenu({
            anchor: { top: r.top, left: r.left, right: r.right, bottom: r.bottom },
            width: subW,
            height,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            rtl: isRtl,
          });
          setActiveKey(m.key);
          setSubmenuPos({ top: placed.top, left: placed.left, maxHeight: placed.maxHeight });
        };
        return (
          <button key={m.key} type="button" role="menuitem" disabled={m.disabled}
            data-active={activeKey === m.key || undefined}
            data-danger={m.danger || undefined}
            onMouseEnter={(e) => openSubmenu(e.currentTarget)}
            onClick={(e) => {
              if (hasSubmenu) { e.preventDefault(); openSubmenu(e.currentTarget); return; }
              onSelect(m.key); onClose();
            }}
            className={`wd-menu-item disabled:opacity-40 ${hasDesc ? "min-h-[49px] py-2" : "min-h-[34px]"}`}>
            <span className="flex w-6 shrink-0 items-center justify-center" aria-hidden="true">
              {m.icon ?? (m.checked ? <span className="text-[13px] font-bold text-[color:var(--wd-primary)]">✓</span> : null)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-normal leading-4">{label(m.labelKey)}</span>
              {m.descKey ? <span className="mt-0.5 block truncate text-[12px] font-normal leading-4 text-slate-500">{label(m.descKey)}</span> : null}
            </span>
            {(m.chevron || hasSubmenu) ? <span className="shrink-0 text-slate-500" aria-hidden="true">›</span> : null}
            {m.hint ? (
              <span className={m.hintPill ? "shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500" : "shrink-0 text-[12px] text-slate-500"}>{m.hint}</span>
            ) : null}
          </button>
        );
      })}
      {activeKey && submenuPos ? (() => {
        const parent = items.find((item) => item !== "sep" && typeof item === "object" && "key" in item && item.key === activeKey) as MenuItem | undefined;
        if (!parent?.submenuItems?.length) return null;
        return (
          <div role="menu" className="wd-menu action-submenu fixed w-[250px] overflow-visible" style={{ top: submenuPos.top, left: submenuPos.left, zIndex: zIndex + 1 }}
            onMouseLeave={() => { setActiveKey(null); setSubmenuPos(null); }}>
            {parent.submenuItems.map((child, i) => child === "sep" ? <div key={`sub-sep-${i}`} className="wd-menu-sep" role="separator" /> : (
              <button key={child.key} type="button" role="menuitem" disabled={child.disabled} data-danger={child.danger || undefined}
                onClick={() => { onSelect(`${parent.key}:${child.key}`); onClose(); }}
                className="wd-menu-item min-h-[34px] disabled:opacity-40">
                <span className="flex w-6 shrink-0 items-center justify-center">{child.icon ?? (child.checked ? <span className="text-[13px] font-bold text-[color:var(--wd-primary)]">✓</span> : null)}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-[14px]">{label(child.labelKey)}</span>{child.descKey ? <span className="block truncate text-[12px] text-slate-500">{label(child.descKey)}</span> : null}</span>
                {child.hint ? <span className="shrink-0 text-[12px] text-slate-500">{child.hint}</span> : null}
              </button>
            ))}
          </div>
        );
      })() : null}
    </div>,
    document.body
  );
}
