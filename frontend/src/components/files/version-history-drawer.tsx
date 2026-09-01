"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useLocale } from "../locale-provider";
import { AlertBanner } from "../alert-banner";
import { EmptyState } from "../empty-state";
import { SkeletonLoader } from "../skeleton-loader";
import { OwnerCell } from "../owner-cell";
import { RestoreConfirmModal } from "../version-history/restore-confirm-modal";
import { ApiError } from "../../lib/api/client";
import {
  getVersionHistory,
  getVersionDownloadUrlById,
  restoreVersionById,
  type VersionRecord,
} from "../../lib/api/versions";
import { triggerDownload } from "../../lib/api/download";
import { formatBytes } from "../../lib/api/quota";

interface VersionHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  canWrite: boolean;
  /** Opens the parent preview experience; defaults to a signed-URL tab. */
  onPreviewVersion?: (version: VersionRecord) => void;
  /** Invoked after a successful restore so the caller can refresh listings. */
  onRestored?: () => void | Promise<void>;
}

/** Status badge tint per `VersionStatus` (server-authoritative value). */
const STATUS_BADGE_CLASS: Record<string, string> = {
  ACTIVE: "bg-emerald-500/10 text-emerald-700",
  SUPERSEDED: "bg-[color:var(--imkan-color-muted)]/10 text-[color:var(--imkan-color-muted)]",
  RESTORED: "bg-sky-500/10 text-sky-700",
  DELETED: "bg-[color:var(--imkan-color-error)]/10 text-[color:var(--imkan-color-error)]",
};

