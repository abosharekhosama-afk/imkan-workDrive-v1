"use client";

import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { useLocale } from "../locale-provider";
import { AlertBanner } from "../alert-banner";
import { EmptyState } from "../empty-state";
import { SkeletonLoader } from "../skeleton-loader";
import { OwnerCell } from "../owner-cell";
import { RestoreConfirmModal } from "../version-history/restore-confirm-modal";
import { FileTypeIcon, fileIconKind } from "../file-icon";
import { ApiError } from "../../lib/api/client";
import {
  getVersionHistory,
  getVersionDownloadUrlById,
  restoreVersionById,
  uploadNewVersion,
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
  /** Invoked after a successful version upload from the drawer header. */
  onUploaded?: () => void | Promise<void>;
}

/** Status badge tint per `VersionStatus` (server-authoritative value). */
const STATUS_BADGE_CLASS: Record<string, string> = {
  ACTIVE: "bg-emerald-500/10 text-emerald-700",
  SUPERSEDED: "bg-[color:var(--imkan-color-muted)]/10 text-[color:var(--imkan-color-muted)]",
  RESTORED: "bg-sky-500/10 text-sky-700",
  DELETED: "bg-[color:var(--imkan-color-error)]/10 text-[color:var(--imkan-color-error)]",
};

type DrawerToast = { kind: "success" | "error"; message: string };

function extensionOf(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 && dot < base.length - 1 ? base.slice(dot + 1).toLowerCase() : "";
}

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

const RELATIVE_DIVISIONS: Array<{ amount: number; unit: Intl.RelativeTimeFormatUnit }> = [
  { amount: 60, unit: "second" },
  { amount: 60, unit: "minute" },
  { amount: 24, unit: "hour" },
  { amount: 7, unit: "day" },
  { amount: 4.34524, unit: "week" },
  { amount: 12, unit: "month" },
  { amount: Number.POSITIVE_INFINITY, unit: "year" },
];

