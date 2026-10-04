"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverPortal,
} from "@radix-ui/react-popover";
import { useLocale } from "./locale-provider";
import { placeCardInScrollFrame, placeFloatingMenu, readContentLane } from "../lib/overlay-bounds-logic";

export type ActionDropdownItem = {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
  icon?: React.ReactNode;
  dividerBefore?: boolean;
  submenu?: ActionDropdownItem[];
};

interface ActionGroup {
  label?: string;
  items: ActionDropdownItem[];
}

interface ActionDropdownProps {
  label: string;
  items: ActionDropdownItem[];
  trigger?: React.ReactNode;
  zIndex?: number;
}

const actionIcons: Record<string, React.ReactNode> = {
  "تنزيل": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>,
  "Download": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>,
  "إعادة تسمية": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /><path d="m15 5 4 4" /></svg>,
  "Rename": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /><path d="m15 5 4 4" /></svg>,
  "نقل": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 9l7-7 7 7" /><path d="M12 2v20" /><path d="M3 5h18" /><path d="M3 19h18" /></svg>,
  "Move": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 9l7-7 7 7" /><path d="M12 2v20" /><path d="M3 5h18" /><path d="M3 19h18" /></svg>,
  "مشاركة": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></svg>,
  "Share": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></svg>,
  "حذف": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>,
  "Delete": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>,
  "نسخ": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>,
  "Copy": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>,
  "إضافة إلى المفضلة": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>,
  "Add to favorites": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>,
  "إزالة من المفضلة": <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>,
  "Remove from favorites": <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>,
  "معاينة": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M2 3a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V3z" /><path d="M9 9h6" /><path d="M9 13h6" /><path d="M9 17h6" /></svg>,
  "Preview": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M2 3a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V3z" /><path d="M9 9h6" /><path d="M9 13h6" /><path d="M9 17h6" /></svg>,
  "سجل الإصدارات": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M12 1v6" /><path d="M12 17v6" /><path d="M4.93 4.93l4.24 4.24" /><path d="M14.83 14.83l4.24 4.24" /><path d="M2 12h6" /><path d="M16 12h6" /></svg>,
  "Version History": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M12 1v6" /><path d="M12 17v6" /><path d="M4.93 4.93l4.24 4.24" /><path d="M14.83 14.83l4.24 4.24" /><path d="M2 12h6" /><path d="M16 12h6" /></svg>,
  "عرض التفاصيل": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 8h.01" /><path d="M11 12h1v4h1" /></svg>,
  "View details": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 8h.01" /><path d="M11 12h1v4h1" /></svg>,
  "فتح": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>,
  "Open": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>,
};

function getIconForLabel(label: string): React.ReactNode | undefined {
  const base = label.replace(/\s*\([^)]*\)\s*$/, "").trim();
  return actionIcons[label] ?? actionIcons[base];
}

function groupItems(items: ActionDropdownItem[]): ActionGroup[] {
  const groups: ActionGroup[] = [];
  let currentGroup: ActionDropdownItem[] = [];

  items.forEach((item, index) => {
    if (item.dividerBefore && currentGroup.length > 0) {
      groups.push({ items: currentGroup });
      currentGroup = [];
    }
    currentGroup.push(item);
  });

  if (currentGroup.length > 0) {
    groups.push({ items: currentGroup });
  }

  return groups;
}

function fileTableHost(node: HTMLElement | null): HTMLElement | null {
  if (!node || node.closest(".zoho-preview-modal")) return null;
  const direct = node.closest(".wd-file-browser-body");
  if (direct instanceof HTMLElement) return direct;
  const browser = node.closest(".wd-file-browser");
  const body = browser?.querySelector(".wd-file-browser-body");
  return body instanceof HTMLElement ? body : null;
}

function tableStickyHeight(host: HTMLElement) {
  const head = host.querySelector("thead");
  return head instanceof HTMLElement ? head.offsetHeight : 0;
}

function tableContentHeight(host: HTMLElement) {
  let content = 0;
  for (const child of host.children) {
    if (!(child instanceof HTMLElement) || child.classList.contains("wd-menu")) continue;
    content = Math.max(content, child.offsetTop + child.offsetHeight);
  }
  return content;
}

function applyTableMenuPad(host: HTMLElement, pad: number) {
  const next = Math.max(0, Math.ceil(pad));
  host.dataset.wdMenuPad = String(next);
  host.style.paddingBottom = next > 0 ? `${next}px` : "";
}

