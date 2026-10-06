"use client";

import { useCallback, useState } from "react";
import { useLocale } from "./locale-provider";

export type ConfirmActionTone = "primary" | "danger";

export function ConfirmActionModal({
  title,
  description,
  confirmLabel,
  cancelLabel,
  onClose,
  onConfirm,
  tone = "primary",
  reasonLabel,
  minReasonLength = 0,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  onClose: () => void;
  onConfirm: (reason?: string) => Promise<void>;
  tone?: ConfirmActionTone;
  reasonLabel?: string;
  minReasonLength?: number;
}) {
  const { locale } = useLocale();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const cancel = cancelLabel ?? (locale === "ar" ? "إلغاء" : "Cancel");

  const confirm = async () => {
    if (busy) return;
    if (reasonLabel && reason.trim().length < minReasonLength) {
      setError(locale === "ar" ? "السبب قصير جداً." : "The reason is too short.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reasonLabel ? reason.trim() : undefined);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (locale === "ar" ? "تعذر تنفيذ العملية." : "The operation could not be completed."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="zoho-confirm-backdrop"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}
    >
      <div className="zoho-confirm-card" role="dialog" aria-modal="true" aria-labelledby="zoho-confirm-title">
        <div className="zoho-confirm-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {tone === "danger" ? <><path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.3 3.5 2.7 17a2 2 0 0 0 1.75 3h15.1a2 2 0 0 0 1.75-3L13.7 3.5a2 2 0 0 0-3.4 0Z" /></> : <><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.2 2.2 4.8-5" /></>}
          </svg>
        </div>
        <h2 id="zoho-confirm-title" className="zoho-confirm-title">{title}</h2>
        <p className="zoho-confirm-description">{description}</p>
        {reasonLabel ? <label className="zoho-confirm-reason"><span>{reasonLabel}</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} /></label> : null}
        {error ? <div className="zoho-confirm-error" role="alert">{error}</div> : null}
        <div className="zoho-confirm-actions">
          <button type="button" className="zoho-confirm-cancel" onClick={onClose} disabled={busy}>{cancel}</button>
          <button type="button" className={`zoho-confirm-primary ${tone === "danger" ? "is-danger" : ""}`} onClick={() => void confirm()} disabled={busy}>
            {busy ? (locale === "ar" ? "جارٍ التنفيذ…" : "Working…") : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export type ConfirmRequest = {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: ConfirmActionTone;
  reasonLabel?: string;
  minReasonLength?: number;
  run: (reason?: string) => Promise<void> | void;
};

export function useConfirmAction() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const requestConfirm = useCallback((next: ConfirmRequest) => setRequest(next), []);
  const confirmModal = request ? (
    <ConfirmActionModal
      title={request.title}
      description={request.description}
      confirmLabel={request.confirmLabel}
      cancelLabel={request.cancelLabel}
      tone={request.tone ?? "danger"}
      reasonLabel={request.reasonLabel}
      minReasonLength={request.minReasonLength}
      onClose={() => setRequest(null)}
      onConfirm={async (reason) => { await request.run(reason); }}
    />
  ) : null;
  return { requestConfirm, confirmModal };
}
