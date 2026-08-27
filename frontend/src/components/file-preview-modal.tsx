"use client";

import { useEffect, useRef } from "react";
import { useLocale } from "./locale-provider";
import { FileIcon } from "./file-icon";
import { FilePreview } from "./file-preview/file-preview";
import { resolveMimeType } from "../lib/api/mime";
import { getPreviewMimeCategory } from "../lib/api/preview";
import { formatBytes } from "../lib/api/quota";
import { requestDownload } from "../lib/api/files";

export interface FilePreviewModalTarget {
  id: string;
  name: string;
  mimeType?: string | null;
  size?: number | null;
}

interface FilePreviewModalProps {
  /** Null hides the overlay entirely. */
  target: FilePreviewModalTarget | null;
  onClose: () => void;
  onPrevFile?: () => void;
  onNextFile?: () => void;
}

/**
 * Full-screen, responsive media viewer. Images render inline, video/audio is
 * fed through HTTP-Range streaming against `/files/:id/stream`, and PDFs,
 * text and code reuse the shared {@link FilePreview} renderer with dynamic
 * extension-based MIME detection.
 */
export function FilePreviewModal({ target, onClose, onPrevFile, onNextFile }: FilePreviewModalProps) {
  const { label } = useLocale();
  const previousActiveRef = useRef<HTMLElement | null>(null);

  const open = Boolean(target);
  const resolvedMime = target ? resolveMimeType(target.mimeType ?? "", target.name) : "";
  const category = resolvedMime ? getPreviewMimeCategory(resolvedMime) : ("unsupported" as const);
  const hasCategoryLabel = category !== "unsupported";
  const categoryKey = (`preview.type.${category}`) as "preview.type.pdf";

  useEffect(() => {
    if (!open) return;
    previousActiveRef.current = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
      previousActiveRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "ArrowLeft" && onPrevFile) {
        event.preventDefault();
        onPrevFile();
      } else if (event.key === "ArrowRight" && onNextFile) {
        event.preventDefault();
        onNextFile();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, onPrevFile, onNextFile]);

  if (!target || !open) return null;

  const activeTarget = target;

  async function handleDownload() {
    const result = await requestDownload(activeTarget.id);
    window.location.assign(result.download_url);
  }

  return (
    <div className="zoho-preview-modal" role="dialog" aria-modal="true" aria-label={`${activeTarget.name} — ${label("preview.title")}`}>
      <header className="zoho-preview-head">
        <span className="zoho-preview-file">
          <FileIcon kind="file" mimeType={resolvedMime} name={activeTarget.name} label={label("files.type.file")} />
          <strong title={activeTarget.name}>{activeTarget.name}</strong>
        </span>
        <span className="zoho-preview-chip">{hasCategoryLabel ? label(categoryKey) : resolvedMime || "—"}</span>
        {typeof activeTarget.size === "number" ? <span className="zoho-preview-chip muted">{formatBytes(activeTarget.size)}</span> : null}
        <button type="button" className="zoho-icon-btn zoho-preview-close" onClick={onClose} aria-label={label("preview.close")}>✕</button>
      </header>

      <div className="zoho-preview-stage">
        {onPrevFile ? (
          <button type="button" className="zoho-preview-arrow start" onClick={onPrevFile} aria-label={label("preview.title")} title="←">‹</button>
        ) : null}
        <div className="zoho-preview-body">
          <FilePreview
            fileId={activeTarget.id}
            fileName={activeTarget.name}
            mimeType={resolvedMime}
            size={activeTarget.size ?? 0}
            previewUrl={`/files/${activeTarget.id}/stream`}
            rangeStream
            canDownload
            onDownload={() => void handleDownload()}
            onOpenInNewTab={() => window.open(`/files/${activeTarget.id}/download`, "_blank")}
          />
        </div>
        {onNextFile ? (
          <button type="button" className="zoho-preview-arrow end" onClick={onNextFile} aria-label={label("preview.title")} title="→">›</button>
        ) : null}
      </div>
    </div>
  );
}
