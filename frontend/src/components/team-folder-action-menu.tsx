"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function TeamFolderActionMenu({ open, anchorEl, onClose, children }: {
  open: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; start: number } | null>(null);

  useEffect(() => {
    if (!open || !anchorEl) {
      setPos(null);
      return;
    }
    const place = () => {
      const rect = anchorEl.getBoundingClientRect();
      const width = 180;
      const isRtl = document.documentElement.dir === "rtl";
      let start = isRtl ? rect.left : rect.right - width;
      start = Math.min(Math.max(8, start), window.innerWidth - width - 8);
      setPos({ top: rect.bottom + 6, start });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, anchorEl]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (ref.current?.contains(target)) return;
      if (anchorEl?.contains(target)) return;
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
  }, [open, onClose, anchorEl]);

  if (!open || !pos) return null;

  const rtl = typeof document !== "undefined" && document.documentElement.dir === "rtl";
  const style: React.CSSProperties = {
    top: pos.top,
    width: 180,
    ...(rtl ? { right: Math.max(8, window.innerWidth - pos.start - 180) } : { left: pos.start }),
  };

  return createPortal(
    <div ref={ref} role="menu" dir={rtl ? "rtl" : "ltr"} data-team-folder-menu className="team-folder-menu team-folder-menu--portal fixed z-[160]" style={style}>
      {children}
    </div>,
    document.body,
  );
}
