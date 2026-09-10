"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "../locale-provider";
import type { MessageKey } from "../../i18n";
export type MenuItem = {
  key: string;
  labelKey: MessageKey;
  hint?: string;
  danger?: boolean;
  checked?: boolean;
  disabled?: boolean;
};
export function ZohoMenu({ open, onClose, onSelect, items, labelledBy, align = "start", width = "w-56" }: {
  open: boolean; onClose: () => void; onSelect: (key: string) => void;
  items: Array<MenuItem | "sep" | { header: MessageKey }>; labelledBy: string;
  align?: "start" | "end"; width?: string;
}) {
  const { label } = useLocale();
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; start: number } | null>(null);
  const anchorRef = useRef<Element | null>(null);
  useEffect(() => {
    if (!open) { setPos(null); anchorRef.current = null; return; }
    const el = document.getElementById(labelledBy);
    anchorRef.current = el;
    const place = () => {
      const r = el?.getBoundingClientRect();
      if (!r) return;
      const rtl = document.documentElement.dir === "rtl";
      const menuW = 240;
      let start = align === "end" ? r.right - menuW : r.left;
      if (!rtl) start = Math.min(Math.max(8, start), window.innerWidth - menuW - 8);
      else start = Math.min(Math.max(8, start), window.innerWidth - menuW - 8);
      setPos({ top: r.bottom + 6, start });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open, labelledBy, align]);
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
  const style: React.CSSProperties = { top: pos.top, ...(rtl ? { right: Math.max(8, window.innerWidth - pos.start - 240) } : { left: pos.start }) };
  return createPortal(
    <div ref={ref} role="menu" aria-labelledby={labelledBy} style={style}
      className={`fixed z-[90] ${width} overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-[0_12px_32px_rgba(16,24,40,0.16)]`}>
      {items.map((it, i) => {
        if (it === "sep") return <div key={`sep-${i}`} className="mx-1 my-1 border-t border-slate-100" role="separator" />;
        if (typeof it === "object" && "header" in it) {
          return <div key={`h-${i}`} className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label(it.header)}</div>;
        }
        const m = it as MenuItem;
        return (
          <button key={m.key} type="button" role="menuitem" disabled={m.disabled}
            onClick={() => { onSelect(m.key); onClose(); }}
            className={`flex w-full items-center gap-2.5 px-3 py-2 text-start text-[13px] transition-colors disabled:opacity-40 ${m.danger ? "font-medium text-red-600 hover:bg-red-50" : "text-slate-700 hover:bg-[#EEF3FE] hover:text-[#1B66EA]"}`}>
            <span className="w-4 shrink-0 text-center text-[13px]" aria-hidden="true">{m.checked ? "✓" : ""}</span>
            <span className="min-w-0 flex-1 truncate">{label(m.labelKey)}</span>
            {m.hint ? <span className="shrink-0 text-[11px] text-slate-400">{m.hint}</span> : null}
          </button>
        );
      })}
    </div>,
    document.body
  );
}
