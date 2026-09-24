'use client';

import { createPortal } from 'react-dom';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { officeZIndex } from './office-z-index';

type OfficeModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
};

export function OfficeModal({ open, onClose, title, children }: OfficeModalProps) {
  const [mounted, setMounted] = useState(false);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose]);

  useEffect(() => {
    if (open) return;
    previousFocus.current?.focus();
    previousFocus.current = null;
  }, [open]);

  if (!mounted || !open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="office-modal fixed inset-0 flex items-center justify-center bg-black/35 p-4"
      style={{ zIndex: officeZIndex('MODAL') }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-label={title} className="office-modal-panel max-h-[90vh] w-full max-w-lg overflow-auto rounded-lg border border-[#dadde0] bg-white shadow-[0_16px_48px_rgba(0,0,0,.22)]">
        {title ? <div className="border-b px-4 py-3 text-[15px] font-semibold text-[#202428]">{title}</div> : null}
        <div className="p-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
