"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "./locale-provider";
import { FileIcon } from "./file-icon";
import { ImageViewer } from "./preview/image-viewer";
import { PdfViewer } from "./preview/pdf-viewer";
import { OfficeViewer } from "./preview/office-viewer";
import { MediaViewer } from "./preview/media-viewer";
import { CodeViewer } from "./preview/code-viewer";
import { ArchiveViewer } from "./preview/archive-viewer";
import { DetailsSidebar } from "./preview/details-sidebar";
import { usePreviewUrl } from "./preview/use-preview-url";
import { resolveMimeType } from "../lib/api/mime";
import { getPreviewMimeCategory, isBrowserRenderableImage } from "../lib/api/preview";
import { formatBytes } from "../lib/api/quota";
import { requestDownload } from "../lib/api/files";
import { triggerDownload } from "../lib/api/download";
import { buildCreateShareBody, createShare } from "../lib/api/shares";

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

function WorkDriveLogo() {
  return (
    <svg className="zoho-preview-logo" viewBox="0 0 24 24" aria-hidden focusable="false">
      <circle cx="12" cy="12" r="11" fill="#d64123" />
      <path d="M6 15.5 9.2 8h2l1.9 4.7L15 8h2l3.2 7.5h-2.2l-2-4.9-1.9 4.9h-2.2l-2-4.9-2 4.9Z" fill="#fff" />
    </svg>
  );
}

/**
 * Full-screen Zoho WorkDrive-style preview: dark backdrop, header bar (logo,
 * file name, extension, size, Details/Share/Print/Download/Close), a
 * type-specific viewer fed directly by the presigned preview URL (no Blob
 * fetch — the root cause of the CORS/403 redirect failures) and a collapsible
 * details/activity sidebar.
 */