function RenderItem({ item, close, rtl, zIndex, host, onSubPad }: { item: ActionDropdownItem; close: () => void; rtl: boolean; zIndex: number; host: HTMLElement | null; onSubPad: (pad: number) => void }) {
  const [subOpen, setSubOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const closeTimer = useRef<number | null>(null);
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);
  const place = () => {
    const node = anchorRef.current;
    if (!node || !item.submenu?.length) return;
    const rect = node.getBoundingClientRect();
    const height = item.submenu.length * 36 + 12;
    const anchor = { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom };
    if (host) {
      const frame = host.getBoundingClientRect();
      const placed = placeCardInScrollFrame({
        anchor,
        width: 220,
        height,
        frameTop: frame.top,
        frameBottom: frame.bottom,
        frameLeft: frame.left,
        frameRight: frame.right,
        scrollTop: host.scrollTop,
        scrollLeft: host.scrollLeft,
        stickyTop: tableStickyHeight(host),
        contentHeight: tableContentHeight(host),
        rtl,
        align: "side",
      });
      onSubPad(placed.scrollPadding);
      setBox(placed);
      return;
    }
    onSubPad(0);
    setBox(placeFloatingMenu({
      anchor,
      width: 220,
      height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      rtl,
    }));
  };
  const openSub = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    setSubOpen(true);
    place();
  };
  const scheduleClose = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setSubOpen(false), 160);
  };
  useEffect(() => {
    if (!subOpen) return;
    place();
    const onMove = () => place();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
      onSubPad(0);
    };
  }, [subOpen, rtl, host]);
  if (!item.submenu) {
    return (
        <button
          type="button"
          role="menuitem"
          data-danger={item.destructive || undefined}
          className="wd-menu-item min-h-[34px] text-start"
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            // Action items are commands, never navigation targets. Prevent the
            // browser/router from following an ancestor link and keep the
            // command isolated from the resource row. This is especially
            // important for Assign Workflow, whose picker must remain on the
            // current /files/... page while its API calls use /workflows.
            event.preventDefault();
            event.stopPropagation();
            item.onSelect();
            close();
          }}
        >
          {item.icon ?? getIconForLabel(item.label) ? (
            <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-current">
              {item.icon ?? getIconForLabel(item.label)}
            </span>
          ) : (
            <span className="w-5" />
          )}
          <span className="flex-1 truncate">{item.label}</span>
        </button>
    );
  }
  return (
    <div
      className="relative"
      onMouseEnter={openSub}
      onMouseLeave={scheduleClose}
    >
      <button
        ref={anchorRef}
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={subOpen}
        className="wd-menu-item min-h-[34px] text-start"
        data-active={subOpen || undefined}
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (subOpen) setSubOpen(false);
          else openSub();
        }}
      >
        {item.icon ?? getIconForLabel(item.label) ? (
          <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-current">
            {item.icon ?? getIconForLabel(item.label)}
          </span>
        ) : (
          <span className="w-5" />
        )}
        <span className="flex-1 truncate">{item.label}</span>
        <span aria-hidden="true" className="action-dropdown-submenu-chevron text-[length:var(--imkan-font-size-secondary)]">›</span>
      </button>
      {subOpen && box && typeof document !== "undefined" ? createPortal(
        <div
          className={`wd-menu action-submenu min-w-[220px] overflow-visible shadow-lg ${host ? "absolute" : "fixed"}`}
          role="menu"
          style={{ top: box.top, left: box.left, zIndex: zIndex + 20, width: 220 }}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseEnter={openSub}
          onMouseLeave={scheduleClose}
        >
          {item.submenu.map((sub) => (
            <RenderItem key={sub.label} item={sub} close={close} rtl={rtl} zIndex={zIndex + 20} host={host} onSubPad={onSubPad} />
          ))}
        </div>,
        host ?? document.body,
      ) : null}
    </div>
  );
}

function menuPanel(grouped: ActionGroup[], close: () => void, rtl: boolean, zIndex: number, host: HTMLElement | null, onSubPad: (pad: number) => void) {
  return grouped.map((group, groupIndex) => (
    <div key={groupIndex} className={groupIndex > 0 ? "border-t border-[color:var(--imkan-color-border)] pt-1" : ""}>
      {group.items.map((item) => (
        <RenderItem key={item.label} item={item} close={close} rtl={rtl} zIndex={zIndex} host={host} onSubPad={onSubPad} />
      ))}
    </div>
  ));
}

