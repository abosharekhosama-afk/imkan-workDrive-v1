"use client";

import { useEffect } from "react";

export function Toast({ message, onDismiss, tone = "success" }: { message: string; onDismiss: () => void; tone?: "success" | "error" | "info" }) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 4200);
    return () => window.clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className={`zoho-operation-toast zoho-operation-toast--${tone}`} role="status" aria-live="polite">
      <span className="zoho-operation-toast__icon" aria-hidden="true">
        {tone === "success" ? "✓" : tone === "error" ? "!" : "i"}
      </span>
      <span className="zoho-operation-toast__message">{message}</span>
      <button type="button" className="zoho-operation-toast__close" onClick={onDismiss} aria-label="Close">×</button>
    </div>
  );
}
