'use client';

import { createPortal } from 'react-dom';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { officeZIndex } from './office-z-index';
import { useOfficeFloatingPosition } from './use-office-floating-position';
import { isOutsideFloatingLayer } from './office-floating-logic';
import type { FloatingPlacement } from './office-floating-logic';
import type { OfficeZLayer } from './office-z-index';

type OfficeFloatingLayerProps = {
  open: boolean;
  anchorEl: HTMLElement | null;
  onClose?: () => void;
  placement?: FloatingPlacement;
  offset?: number;
  zLayer?: OfficeZLayer;
  role?: string;
  ariaLabel?: string;
  restoreFocus?: boolean;
  closeOnOutsideClick?: boolean;
  closeOnEscape?: boolean;
  children: ReactNode;
};

export function OfficeFloatingLayer({
  open,
  anchorEl,
  onClose,
  placement = 'bottom-start',
  offset = 4,
  zLayer = 'POPOVER',
  role = 'dialog',
  ariaLabel,
  restoreFocus = true,
  closeOnOutsideClick = true,
  closeOnEscape = true,
  children,
}: OfficeFloatingLayerProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const labelId = useId();
  const [mounted, setMounted] = useState(false);
  const [layerEl, setLayerEl] = useState<HTMLDivElement | null>(null);
  const rect = useOfficeFloatingPosition(open, anchorEl, layerEl, placement, offset);
  const assignLayer = (node: HTMLDivElement | null) => {
    layerRef.current = node;
    setLayerEl((current) => (current === node ? current : node));
  };

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const timer = window.setTimeout(() => layerRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (closeOnEscape && event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose?.();
      }
    };
    const onMouseDown = (event: MouseEvent) => {
      if (!closeOnOutsideClick || !onClose) return;
      if (isOutsideFloatingLayer(event.target, layerRef.current, anchorEl)) onClose();
    };
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('mousedown', onMouseDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('mousedown', onMouseDown, true);
    };
  }, [open, onClose, closeOnEscape, closeOnOutsideClick, anchorEl]);

  useEffect(() => {
    if (open || !restoreFocus) return;
    previousFocus.current?.focus();
    previousFocus.current = null;
  }, [open, restoreFocus]);

  if (!mounted || !open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={assignLayer}
      role={role}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabel ? undefined : labelId}
      tabIndex={-1}
      className="office-floating-layer outline-none"
      style={{
        position: 'fixed',
        top: rect?.top ?? -9999,
        left: rect?.left ?? -9999,
        zIndex: officeZIndex(zLayer),
        visibility: rect ? 'visible' : 'hidden',
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
