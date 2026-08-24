"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties } from "react";

export type ActionDropdownItem = {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
};

export function ActionDropdown({ label, items }: { label: string; items: ActionDropdownItem[] }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open || !buttonRef.current || !menuRef.current) return;
    const button = buttonRef.current;
    const menu = menuRef.current;
    const rect = button.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const isRTL = document.documentElement.dir === "rtl";

    const style = menu.style as CSSProperties;
    style.position = "fixed";
    style.top = `${rect.bottom + 4}px`;

    if (isRTL) {
      // In RTL, align menu's right edge with button's right edge
      style.right = `${viewportWidth - rect.right}px`;
      style.left = "auto";
    } else {
      // In LTR, align menu's right edge with button's right edge
      style.left = `${rect.left - menuRect.width + rect.width}px`;
      style.right = "auto";
    }

    // Keep within viewport horizontally
    if (!isRTL) {
      const left = parseInt(style.left as string, 10);
      if (left + menuRect.width > viewportWidth) {
        style.left = `${viewportWidth - menuRect.width - 8}px`;
      }
      if (left < 8) {
        style.left = "8px";
      }
    } else {
      const right = parseInt(style.right as string, 10);
      if (right + menuRect.width > viewportWidth) {
        style.right = `${viewportWidth - menuRect.width - 8}px`;
      }
      if (right < 8) {
        style.right = "8px";
      }
    }

    // Flip up if not enough space below
    if (rect.bottom + menuRect.height + 4 > viewportHeight) {
      style.top = `${rect.top - menuRect.height - 4}px`;
    }
  }, [open]);

  const button = (
    <button
      ref={buttonRef}
      type="button"
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label={label}
      className="imkan-button-secondary"
      onClick={() => setOpen((value) => !value)}
    >
      <span aria-hidden="true">⋯</span>
    </button>
  );

  const menu = open ? (
    <div
      ref={menuRef}
      role="menu"
      className="imkan-panel z-50 min-w-40 p-1 shadow-lg"
      style={{ minWidth: "160px" }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className={`block w-full px-3 py-2 text-start text-[length:var(--imkan-font-size-secondary)] hover:bg-background ${
            item.destructive ? "text-red-600" : ""
          }`}
          onClick={() => {
            setOpen(false);
            item.onSelect();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  ) : null;

  return (
    <>
      {button}
      {menu && createPortal(menu, document.body)}
    </>
  );
}
