"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "./locale-provider";
import {
  formatUploadSize,
  queueProgress,
  uploadQueueOutcome,
  type UploadQueueItem,
} from "./upload-queue-logic";

/** Grace period before the toast dismisses itself after COMPLETED. */
export const UPLOAD_TOAST_DISMISS_MS = 3000;

interface UploadProgressToastProps {
  items: UploadQueueItem[];
  onClearCompleted: () => void;
  onRetry: (item: UploadQueueItem) => void;
  onRemove: (id: string) => void;
}

/**
 * Floating bottom-right upload progress toast with live per-file and overall
 * percentage. Auto-closes 3000ms after every upload reaches COMPLETED; failed
 * rows stay pinned (with retry) until manually dismissed.
 */
export function UploadProgressToast({ items, onClearCompleted, onRetry, onRemove }: UploadProgressToastProps) {
  const { label } = useLocale();
  const [closing, setClosing] = useState(false);

  const outcome = uploadQueueOutcome(items);
  const settled = outcome !== "running";
  const percent = queueProgress(items);
  const clearRef = useRef(onClearCompleted);
  clearRef.current = onClearCompleted;
  const signature = items.map((item) => `${item.id}:${item.status}`).join("|");

  // Auto-dismiss once every file completed. Parent re-renders must not reset the timer.
  useEffect(() => {
    if (outcome !== "success") {
      setClosing(false);
      return;
    }
    const fadeHandle = window.setTimeout(() => setClosing(true), UPLOAD_TOAST_DISMISS_MS - 600);
    const closeHandle = window.setTimeout(() => {
      setClosing(false);
      clearRef.current();
    }, UPLOAD_TOAST_DISMISS_MS);
    return () => {
      window.clearTimeout(fadeHandle);
      window.clearTimeout(closeHandle);
    };
  }, [outcome, signature]);

  if (items.length === 0) return null;

  return (
    <aside
      className={`zoho-upload-toast${closing ? " closing" : ""}`}
      role="status"
      aria-live="polite"
      aria-label={label("upload.progressTitle")}
    >
      <header className="zoho-upload-head">
        <strong>{outcome === "partial" ? label("upload.completedWithErrors") : outcome === "failed" ? label("upload.failed") : outcome === "success" ? label("upload.allDone") : label("upload.progressTitle")}</strong>
        {settled ? (
          <button type="button" className="zoho-icon-btn sm" onClick={() => { setClosing(false); onClearCompleted(); }} aria-label={label("upload.dismiss")}>✕</button>
        ) : (
          <span className="zoho-upload-percent">{percent}%</span>
        )}
      </header>
      <div className="zoho-upload-bar" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <span className={`zoho-upload-fill${settled ? " done" : ""}`} style={{ width: `${percent}%` }} />
      </div>
      <ul className="zoho-upload-list">
        {items.map((item) => (
          <li key={item.id} className={`zoho-upload-row ${item.status}`}>
            <div className="zoho-upload-info">
              <span className="zoho-upload-name" title={item.file.name}>{item.file.name}</span>
              <small>{formatUploadSize(item.file.size)}</small>
            </div>
            {item.status === "failed" ? (
              <>
                <span className="zoho-upload-state err">{item.error ?? label("upload.failed")}</span>
                <button type="button" className="wd-btn wd-btn-ghost wd-btn-sm" onClick={() => onRetry(item)}>{label("upload.retry")}</button>
              </>
            ) : (
              <span className="zoho-upload-state">{item.status === "completed" ? `✓ ${label("upload.completed")}` : `${item.progress ?? 0}%`}</span>
            )}
            {item.status !== "processing" ? (
              <button type="button" className="zoho-icon-btn sm" onClick={() => onRemove(item.id)} aria-label={label("upload.remove")}>✕</button>
            ) : null}
          </li>
        ))}
      </ul>
    </aside>
  );
}
