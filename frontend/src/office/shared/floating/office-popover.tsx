'use client';

import { useRef, type ReactNode } from 'react';
import { OfficeFloatingLayer } from './office-floating-layer';
import type { FloatingPlacement } from './office-floating-logic';
import type { OfficeZLayer } from './office-z-index';

type OfficePopoverProps = {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  placement?: FloatingPlacement;
  zLayer?: OfficeZLayer;
  className?: string;
  children: ReactNode;
};

export function OfficePopover({
  open,
  onClose,
  anchorRef,
  placement = 'bottom-start',
  zLayer = 'POPOVER',
  className = '',
  children,
}: OfficePopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  return (
    <OfficeFloatingLayer
      open={open}
      anchorEl={anchorRef.current}
      onClose={onClose}
      placement={placement}
      zLayer={zLayer}
    >
      <div ref={panelRef} className={`office-popover rounded-md border border-[#dadde0] bg-white shadow-[0_5px_18px_rgba(0,0,0,.15)] ${className}`}>
        {children}
      </div>
    </OfficeFloatingLayer>
  );
}
