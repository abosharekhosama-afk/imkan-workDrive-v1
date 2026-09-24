'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { OfficeFloatingLayer } from './office-floating-layer';
import { useOfficeFloatingPosition } from './use-office-floating-position';
import {
  flattenSelectableMenuItems,
  isSubmenuNode,
  menuItemByFlatIndex,
  submenuDirectionKey,
  type OfficeMenuNode,
} from './office-menu-logic';
import { officeZIndex } from './office-z-index';

type OfficeMenuProps = {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  items: OfficeMenuNode[];
  minWidth?: number;
};

function MenuRow({
  node,
  active,
  submenuOpen,
  onHover,
  onClick,
  itemRef,
}: {
  node: OfficeMenuNode;
  active: boolean;
  submenuOpen: boolean;
  onHover: () => void;
  onClick: () => void;
  itemRef: (el: HTMLButtonElement | null) => void;
}) {
  if (node.type === 'divider') return <div className="my-1 h-px bg-[#e8eaed]" />;
  const arrow = node.type === 'submenu';
  return (
    <button
      ref={itemRef}
      type="button"
      disabled={node.disabled}
      onMouseEnter={onHover}
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-6 px-3 py-2 text-left text-[13px] ${active || submenuOpen ? 'bg-[#e8f5ed] text-[#0b9f4b]' : 'text-[#30343b] hover:bg-[#f3f5f7]'} disabled:text-[#a7a7a7]`}
    >
      <span>{node.label}</span>
      <span className="text-[11px] text-[#8b8f94]">{node.type === 'item' ? node.shortcut || '' : '›'}</span>
    </button>
  );
}

function SubmenuPortal({
  parentEl,
  items,
  onClose,
  onSelect,
}: {
  parentEl: HTMLElement | null;
  items: OfficeMenuNode[];
  onClose: () => void;
  onSelect: (fn: () => void) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const rect = useOfficeFloatingPosition(true, parentEl, panelRef.current, 'right-start', 0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || !parentEl) return null;
  return createPortal(
    <div
      ref={panelRef}
      role="menu"
      tabIndex={-1}
      className="office-submenu max-h-[min(70vh,520px)] min-w-[190px] overflow-auto rounded-md border border-[#dadde0] bg-white py-1 shadow-[0_5px_18px_rgba(0,0,0,.15)]"
      style={{ position: 'fixed', top: rect.top, left: rect.left, zIndex: officeZIndex('MENU') + 1 }}
    >
      {items.map((node) =>
        node.type === 'divider' ? (
          <div key={node.id} className="my-1 h-px bg-[#e8eaed]" />
        ) : (
          <button
            key={node.id}
            type="button"
            disabled={node.disabled}
            onClick={() => {
              if (node.type === 'item' && node.onSelect) onSelect(node.onSelect);
              if (node.type === 'submenu') return;
            }}
            className="flex w-full items-center justify-between gap-6 px-3 py-2 text-left text-[13px] text-[#30343b] hover:bg-[#f3f5f7] disabled:text-[#a7a7a7]"
          >
            <span>{node.label}</span>
            <span className="text-[11px] text-[#8b8f94]">{node.type === 'submenu' ? '›' : node.shortcut || ''}</span>
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}

export function OfficeMenu({ open, onClose, anchorRef, items, minWidth = 220 }: OfficeMenuProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [openSubmenuId, setOpenSubmenuId] = useState<string | null>(null);
  const itemRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setActiveIndex(0);
      setOpenSubmenuId(null);
    }
  }, [open]);

  const activate = useCallback(
    (node: OfficeMenuNode | undefined) => {
      if (!node || node.disabled) return;
      if (node.type === 'item' && node.onSelect) {
        node.onSelect();
        onClose();
        return;
      }
      if (node.type === 'submenu') setOpenSubmenuId(node.id);
    },
    [onClose],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const selectable = flattenSelectableMenuItems(items);
    if (!selectable.length) return;
    if (event.key === 'Escape') {
      if (openSubmenuId) {
        event.preventDefault();
        setOpenSubmenuId(null);
        return;
      }
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % selectable.length);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => (i - 1 + selectable.length) % selectable.length);
      return;
    }
    const dir = submenuDirectionKey(event.key);
    const node = menuItemByFlatIndex(items, activeIndex);
    if (dir === 'open' && isSubmenuNode(node)) {
      event.preventDefault();
      setOpenSubmenuId(node.id);
      return;
    }
    if (dir === 'close' && openSubmenuId) {
      event.preventDefault();
      setOpenSubmenuId(null);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      activate(node);
    }
  };

  const activeNode = menuItemByFlatIndex(items, activeIndex);
  const submenuNode = openSubmenuId ? items.find((x) => x.type === 'submenu' && x.id === openSubmenuId) : null;
  const submenuItems = submenuNode?.type === 'submenu' ? submenuNode.items : [];

  return (
    <OfficeFloatingLayer open={open} anchorEl={anchorRef.current} onClose={onClose} placement="bottom-start" zLayer="MENU">
      <div
        ref={panelRef}
        role="menu"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="office-menu max-h-[min(70vh,520px)] overflow-auto rounded-md border border-[#dadde0] bg-white py-1 shadow-[0_5px_18px_rgba(0,0,0,.15)] outline-none"
        style={{ minWidth }}
      >
        {items.map((node, index) => {
          const flatIdx = flattenSelectableMenuItems(items).findIndex((x) => x.id === node.id);
          const active = flatIdx === activeIndex;
          return (
            <MenuRow
              key={node.id}
              node={node}
              active={active}
              submenuOpen={node.type === 'submenu' && openSubmenuId === node.id}
              itemRef={(el) => itemRefs.current.set(node.id, el)}
              onHover={() => {
                if (flatIdx >= 0) setActiveIndex(flatIdx);
                if (node.type === 'submenu') setOpenSubmenuId(node.id);
                else setOpenSubmenuId(null);
              }}
              onClick={() => activate(node)}
            />
          );
        })}
      </div>
      {submenuNode?.type === 'submenu' ? (
        <SubmenuPortal
          parentEl={itemRefs.current.get(submenuNode.id) ?? null}
          items={submenuItems}
          onClose={() => setOpenSubmenuId(null)}
          onSelect={(fn) => {
            fn();
            onClose();
          }}
        />
      ) : null}
    </OfficeFloatingLayer>
  );
}

export function officeMenuItem(
  id: string,
  label: string,
  onSelect?: () => void,
  shortcut?: string,
  disabled = false,
): OfficeMenuNode {
  return { type: 'item', id, label, shortcut, disabled, onSelect };
}

export function officeMenuDivider(id: string): OfficeMenuNode {
  return { type: 'divider', id };
}

export function officeSubmenu(id: string, label: string, items: OfficeMenuNode[], disabled = false): OfficeMenuNode {
  return { type: 'submenu', id, label, disabled, items };
}
