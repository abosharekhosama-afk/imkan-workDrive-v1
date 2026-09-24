'use client';

import { useRef, type ReactNode } from 'react';
import { OfficeFloatingLayer } from './office-floating-layer';

type OfficeContextMenuProps = {
  open: boolean;
  x: number;
  y: number;
  onClose: () => void;
  children: ReactNode;
};

export function OfficeContextMenu({ open, x, y, onClose, children }: OfficeContextMenuProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const virtualAnchor = useRef<HTMLDivElement | null>(null);

  if (typeof document !== 'undefined' && !virtualAnchor.current) {
    virtualAnchor.current = document.createElement('div');
    virtualAnchor.current.style.position = 'fixed';
    virtualAnchor.current.style.width = '1px';
    virtualAnchor.current.style.height = '1px';
    virtualAnchor.current.style.pointerEvents = 'none';
  }

  if (virtualAnchor.current) {
    virtualAnchor.current.style.top = `${y}px`;
    virtualAnchor.current.style.left = `${x}px`;
    if (open && !virtualAnchor.current.isConnected) document.body.appendChild(virtualAnchor.current);
    if (!open && virtualAnchor.current.isConnected) virtualAnchor.current.remove();
  }

  return (
    <OfficeFloatingLayer
      open={open}
      anchorEl={virtualAnchor.current}
      onClose={onClose}
      placement="bottom-start"
      zLayer="CONTEXT_MENU"
      offset={0}
    >
      <div
        ref={panelRef}
        className="office-context-menu min-w-[210px] overflow-auto rounded-md border border-[#dadde0] bg-white py-1 shadow-[0_8px_24px_rgba(0,0,0,.18)]"
      >
        {children}
      </div>
    </OfficeFloatingLayer>
  );
}
