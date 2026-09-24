'use client';

import { useRef, type ReactNode } from 'react';
import { OfficeFloatingLayer } from './office-floating-layer';
import type { FloatingPlacement } from './office-floating-logic';

type OfficeDropdownProps = {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  placement?: FloatingPlacement;
  minWidth?: number;
  children: ReactNode;
};

export function OfficeDropdown({
  open,
  onClose,
  anchorRef,
  placement = 'bottom-start',
  minWidth = 190,
  children,
}: OfficeDropdownProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  return (
    <OfficeFloatingLayer open={open} anchorEl={anchorRef.current} onClose={onClose} placement={placement} zLayer="MENU">
      <div
        ref={panelRef}
        className="office-dropdown max-h-[min(70vh,520px)] overflow-auto rounded-md border border-[#dadde0] bg-white py-1 shadow-[0_5px_18px_rgba(0,0,0,.15)]"
        style={{ minWidth }}
      >
        {children}
      </div>
    </OfficeFloatingLayer>
  );
}
