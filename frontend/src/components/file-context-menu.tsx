"use client";

// Right-click menu — same action set as the row ⋯ menu (Zoho parity).

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "./locale-provider";
import {
  buildUnifiedFileActionItems,
  type FileActionHandlers,
  type FileControlState,
} from "./file-actions-menu";
import type { ActionDropdownItem } from "./action-dropdown";
import type { RowActionContext } from "./file-row-actions-logic";
import { clampBoxLeft, readContentLane } from "../lib/overlay-bounds-logic";

export function FileContextMenu({
  handlers,
  onCopyLink,
  x,
  y,
  onClose,
  context,
  control,
}: {
  handlers: FileActionHandlers;
  onCopyLink?: () => void;
  x: number;
  y: number;
  onClose: () => void;
  /** Optional; defaults to a permissive file context so items follow handlers only. */
  context?: RowActionContext;
  control?: FileControlState;
}) {
  const { label, locale } = useLocale();
  const rtl = locale === "ar" || (typeof document !== "undefined" && document.documentElement.dir === "rtl");
  const ref = useRef<HTMLDivElement | null>(null);
  const [subKey, setSubKey] = useState<string | null>(null);
  const subTimer = useRef<number | null>(null);

  const rowContext: RowActionContext = context ?? {
    resourceType: "FILE",
    canMutate: true,
    canShare: Boolean(handlers.onShare),
    canFavorite: Boolean(handlers.onFavoriteToggle),
    isFavorite: handlers.isFavorite,
  };

  const flatItems = buildUnifiedFileActionItems({
    label: (k) => label(k as never),
    context: rowContext,
    handlers,
    onCopyLink,
    control,
  });

  // Group by dividerBefore into sections (same visual rhythm as ActionDropdown).
  const sections: ActionDropdownItem[][] = [];
  let current: ActionDropdownItem[] = [];
  for (const item of flatItems) {
    if (item.dividerBefore && current.length) {
      sections.push(current);
      current = [];
    }
    current.push(item);
  }
  if (current.length) sections.push(current);

  const openSubmenu = (key: string | null) => {
    if (subTimer.current) window.clearTimeout(subTimer.current);
    subTimer.current = window.setTimeout(() => setSubKey(key), key ? 80 : 120);
  };

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
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
  const estH = Math.min(420, sections.reduce((n, g) => n + g.length, 0) * 34 + sections.length * 2 + 24);
  const lane = readContentLane();
  const left = clampBoxLeft(x, menuW, lane);
  const vw = typeof window !== "undefined" ? window.innerHeight : 800;
  const top = Math.max(8, Math.min(y, vw - estH - 8));

  const node = (
    <div
      ref={ref}
      role="menu"
      dir={rtl ? "rtl" : "ltr"}
      className="wd-menu fixed z-[240] max-h-[min(70vh,420px)] w-64 overflow-y-auto overflow-x-visible shadow-lg"
      style={{ left, top, minWidth: menuW }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {sections.map((group, gi) => (
        <div key={gi} className={gi > 0 ? "border-t border-[color:var(--imkan-color-border)] pt-1" : ""}>
          {group.map((item) => {
            const hasSub = Boolean(item.submenu && item.submenu.length);
            const open = subKey === item.label;
            if (!hasSub) {
              return (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  data-danger={item.destructive || undefined}
                  className="wd-menu-item min-h-[34px] text-start"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    item.onSelect();
                    onClose();
                  }}
                >
                  {item.icon ? (
                    <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center">{item.icon}</span>
                  ) : (
                    <span className="w-5" />
                  )}
                  <span className="flex-1 truncate">{item.label}</span>
                </button>
              );
            }
            return (
              <div
                key={item.label}
                className="relative"
                onMouseEnter={() => openSubmenu(item.label)}
                onMouseLeave={() => openSubmenu(null)}
              >
                <button
                  type="button"
                  role="menuitem"
                  aria-haspopup="menu"
                  aria-expanded={open}
                  className="wd-menu-item min-h-[34px] text-start"
                  data-active={open || undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSubKey((k) => (k === item.label ? null : item.label));
                  }}
                >
                  {item.icon ? (
                    <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center">{item.icon}</span>
                  ) : (
                    <span className="w-5" />
                  )}
                  <span className="flex-1 truncate">{item.label}</span>
                  <span aria-hidden className={`text-[length:var(--imkan-font-size-secondary)] ${rtl ? "rotate-180" : ""}`}>
                    ›
                  </span>
                </button>
                {open ? (
                  <div
                    className={`wd-menu absolute top-0 z-[250] max-h-[min(60vh,360px)] min-w-[220px] overflow-y-auto shadow-lg ${rtl ? "end-full me-1" : "start-full ms-1"}`}
                    role="menu"
                  >
                    {item.submenu!.map((sub) => (
                      <button
                        key={sub.label}
                        type="button"
                        role="menuitem"
                        data-danger={sub.destructive || undefined}
                        className="wd-menu-item min-h-[34px] text-start"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          sub.onSelect();
                          onClose();
                        }}
                      >
                        {sub.icon ? (
                          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center">{sub.icon}</span>
                        ) : (
                          <span className="w-5" />
                        )}
                        <span className="flex-1 truncate">{sub.label}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );

  return typeof document !== "undefined" ? createPortal(node, document.body) : node;
}