function formatDate(value: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

/**
 * Responsive sliding drawer (radix-sheet style) listing every version of a
 * file, newest first, with per-version Preview / Download / Restore actions.
 * Data is fetched live from `GET /files/:fileId/versions` so the drawer never
 * depends on stale parent state; restores create version N+1 re-pointing at
 * the historical storage object (zero data duplication, server-enforced).
 */
export function VersionHistoryDrawer({
  isOpen,
  onClose,
  fileId,
  fileName,
  mimeType,
  size,
  canWrite,
  onPreviewVersion,
  onRestored,
}: VersionHistoryDrawerProps) {
  void mimeType;
  void size;
  const { label, locale } = useLocale();
  const titleId = useId();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const previousActiveRef = useRef<HTMLElement | null>(null);
  const [versions, setVersions] = useState<VersionRecord[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<VersionRecord | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  // Two-phase mount so the slide-in transition actually plays.
  const [visible, setVisible] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setVersions(await getVersionHistory(fileId));
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 403
          ? label("error.forbidden")
          : label("versionHistory.loadError"),
      );
      setVersions([]);
    } finally {
      setIsLoading(false);
    }
  }, [fileId, label]);

  useEffect(() => {
    if (!isOpen) {
      setVisible(false);
      return;
    }
    previousActiveRef.current = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    void load();
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = "";
      previousActiveRef.current?.focus();
    };
  }, [isOpen, load]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const surface = surfaceRef.current;
      const focusable = () => {
        const nodes = surface?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        return nodes ? Array.from(nodes) : [];
      };
      const elements = focusable();
      if (elements.length === 0) {
        event.preventDefault();
        surface?.focus();
        return;
      }
      const current = document.activeElement;
      const index = elements.indexOf(current as HTMLElement);
      const next = event.shiftKey
        ? index <= 0
          ? elements[elements.length - 1]
          : elements[index - 1]
        : index === elements.length - 1
          ? elements[0]
          : elements[index + 1];
      if (index === -1 || next) {
        event.preventDefault();
        next?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);
  const handlePreview = async (version: VersionRecord) => {
    if (onPreviewVersion) {
      onPreviewVersion(version);
      return;
    }
    try {
      const signed = await getVersionDownloadUrlById(fileId, version.id);
      window.open(signed.download_url, "_blank", "noopener");
    } catch {
      setError(label("error.generic"));
    }
  };

  const handleDownload = async (version: VersionRecord) => {
    try {
      const signed = await getVersionDownloadUrlById(fileId, version.id);
      triggerDownload(signed.download_url, fileName);
    } catch {
      setError(label("error.generic"));
    }
  };

  const handleRestoreConfirm = async () => {
    if (!restoreTarget) return;
    setIsRestoring(true);
    setError(null);
    try {
      await restoreVersionById(fileId, restoreTarget.id);
      setRestoreTarget(null);
      await load();
      await onRestored?.();
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 403
          ? label("error.forbidden")
          : cause instanceof ApiError && cause.status === 401
            ? label("error.unauthenticated")
            : label("error.generic"),
      );
    } finally {
      setIsRestoring(false);
    }
  };

  if (!isOpen) return null;

  // The panel anchors to the inline end; the hidden slide offset follows the
  // document direction so RTL users get the same motion mirrored.
  const slideOutClass = locale === "ar" ? "-translate-x-full" : "translate-x-full";

  const statusText = (status: string) =>
    status === "ACTIVE"
      ? label("versionHistory.statusActive")
      : status === "RESTORED"
        ? label("versionHistory.statusRestored")
        : status === "SUPERSEDED"
          ? label("versionHistory.statusSuperseded")
          : status;

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${visible ? "opacity-100" : "opacity-0"}`}
      />
      <div
        ref={surfaceRef}
        tabIndex={-1}
        className={`absolute inset-y-0 end-0 flex w-full max-w-md flex-col overflow-y-auto bg-[color:var(--imkan-color-surface)] shadow-2xl transition-transform duration-200 ease-out ${visible ? "translate-x-0" : slideOutClass}`}
      >
        <div className="flex items-center justify-between border-b border-[color:var(--imkan-color-border)] px-4 py-3">
          <h2 id={titleId} className="imkan-heading truncate text-base font-semibold">
            {label("versionHistory.title").replace("{fileName}", fileName)}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="zoho-icon-btn shrink-0"
            aria-label={label("versionHistory.close")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-3 p-4" aria-busy={isLoading}>
          {error && (
            <AlertBanner
              message={error}
              action={
                <button type="button" className="imkan-button-secondary" onClick={() => setError(null)}>
                  {label("share.cancel")}
                </button>
              }
            />
          )}

          {isLoading ? (
            <SkeletonLoader />
          ) : !versions || versions.length === 0 ? (
            <EmptyState
              title={label("versionHistory.empty")}
              description={label("versionHistory.emptyDescription")}
            />
          ) : (
            <>
              <div className="text-sm text-[color:var(--imkan-color-muted)]">
                {label("versionHistory.totalVersions").replace("{count}", String(versions.length))}
              </div>
              <ul className="flex flex-col gap-3">
                {versions.map((version) => (
                  <li
                    key={version.id}
                    className={`rounded-sm border p-3 ${version.isCurrent ? "border-[color:var(--imkan-color-primary)] bg-[color:var(--imkan-color-primary)]/5" : "border-[color:var(--imkan-color-border)]"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm font-semibold">
                        v{version.versionNumber}
                      </span>
                      <span className={`imkan-badge ${STATUS_BADGE_CLASS[version.status] ?? ""}`}>
                        {statusText(version.status)}
                      </span>
                    </div>
                    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                      <dt className="text-[color:var(--imkan-color-muted)]">{label("versionHistory.date")}</dt>
                      <dd>{formatDate(version.createdAt, locale)}</dd>
                      <dt className="text-[color:var(--imkan-color-muted)]">{label("versionHistory.size")}</dt>
                      <dd>{formatBytes(version.size)}</dd>
                      <dt className="text-[color:var(--imkan-color-muted)]">{label("versionHistory.uploader")}</dt>
                      <dd className="min-w-0">
                        <OwnerCell
                          name={version.uploadedBy?.name ?? null}
                          email={version.uploadedBy?.email ?? null}
                          avatarUrl={version.uploadedBy?.avatarUrl ?? null}
                          compact
                        />
                      </dd>
                    </dl>
                    <p
                      className="mt-2 truncate font-mono text-xs text-[color:var(--imkan-color-muted)]"
                      title={version.sha256Hash}
                    >
                      {label("versionHistory.hash")}: {version.sha256Hash.slice(0, 16)}...
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="imkan-button-secondary text-sm"
                        onClick={() => void handlePreview(version)}
                        aria-label={`${label("versionHistory.preview")} v${version.versionNumber}`}
                      >
                        {label("versionHistory.preview")}
                      </button>
                      <button
                        type="button"
                        className="imkan-button-secondary text-sm"
                        onClick={() => void handleDownload(version)}
                        aria-label={`${label("versionHistory.download")} v${version.versionNumber}`}
                      >
                        {label("versionHistory.download")}
                      </button>
                      {canWrite && !version.isCurrent ? (
                        <button
                          type="button"
                          className="imkan-button-secondary text-sm"
                          onClick={() => setRestoreTarget(version)}
                          aria-label={`${label("versionHistory.restore")} v${version.versionNumber}`}
                        >
                          {label("versionHistory.restore")}
                        </button>
                      ) : canWrite && version.isCurrent ? (
                        <span className="text-xs text-[color:var(--imkan-color-muted)]">
                          {label("versionHistory.currentVersionNoRestore")}
                        </span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {restoreTarget && (
        <RestoreConfirmModal
          versionNumber={restoreTarget.versionNumber}
          fileName={fileName}
          onConfirm={handleRestoreConfirm}
          onCancel={() => setRestoreTarget(null)}
        />
      )}
    </div>
  );
}
