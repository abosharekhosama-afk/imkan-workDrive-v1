"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "../locale-provider";
import type { MessageKey } from "../../i18n";
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
};
export function ZohoMenu({ open, onClose, onSelect, items, labelledBy, align = "start", width = "w-56", widthPx }: {
  open: boolean; onClose: () => void; onSelect: (key: string) => void;
  items: Array<MenuItem | "sep" | { header: MessageKey }>; labelledBy: string;
  align?: "start" | "end"; width?: string; widthPx?: number;
}) {
  const { label } = useLocale();
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; start: number } | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const anchorRef = useRef<Element | null>(null);
  const menuW = widthPx ?? 240;
  useEffect(() => {
    if (!open) { setPos(null); setActiveKey(null); anchorRef.current = null; return; }
    const el = document.getElementById(labelledBy);
    anchorRef.current = el;
    const place = () => {
      const r = el?.getBoundingClientRect();
      if (!r) return;
      let start = align === "end" ? r.right - menuW : r.left;
      start = Math.min(Math.max(8, start), window.innerWidth - menuW - 8);
      setPos({ top: r.bottom + 4, start });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open, labelledBy, align, menuW]);
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
  const style: React.CSSProperties = {
    top: pos.top,
    width: menuW,
    ...(rtl ? { right: Math.max(8, window.innerWidth - pos.start - menuW) } : { left: pos.start }),
  };
  return createPortal(
    <div ref={ref} role="menu" aria-labelledby={labelledBy} style={style}
      className={`wd-menu fixed z-[90] ${widthPx ? "" : width} overflow-hidden`}>
      {items.map((it, i) => {
        if (it === "sep") return <div key={`sep-${i}`} className="wd-menu-sep" role="separator" />;
        if (typeof it === "object" && "header" in it) {
          return <div key={`h-${i}`} className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-[#4F4F4F]">{label(it.header)}</div>;
        }
        const m = it as MenuItem;
        const hasDesc = Boolean(m.descKey);
        return (
          <button key={m.key} type="button" role="menuitem" disabled={m.disabled}
            data-active={activeKey === m.key || undefined}
            data-danger={m.danger || undefined}
            onMouseEnter={() => setActiveKey(m.key)}
            onMouseLeave={() => setActiveKey((k) => (k === m.key ? null : k))}
            onClick={() => { onSelect(m.key); onClose(); }}
            className={`wd-menu-item disabled:opacity-40 ${hasDesc ? "min-h-[49px] py-2" : "min-h-[34px]"}`}>
            <span className="flex w-6 shrink-0 items-center justify-center" aria-hidden="true">
              {m.icon ?? (m.checked ? <span className="text-[13px]">✓</span> : null)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-normal leading-4">{label(m.labelKey)}</span>
              {m.descKey ? <span className="mt-0.5 block truncate text-[12px] font-normal leading-4 text-[#4F4F4F]">{label(m.descKey)}</span> : null}
            </span>
            {m.chevron ? <span className="shrink-0 text-[#4F4F4F]" aria-hidden="true">›</span> : null}
            {m.hint ? (
              <span className={m.hintPill ? "shrink-0 rounded-md bg-[#F3F5F7] px-1.5 py-0.5 text-[11px] font-medium text-[#4F4F4F]" : "shrink-0 text-[12px] text-[#4F4F4F]"}>{m.hint}</span>
            ) : null}
          </button>
        );
      })}
    </div>,
    document.body
  );
}