export function ActionDropdown({ label, items, trigger, zIndex = 200 }: ActionDropdownProps) {
  const { label: t, locale } = useLocale();
  const rtl = locale === "ar";
  const groupedItems = groupItems(items);
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const pads = useRef({ card: 0, sub: 0 });
  const hostRef = useRef<HTMLElement | null>(null);
  const [cardBox, setCardBox] = useState<{ top: number; left: number } | null>(null);
  const [menuHeight, setMenuHeight] = useState(0);
  const host = open ? fileTableHost(anchorRef.current) : null;
  hostRef.current = host;
  const collisionPadding = typeof window === "undefined"
    ? 16
    : (() => {
        const lane = readContentLane();
        return { top: 8, bottom: 8, left: lane.left, right: Math.max(8, window.innerWidth - lane.right) };
      })();

  const publishPad = (nextHost: HTMLElement | null) => {
    if (!nextHost) return;
    applyTableMenuPad(nextHost, Math.max(pads.current.card, pads.current.sub));
  };
  const onSubPad = (pad: number) => {
    pads.current.sub = pad;
    publishPad(hostRef.current);
  };

  useLayoutEffect(() => {
    if (!open || !host || !anchorRef.current) {
      if (hostRef.current && !open) {
        pads.current = { card: 0, sub: 0 };
        applyTableMenuPad(hostRef.current, 0);
      }
      return;
    }
    const place = () => {
      const node = anchorRef.current;
      const frameHost = hostRef.current;
      if (!node || !frameHost) return;
      const rect = node.getBoundingClientRect();
      const height = menuHeight || menuRef.current?.offsetHeight || items.length * 36 + 28;
      const frame = frameHost.getBoundingClientRect();
      const placed = placeCardInScrollFrame({
        anchor: { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom },
        width: 252,
        height,
        frameTop: frame.top,
        frameBottom: frame.bottom,
        frameLeft: frame.left,
        frameRight: frame.right,
        scrollTop: frameHost.scrollTop,
        scrollLeft: frameHost.scrollLeft,
        stickyTop: tableStickyHeight(frameHost),
        contentHeight: tableContentHeight(frameHost),
        rtl,
        align: "end",
      });
      pads.current.card = placed.scrollPadding;
      publishPad(frameHost);
      setCardBox((current) => current && current.top === placed.top && current.left === placed.left ? current : { top: placed.top, left: placed.left });
    };
    place();
    const onMove = () => place();
    window.addEventListener("resize", onMove);
    host.addEventListener("scroll", onMove);
    return () => {
      window.removeEventListener("resize", onMove);
      host.removeEventListener("scroll", onMove);
    };
  }, [open, host, items.length, menuHeight, rtl]);

  useLayoutEffect(() => {
    const next = menuRef.current?.offsetHeight ?? 0;
    if (next && next !== menuHeight) setMenuHeight(next);
  }, [open, cardBox, items.length, menuHeight]);

  useEffect(() => {
    if (!open || !host) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    const onPointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (anchorRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, host]);

  const defaultTrigger = (
      <button
        type="button"
        aria-label={label}
        className="wd-icon-btn"
        aria-haspopup="menu"
        onClick={(event) => {
          // Stop resource-row navigation, but do NOT preventDefault:
          // Radix uses the trigger click's default behavior to toggle the popover.
          event.stopPropagation();
        }}
        onPointerDown={(event) => {
          // Keep the click inside the action control without cancelling the
          // default pointer behavior Radix needs for opening the popover.
          event.stopPropagation();
        }}
      >
        <span aria-hidden="true" className="text-[length:var(--imkan-font-size-ui)]">⋯</span>
      </button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <span ref={anchorRef} className="inline-flex">
        <PopoverTrigger asChild>{trigger ?? defaultTrigger}</PopoverTrigger>
      </span>
      {host ? (open && cardBox && typeof document !== "undefined" ? createPortal(
        <div
          ref={menuRef}
          role="menu"
          dir={rtl ? "rtl" : "ltr"}
          className="wd-menu absolute w-64 overflow-visible"
          style={{ top: cardBox.top, left: cardBox.left, minWidth: "252px", zIndex: 20 }}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          {menuPanel(groupedItems, () => setOpen(false), rtl, 4, host, onSubPad)}
        </div>,
        host,
      ) : null) : (
      <PopoverPortal>
        <PopoverContent
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          side="bottom"
          align={rtl ? "start" : "end"}
          dir={rtl ? "rtl" : "ltr"}
          sideOffset={4}
          collisionPadding={collisionPadding}
          avoidCollisions
          sticky="always"
          className="wd-menu w-64 overflow-visible"
          style={{ minWidth: "252px", zIndex }}
        >
          {menuPanel(groupedItems, () => setOpen(false), rtl, zIndex, null, onSubPad)}
        </PopoverContent>
      </PopoverPortal>
      )}
    </Popover>
  );
}