export function FilePreviewModal({ target, onClose, onPrevFile, onNextFile }: FilePreviewModalProps) {
  const { label } = useLocale();
  const previousActiveRef = useRef<HTMLElement | null>(null);
  const printFrameRef = useRef<HTMLIFrameElement | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const open = Boolean(target);
  const activeTarget = target;
  const resolvedMime = target ? resolveMimeType(target.mimeType ?? "", target.name) : "";
  const category = target ? getPreviewMimeCategory(resolvedMime, target.name) : "unsupported";
  const { url, info, loading, error: urlError, epoch, refresh } = usePreviewUrl(open && activeTarget ? activeTarget.id : null);
  const effectiveSize = info?.size ?? activeTarget?.size ?? 0;
  const effectiveMime = info?.mime_type ?? resolvedMime;

  useEffect(() => {
    setSidebarOpen(false);
    setToast(null);
  }, [activeTarget?.id]);

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

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2_500);
  }, []);

  const handleDownload = useCallback(async () => {
    if (!activeTarget) return;
    const result = await requestDownload(activeTarget.id);
    triggerDownload(result.download_url, activeTarget.name);
  }, [activeTarget]);

  const handleShare = useCallback(async () => {
    if (!activeTarget) return;
    try {
      const result = await createShare(
        buildCreateShareBody({ resourceType: "FILE", resourceId: activeTarget.id, canDownload: true }),
      );
      await navigator.clipboard.writeText(result.link_url);
      showToast(label("preview.shareCopied"));
    } catch {
      showToast(label("preview.error"));
    }
  }, [activeTarget, label, showToast]);

  const handlePrint = useCallback(() => {
    if (!url) return;
    printFrameRef.current?.remove();
    const frame = document.createElement("iframe");
    frame.style.position = "fixed";
    frame.style.inset = "0";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "none";
    frame.src = url;
    frame.onload = () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } finally {
        window.setTimeout(() => frame.remove(), 60_000);
      }
    };
    document.body.appendChild(frame);
    printFrameRef.current = frame;
  }, [url]);

  // Binary/unrenderable payloads: elegant card with a prominent download CTA.
  const renderableViewers: Record<string, boolean> = {
    image: isBrowserRenderableImage(effectiveMime),
    pdf: true,
    video: true,
    audio: true,
    text: true,
    office: true,
    archive: true,
  };

  if (!activeTarget || !open) return null;

  const extension = activeTarget.name.includes(".")
    ? activeTarget.name.slice(activeTarget.name.lastIndexOf(".") + 1).toUpperCase()
    : "—";

  const renderStage = () => {
    if (urlError && !url) {
      return (
        <div className="zoho-unsupported-card">
          <div className="zoho-unsupported-icon" aria-hidden>⚠️</div>
          <h3>{activeTarget.name}</h3>
          <p>{label("preview.error")}</p>
          <button type="button" className="zoho-btn" onClick={() => void refresh()}>{label("preview.retry")}</button>
        </div>
      );
    }
    if (!url || loading) {
      return (
        <div className="zoho-viewer-root">
          <div className="zoho-viewer-spinner" aria-label={label("preview.loading")} />
        </div>
      );
    }
    if (!renderableViewers[category]) {
      return (
        <div className="zoho-unsupported-card">
          <div className="zoho-unsupported-icon" aria-hidden>📦</div>
          <h3>{activeTarget.name}</h3>
          <p>{extension} · {formatBytes(effectiveSize)}</p>
          <button type="button" className="zoho-btn zoho-btn-primary" onClick={() => void handleDownload()}>
            {label("preview.downloadToView")}
          </button>
        </div>
      );
    }
    switch (category) {
      case "image":
        return <ImageViewer url={url} epoch={epoch} alt={activeTarget.name} onLoadError={() => void refresh()} />;
      case "pdf":
        return <PdfViewer url={url} epoch={epoch} onLoadError={() => void refresh()} />;
      case "video":
        return <MediaViewer url={url} epoch={epoch} mimeType={effectiveMime} fileName={activeTarget.name} isAudio={false} onLoadError={() => void refresh()} />;
      case "audio":
        return <MediaViewer url={url} epoch={epoch} mimeType={effectiveMime} fileName={activeTarget.name} isAudio onLoadError={() => void refresh()} />;
      case "text":
        return <CodeViewer url={url} mimeType={effectiveMime} fileName={activeTarget.name} />;
      case "office":
        return <OfficeViewer url={url} fileName={activeTarget.name} onDownload={() => void handleDownload()} />;
      case "archive":
        return <ArchiveViewer url={url} fileName={activeTarget.name} mimeType={effectiveMime} fileSize={effectiveSize} onDownload={() => void handleDownload()} />;
      default:
        return null;
    }
  };

  return (
    <div className="zoho-preview-modal" role="dialog" aria-modal="true" aria-label={`${activeTarget.name} — ${label("preview.title")}`}>
      <header className="zoho-preview-head">
        <WorkDriveLogo />
        <span className="zoho-preview-file">
          <FileIcon kind="file" mimeType={effectiveMime} name={activeTarget.name} label={label("files.type.file")} />
          <strong title={activeTarget.name}>{activeTarget.name}</strong>
        </span>
        <span className="zoho-preview-chip">{extension}</span>
        <span className="zoho-preview-chip muted">{formatBytes(effectiveSize)}</span>
        <div className="zoho-preview-actions">
          <button
            type="button"
            className={`zoho-icon-btn${sidebarOpen ? " active" : ""}`}
            onClick={() => setSidebarOpen((value) => !value)}
            aria-label={label("preview.details")}
            aria-expanded={sidebarOpen}
            title={label("preview.details")}
          >
            ⓘ
          </button>
          <button type="button" className="zoho-icon-btn" onClick={() => void handleShare()} aria-label={label("preview.share")} title={label("preview.share")}>
            ⇗
          </button>
          {category === "pdf" || (category === "image" && renderableViewers.image) ? (
            <button type="button" className="zoho-icon-btn" onClick={handlePrint} aria-label={label("preview.print")} title={label("preview.print")}>
              ⎙
            </button>
          ) : null}
          <button type="button" className="zoho-preview-download" onClick={() => void handleDownload()}>
            {label("preview.download")}
          </button>
          <button type="button" className="zoho-icon-btn zoho-preview-close" onClick={onClose} aria-label={label("preview.close")}>✕</button>
        </div>
      </header>

      <div className="zoho-preview-shell">
        <div className="zoho-preview-stage">
          {onPrevFile ? (
            <button type="button" className="zoho-preview-arrow start" onClick={onPrevFile} aria-label={label("preview.prevPage")} title="←">‹</button>
          ) : null}
          <div className="zoho-preview-body">{renderStage()}</div>
          {onNextFile ? (
            <button type="button" className="zoho-preview-arrow end" onClick={onNextFile} aria-label={label("preview.nextPage")} title="→">›</button>
          ) : null}
        </div>
        <DetailsSidebar
          open={sidebarOpen}
          fileId={activeTarget.id}
          fileName={activeTarget.name}
          mimeType={effectiveMime}
          size={effectiveSize}
          versionNumber={info?.version_number}
          updatedAt={info?.updated_at}
        />
      </div>

      {toast ? <div className="zoho-preview-toast" role="status">{toast}</div> : null}
    </div>
  );
}
