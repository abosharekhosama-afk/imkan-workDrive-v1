"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Modal } from "./modal";
import { useLocale } from "./locale-provider";

interface PreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  fileName?: string;
  fileSize?: number;
  size?: number;
  mimeType?: string;
  versionNumber?: number;
  onDownload?: () => void;
  onOpenInNewTab?: () => void;
  canDownload?: boolean;
  onPrevFile?: () => void;
  onNextFile?: () => void;
}

export function PreviewModal({
  isOpen,
  onClose,
  title,
  children,
  fileName,
  fileSize,
  mimeType,
  versionNumber,
  onDownload,
  onOpenInNewTab,
  canDownload = true,
  onPrevFile,
  onNextFile,
}: PreviewModalProps) {
  const { label } = useLocale();
  const previousActiveRef = useRef<HTMLElement | null>(null);

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

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowLeft" && onPrevFile) {
        e.preventDefault();
        onPrevFile();
      } else if (e.key === "ArrowRight" && onNextFile) {
        e.preventDefault();
        onNextFile();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, onPrevFile, onNextFile]);

  if (!isOpen) return null;

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const versionLabel = versionNumber ? `${label("preview.version").replace("{version}", String(versionNumber))}` : "";

  return (
    <Modal
      title={title}
      onClose={onClose}
      closeLabel={label("preview.close")}
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3 text-sm text-[color:var(--imkan-color-muted)]">
            {fileName && <span>{fileName}</span>}
            {fileSize && <span>{formatSize(fileSize)}</span>}
            {versionLabel && <span className="imkan-badge">{versionLabel}</span>}
          </div>
          <div className="flex items-center gap-2">
            {canDownload && onDownload && (
              <button
                type="button"
                className="imkan-button-secondary"
                onClick={onDownload}
                aria-label={label("preview.download")}
              >
                {label("preview.download")}
              </button>
            )}
            {onOpenInNewTab && (
              <button
                type="button"
                className="imkan-button-secondary"
                onClick={onOpenInNewTab}
                aria-label={label("preview.openInNewTab")}
              >
                {label("preview.openInNewTab")}
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="flex-1 min-h-0" role="document" aria-live="polite" aria-label={label("preview.loading")}>
        {children}
      </div>
    </Modal>
  );
}