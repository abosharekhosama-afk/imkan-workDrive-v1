"use client";

import { useEffect, useState } from "react";

export type ActionDropdownItem = {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
};

export function ActionDropdown({ label, items }: { label: string; items: ActionDropdownItem[] }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);
  return (
    <div className="relative inline-block text-start">
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={label} className="imkan-button-secondary" onClick={() => setOpen((value) => !value)}>
        <span aria-hidden="true">⋯</span>
      </button>
      {open ? <div role="menu" className="imkan-panel absolute inset-inline-end-0 z-10 mt-1 min-w-40 p-1 shadow-sm">
        {items.map((item) => <button key={item.label} type="button" role="menuitem" className="block w-full px-3 py-2 text-start text-[length:var(--imkan-font-size-secondary)] hover:bg-background" onClick={() => { setOpen(false); item.onSelect(); }}>{item.label}</button>)}
      </div> : null}
    </div>
  );
}
