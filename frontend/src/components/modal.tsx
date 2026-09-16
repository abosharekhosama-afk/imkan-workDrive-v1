"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { isModalDismissKey } from "./modal-logic";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  closeLabel?: string;
}

export function Modal({ title, onClose, children, footer, closeLabel }: ModalProps) {
  const titleId = useId();
  const surfaceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const surface = surfaceRef.current;
    const focusable = () => {
      const nodes = surface?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      return nodes ? Array.from(nodes) : [];
    };
    
    const first = focusable()[0];
    (first ?? surface)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (isModalDismissKey(event.key)) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      if (elements.length === 0) {
        event.preventDefault();
        surface?.focus();
        return;
      }
      const current = document.activeElement;
      const index = elements.indexOf(current as HTMLElement);
      const next = event.shiftKey
        ? (index <= 0 ? elements[elements.length - 1] : elements[index - 1])
        : (index === elements.length - 1 ? elements[0] : elements[index + 1]);
      
      if (index === -1 || next) {
        event.preventDefault();
        next?.focus();
      }
    };

    surface?.addEventListener("keydown", onKeyDown);
    return () => {
      surface?.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [onClose]);

  return (
    <div 
      className="imkan-modal-backdrop z-50 p-4" 
      role="presentation" 
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div 
        ref={surfaceRef} 
        tabIndex={-1} 
        role="dialog" 
        aria-modal="true" 
        aria-labelledby={titleId} 
        className="imkan-modal-surface max-h-[90vh] overflow-y-auto rounded-sm flex flex-col"
      >
        <div className="flex items-center justify-between border-b border-[color:var(--imkan-color-border)] px-4 py-3">
          <h2 id={titleId} className="imkan-heading text-base font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="zoho-icon-btn"
            aria-label={closeLabel || "Close"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        
        <div className="p-4 flex-1">
          {children}
        </div>

        {footer && (
          <div className="flex justify-end gap-2 border-t border-[color:var(--imkan-color-border)] px-4 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}