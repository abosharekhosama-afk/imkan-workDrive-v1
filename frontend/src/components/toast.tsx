"use client";

import { useEffect } from "react";

export function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 4000);
    return () => window.clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div 
      role="status" 
      aria-live="polite" 
      className="imkan-alert fixed inset-inline-end-4 inset-block-end-4 z-[60] max-w-sm shadow-sm"
    >
      {message}
    </div>
  );
}
