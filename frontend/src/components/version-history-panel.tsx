"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Modal } from "./modal";
import { useLocale } from "./locale-provider";
import { AlertBanner } from "./alert-banner";
import { EmptyState } from "./empty-state";
import { SkeletonLoader } from "./skeleton-loader";
import { errorMessageForStatus } from "./feedback-state-logic";
import { VersionList } from "./version-history/version-list";
import { RestoreConfirmModal } from "./version-history/restore-confirm-modal";
import { ApiError } from "../lib/api/client";

interface VersionHistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  canRead: boolean;
  canWrite: boolean;
  role?: string;
  onPreviewVersion: (versionNumber: number) => void;
  onRestoreVersion: (versionNumber: number) => Promise<void>;
  versions: Array<{
    id: string;
    versionNumber: number;
    size: number;
    mimeType: string;
    sha256Hash: string;
    uploadedById: string;
    uploadedBy?: { email: string; name?: string | null };
    createdAt: string;
    isCurrent: boolean;
  }>;
}

export function VersionHistoryPanel({
  isOpen,
  onClose,
  fileId,
  fileName,
  mimeType,
  size,
  canRead,
  canWrite,
  role,
  onPreviewVersion,
  onRestoreVersion,
  versions,
}: VersionHistoryPanelProps) {
  const { label } = useLocale();
  const previousActiveRef = useRef<HTMLElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      previousActiveRef.current = document.activeElement as HTMLElement | null;
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      previousActiveRef.current?.focus();
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateString: string): string => {
    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(dateString));
    } catch {
      return dateString;
    }
  };

  const formatHash = (hash: string): string => {
    return `${hash.slice(0, 16)}...`;
  };

  const handlePreview = (versionNumber: number) => {
    onPreviewVersion(versionNumber);
  };

  const handleRestore = (versionNumber: number) => {
    setRestoreTarget(versionNumber);
  };

  const handleRestoreConfirm = async () => {
    if (!restoreTarget) return;
    try {
      setError(null);
      await onRestoreVersion(restoreTarget);
      setRestoreTarget(null);
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 401
          ? label("error.unauthenticated")
          : cause instanceof ApiError && cause.status === 403
            ? label("error.forbidden")
            : cause instanceof ApiError && cause.status === 400
              ? label("error.generic")
              : label("error.generic"),
      );
    }
  };

  const handleRestoreCancel = () => {
    setRestoreTarget(null);
  };

  const sortedVersions = [...versions].sort((a, b) => b.versionNumber - a.versionNumber);

  return (
    <Modal
      title={label("versionHistory.title").replace("{fileName}", fileName)}
      onClose={onClose}
      closeLabel={label("preview.close")}
    >
      <div className="flex-1 min-h-0 flex flex-col">
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

        <div className="flex-1 overflow-y-auto p-4">
          {versions.length === 0 ? (
            <EmptyState
              title={label("versionHistory.empty")}
              description={label("versionHistory.emptyDescription")}
            />
          ) : (
            <VersionList
              versions={sortedVersions}
              fileName={fileName}
              mimeType={mimeType}
              currentVersion={versions.find((v) => v.isCurrent)?.versionNumber ?? 0}
              canWrite={canWrite}
              onPreview={handlePreview}
              onRestore={handleRestore}
              formatSize={formatSize}
              formatDate={formatDate}
              formatHash={formatHash}
            />
          )}
        </div>

        {restoreTarget && (
          <RestoreConfirmModal
            versionNumber={restoreTarget}
            fileName={fileName}
            onConfirm={handleRestoreConfirm}
            onCancel={handleRestoreCancel}
          />
        )}
      </div>
    </Modal>
  );
}