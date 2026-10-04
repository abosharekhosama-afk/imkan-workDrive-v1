"use client";

import { useEffect, useState } from "react";
import { useLocale } from "./locale-provider";
import type { GlobalToastDetail } from "../lib/global-toast";

export function GlobalToastHost() {
  const { locale } = useLocale();
  const [toast, setToast] = useState<GlobalToastDetail | null>(null);

  useEffect(() => {
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<GlobalToastDetail>).detail;
      if (!detail?.message) return;
      setToast(detail);
      window.setTimeout(() => setToast((current) => current === detail ? null : current), detail.duration ?? 4200);
    };
    window.addEventListener("workdrive:toast", onToast);
    return () => window.removeEventListener("workdrive:toast", onToast);
  }, []);

  if (!toast) return null;
  const message = locale === "ar" && toast.messageAr ? toast.messageAr : toast.message;
  const tone = toast.tone ?? "success";
  return (
    <div className={`zoho-operation-toast zoho-operation-toast--${tone}`} role="status" aria-live="polite">
      <span className="zoho-operation-toast__icon" aria-hidden="true">{tone === "success" ? "✓" : tone === "error" ? "!" : "i"}</span>
      <span className="zoho-operation-toast__message">{message}</span>
      <button type="button" className="zoho-operation-toast__close" onClick={() => setToast(null)} aria-label="Close">×</button>
    </div>
  );
}
