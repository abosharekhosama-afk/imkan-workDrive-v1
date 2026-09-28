"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "./locale-provider";
import { persistViewMode, type ViewMode } from "./view-mode-logic";
import { Icons } from "./layout/icons";

const CARD_CLASS = [
  "absolute top-full z-[90] mt-1.5 min-w-52",
  "rounded-[var(--wd-menu-radius)] bg-white",
  "border border-slate-200/80 shadow-[var(--wd-menu-shadow)]",
].join(" ");

const VIEW_OPTIONS = [
  ["list", "view.list", Icons.list] as const,
  ["compact", "view.compact", Icons.compact] as const,
  ["grid", "view.grid", Icons.grid] as const,
];

export function ViewModePicker({
  view,
  onView,
  align = "end",
  className = "",
}: {
  view: ViewMode;
  onView: (v: ViewMode) => void;
  align?: "start" | "end";
  className?: string;
}) {
  const { label } = useLocale();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(next: ViewMode) {
    onView(next);
    setOpen(false);
    try {
      persistViewMode(window.localStorage, next);
    } catch {
      /* noop */
    }
  }

  const activeIcon =
    view === "grid" ? <Icons.grid size={15} /> : view === "compact" ? <Icons.compact size={15} /> : <Icons.list size={15} />;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`wd-icon-btn ${open ? "bg-[var(--wd-active)] text-[color:var(--wd-primary-ink)]" : ""}`}
        title={label("view.toggle")}
        aria-label={label("view.toggle")}
      >
        {activeIcon}
      </button>
      {open ? (
        <div className={`${CARD_CLASS} ${align === "end" ? "end-0" : "start-0"} w-48 p-1`} role="menu">
          {VIEW_OPTIONS.map(([mode, key, Icon]) => (
            <button
              key={mode}
              type="button"
              role="menuitem"
              onClick={() => pick(mode as ViewMode)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] text-start ${view === mode ? "bg-[var(--wd-menu-hover)] font-medium text-[color:var(--wd-primary-ink)]" : "text-slate-600 hover:bg-slate-50"}`}
            >
              <span className="w-4 shrink-0 text-[color:var(--wd-primary)]">
                <Icon size={15} />
              </span>
              <span className="flex-1">{label(key as never)}</span>
              {view === mode ? <Icons.check size={13} className="text-[color:var(--wd-primary)]" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
