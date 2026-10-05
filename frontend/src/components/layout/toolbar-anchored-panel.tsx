"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { clampBoxLeft, readContentLane } from "../../lib/overlay-bounds-logic";

type Props = {
  open: boolean;
  onClose: () => void;
  anchorId: string;
  align?: "start" | "end";
  width?: number;
  className?: string;
  children: ReactNode;
};

export function ToolbarAnchoredPanel({ open, onClose, anchorId, align = "end", width = 240, className = "", children }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const anchorRef = useRef<Element | null>(null);
  const [pos, setPos] = useState<{ top: number; start: number } | null>(null);

  useEffect(() => {
    if (!open) {
      setPos(null);
      anchorRef.current = null;
      return;
    }
    const el = document.getElementById(anchorId);
    anchorRef.current = el;
    const place = () => {
      const rect = el?.getBoundingClientRect();
      if (!rect) return;
      const isRtl = document.documentElement.dir === "rtl";
      let start = align === "end"
        ? (isRtl ? rect.left : rect.right - width)
        : (isRtl ? rect.right - width : rect.left);
      start = clampBoxLeft(start, width, readContentLane());
      setPos({ top: rect.bottom + 6, start });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, anchorId, align, width]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      if (ref.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      // Nested portaled pickers/menus opened from inside the panel
      if (target.closest('[role="menu"], .wd-menu, [data-toolbar-panel], .imkan-option-picker-menu, [data-imkan-picker]')) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || !pos) return null;

  const rtl = typeof document !== "undefined" && document.documentElement.dir === "rtl";
  const style: React.CSSProperties = {
    position: "fixed",
    top: pos.top,
    width,
    maxHeight: Math.max(160, window.innerHeight - pos.top - 8),
    overflowY: "auto",
    ...(rtl ? { right: Math.max(8, window.innerWidth - pos.start - width) } : { left: pos.start }),
  };

  return createPortal(
    <div
      ref={ref}
      data-toolbar-panel=""
      role="menu"
      style={style}
      className={`z-[120] rounded-[var(--wd-menu-radius)] border border-slate-200/80 bg-white shadow-[var(--wd-menu-shadow)] ${className}`.trim()}
    >
      {children}
    </div>,
    document.body,
  );
}
