"use client";

import { useEffect, useId, useState } from "react";
import { useLocale } from "./locale-provider";
import { persistViewMode, type ViewMode } from "./view-mode-logic";
import { Icons } from "./layout/icons";
import { ToolbarAnchoredPanel } from "./layout/toolbar-anchored-panel";

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
  const buttonId = useId().replace(/:/g, "");

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
    <div className={className}>
      <button
        id={buttonId}
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
      <ToolbarAnchoredPanel open={open} onClose={() => setOpen(false)} anchorId={buttonId} align={align} width={192} className="p-1">
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
      </ToolbarAnchoredPanel>
    </div>
  );
}