/** "3 minutes ago" / "قبل ٣ دقائق" via Intl — locale-driven, no extra keys. */
function formatRelative(value: string, locale: string): string {
  try {
    const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    let duration = (new Date(value).getTime() - Date.now()) / 1000;
    for (const division of RELATIVE_DIVISIONS) {
      if (Math.abs(duration) < division.amount) {
        return formatter.format(Math.round(duration), division.unit);
      }
      duration /= division.amount;
    }
    return "";
  } catch {
    return "";
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
  onUploaded,
}: VersionHistoryDrawerProps) {
  const { label, locale } = useLocale();
  const titleId = useId();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const previousActiveRef = useRef<HTMLElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [versions, setVersions] = useState<VersionRecord[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<VersionRecord | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [toast, setToast] = useState<DrawerToast | null>(null);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
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

  const handleUploadClick = () => {
    if (!isUploading) fileInputRef.current?.click();
  };

  /**
   * Direct version upload from the drawer header: client-side extension guard
   * first (graceful mismatch feedback), then the multipart POST; the server
   * re-validates MIME/extension and computes the authoritative checksum.
   */
  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset so selecting the same file twice still fires `change`.
    event.target.value = "";
    if (!file || isUploading) return;

    const parentExtension = extensionOf(fileName);
    const selectedExtension = extensionOf(file.name);
    if (parentExtension && selectedExtension !== parentExtension) {
      setToast({
        kind: "error",
        message: label("versionHistory.uploadMismatch").replace("{extension}", parentExtension),
      });
      return;
    }

    setIsUploading(true);
    setError(null);
    try {
      await uploadNewVersion(fileId, file);
      setToast({ kind: "success", message: label("versionHistory.uploadSuccess") });
      await load();
      await onUploaded?.();
    } catch (cause) {
      setToast({
        kind: "error",
        message:
          cause instanceof ApiError && cause.status === 400 && cause.message
            ? cause.message
            : cause instanceof ApiError && cause.status === 403
              ? label("error.forbidden")
              : label("versionHistory.uploadError"),
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleCopyHash = async (hash: string) => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopiedHash(hash);
      window.setTimeout(() => setCopiedHash((current) => (current === hash ? null : current)), 2000);
    } catch {
      setToast({ kind: "error", message: label("error.generic") });
    }
  };

  if (!isOpen) return null;

  // The panel anchors to the inline end; the hidden slide offset follows the
  // document direction so RTL users get the same motion mirrored.
  const slideOutClass = locale === "ar" ? "-translate-x-full" : "translate-x-full";

  const statusText = (status: string) =>
    status === "ACTIVE"
      ? label("versionHistory.current")
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
        className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-200 ${visible ? "opacity-100" : "opacity-0"}`}
      />
      <div
        ref={surfaceRef}
        tabIndex={-1}
        className={`absolute inset-y-0 end-0 flex w-full flex-col overflow-y-auto bg-[color:var(--imkan-color-surface)] shadow-2xl transition-transform duration-200 ease-out sm:w-[480px] sm:max-w-lg ${visible ? "translate-x-0" : slideOutClass}`}
      >
        <header className="border-b border-[color:var(--imkan-color-border)]">
          <div className="flex items-center justify-between gap-2 px-4 py-3">
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
          {canWrite && (
            <div className="flex flex-col gap-2 px-4 pb-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="imkan-button w-full justify-center sm:w-auto"
                onClick={handleUploadClick}
                disabled={isUploading}
                aria-label={isUploading ? label("versionHistory.uploading") : label("versionHistory.uploadVersion")}
              >
                {isUploading ? (
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 16V4m0 0 4 4m-4-4-4 4" />
                    <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
                  </svg>
                )}
                {isUploading ? label("versionHistory.uploading") : label("versionHistory.uploadVersion")}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(event) => void handleFileChange(event)}
              />
            </div>
          )}
        </header>

        <div className="flex flex-1 flex-col gap-3 p-4" aria-busy={isLoading}>
          {/* Zoho-style header summary card: identity + scale at a glance. */}
          <div className="flex items-center gap-3 rounded-sm border border-[color:var(--imkan-color-border)] p-3">
            <FileTypeIcon
              kind={fileIconKind("file", mimeType, fileName)}
              size={28}
              className="shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold" title={fileName}>
                {fileName}
              </p>
              <p className="text-xs text-[color:var(--imkan-color-muted)]">
                {label("versionHistory.totalVersions").replace("{count}", String(versions?.length ?? 0))}
                {" · "}
                {formatBytes(size)}
              </p>
            </div>
          </div>

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
            <ol className="relative ms-3 space-y-4 border-s-2 border-[color:var(--imkan-color-border)] ps-6">
                {versions.map((version) => (
                  <li key={version.id} className="relative">
                    {/* Timeline node on the vertical accent axis. */}
                    {version.status === "ACTIVE" ? (
                      <span className="absolute -start-[31px] top-4 flex h-3.5 w-3.5 items-center justify-center">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60 motion-reduce:animate-none" aria-hidden="true" />
                        <span className="relative inline-flex h-3 w-3 rounded-full border-2 border-[color:var(--imkan-color-surface)] bg-emerald-500" aria-hidden="true" />
                      </span>
                    ) : (
                      <span
                        className={`absolute -start-[29px] top-[17px] inline-flex h-3 w-3 rounded-full border-2 border-[color:var(--imkan-color-surface)] ${version.status === "RESTORED" ? "bg-sky-500" : "bg-[color:var(--imkan-color-muted)]"}`}
                        aria-hidden="true"
                      />
                    )}
                    <article
                      className={`rounded-sm border p-3 ${version.isCurrent ? "border-[color:var(--imkan-color-primary)] bg-[color:var(--imkan-color-primary)]/5" : "border-[color:var(--imkan-color-border)]"}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono text-sm font-semibold">
                          v{version.versionNumber}
                        </span>
                        <span className={`imkan-badge inline-flex items-center gap-1.5 ${STATUS_BADGE_CLASS[version.status] ?? ""}`}>
                          {version.status === "ACTIVE" && (
                            <span className="relative flex h-2 w-2" aria-hidden="true">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75 motion-reduce:animate-none" />
                              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                            </span>
                          )}
                          {version.status === "RESTORED" && (
                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M3 12a9 9 0 1 0 2.6-6.4L3 8" />
                              <path d="M3 3v5h5" />
                            </svg>
                          )}
                          {statusText(version.status)}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-col gap-1.5 text-sm">
                        <div className="flex min-w-0 items-center justify-between gap-2">
                          <OwnerCell
                            name={version.uploadedBy?.name ?? null}
                            email={version.uploadedBy?.email ?? null}
                            avatarUrl={version.uploadedBy?.avatarUrl ?? null}
                            compact
                          />
                          <span className="shrink-0 text-xs text-[color:var(--imkan-color-muted)]">
                            {formatBytes(version.size)}
                          </span>
                        </div>
                        <div className="flex flex-col">
                          {/* Relative time leads; the absolute stamp stays
                              discoverable via title and the muted second line. */}
                          <time dateTime={version.createdAt} title={formatDate(version.createdAt, locale)}>
                            {formatRelative(version.createdAt, locale)}
                          </time>
                          <span className="text-xs text-[color:var(--imkan-color-muted)]">
                            {formatDate(version.createdAt, locale)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className="truncate font-mono text-xs text-[color:var(--imkan-color-muted)]"
                            title={version.sha256Hash}
                          >
                            {version.sha256Hash.slice(0, 16)}…
                          </span>
                          <button
                            type="button"
                            className="zoho-icon-btn shrink-0"
                            onClick={() => void handleCopyHash(version.sha256Hash)}
                            aria-label={copiedHash === version.sha256Hash ? label("versionHistory.copied") : label("versionHistory.copyHash")}
                          >
                            {copiedHash === version.sha256Hash ? (
                              <svg className="h-3.5 w-3.5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="m5 13 4 4L19 7" />
                              </svg>
                            ) : (
                              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <rect x="9" y="9" width="11" height="11" rx="2" />
                                <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 flex items-stretch gap-2">
                        <button
                          type="button"
                          className="imkan-button-secondary min-h-9 flex-1 text-sm sm:flex-none"
                          onClick={() => void handlePreview(version)}
                          aria-label={`${label("versionHistory.preview")} v${version.versionNumber}`}
                        >
                          {label("versionHistory.preview")}
                        </button>
                        <button
                          type="button"
                          className="imkan-button-secondary min-h-9 flex-1 text-sm sm:flex-none"
                          onClick={() => void handleDownload(version)}
                          aria-label={`${label("versionHistory.download")} v${version.versionNumber}`}
                        >
                          {label("versionHistory.download")}
                        </button>
                        {canWrite && !version.isCurrent ? (
                          <button
                            type="button"
                            className="imkan-button-secondary min-h-9 flex-1 text-sm sm:flex-none"
                            onClick={() => setRestoreTarget(version)}
                            aria-label={`${label("versionHistory.restore")} v${version.versionNumber}`}
                          >
                            {label("versionHistory.restore")}
                          </button>
                        ) : canWrite && version.isCurrent ? (
                          <span className="self-center text-xs text-[color:var(--imkan-color-muted)]">
                            {label("versionHistory.currentVersionNoRestore")}
                          </span>
                        ) : null}
                      </div>
                    </article>
                  </li>
                ))}
              </ol>
          )}
        </div>
      </div>

      {/* Animated success / error toast (upload, copy hash, generic errors). */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-4 end-4 z-[60] flex max-w-sm items-start gap-2 rounded-sm border p-3 text-sm shadow-lg transition-all duration-300 ${toast.kind === "success"
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
            : "border-[color:var(--imkan-color-error)]/40 bg-[color:var(--imkan-color-error)]/10 text-[color:var(--imkan-color-error)]"}`}
        >
          {toast.kind === "success" ? (
            <svg className="mt-0.5 h-4 w-4 shrink-0 motion-safe:animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m5 13 4 4L19 7" />
            </svg>
          ) : (
            <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v4m0 4h.01" />
            </svg>
          )}
          <span className="min-w-0 break-words">{toast.message}</span>
        </div>
      )}
      {toast && <ToastAutoDismiss onDismiss={() => setToast(null)} />}

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

/** Auto-dismiss timer for the drawer toast (4s, matching the shared Toast). */
function ToastAutoDismiss({ onDismiss }: { onDismiss: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 4000);
    return () => window.clearTimeout(timer);
  }, [onDismiss]);
  return null;
}
