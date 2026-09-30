"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { PopoverTrigger } from "@radix-ui/react-popover";
import { useLocale } from "./locale-provider";
import { FileIcon } from "./file-icon";
import { ActionDropdown } from "./action-dropdown";
import { ShareModal } from "./share-modal";
import { DataTemplateAssociationModal } from "./data-template-association-modal";
import { VersionHistoryDrawer } from "./files/version-history-drawer";
import { ImageViewer } from "./preview/image-viewer";
import { PdfViewer } from "./preview/pdf-viewer";
import { OfficeViewer } from "./preview/office-viewer";
import { MediaViewer } from "./preview/media-viewer";
import { CodeViewer } from "./preview/code-viewer";
import { ArchiveViewer } from "./preview/archive-viewer";
import { DetailsSidebar } from "./preview/details-sidebar";
import { FileCommentsPanel } from "./preview/file-comments-panel";
import { DEFAULT_WATERMARK_CONFIG, PreviewWatermark, WatermarkSidebar, type WatermarkConfig } from "./preview/watermark-sidebar";
import { listFileComments } from "../lib/api/comments";
import { usePreviewUrl } from "./preview/use-preview-url";
import { resolveMimeType } from "../lib/api/mime";
import { getPreviewMimeCategory, isBrowserRenderableImage } from "../lib/api/preview";
import { formatBytes } from "../lib/api/quota";
import { getFileDlp, requestDownload, trashFile, type FileDlpDecision } from "../lib/api/files";
import { triggerDownload } from "../lib/api/download";
import { listDataTemplates, type DataTemplate } from "../lib/api/metadata";
import { getViewPreferences } from "../lib/api/enterprise";
import { useRouter } from "next/navigation";

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
  initialPanel?: "details" | "comments" | "dataTemplate" | "watermark" | "zia";
  focusCommentId?: string | null;
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
export function FilePreviewModal({ target, onClose, onPrevFile, onNextFile, initialPanel, focusCommentId }: FilePreviewModalProps) {
  const { label } = useLocale();
  const previousActiveRef = useRef<HTMLElement | null>(null);
  const printFrameRef = useRef<HTMLIFrameElement | null>(null);
  const [panel, setPanel] = useState<"details" | "comments" | "watermark" | "zia" | null>(initialPanel === "dataTemplate" ? null : initialPanel ?? null);
  const [commentCount, setCommentCount] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [dlp, setDlp] = useState<FileDlpDecision | null>(null);
  const [watermarkConfig, setWatermarkConfig] = useState<WatermarkConfig>(DEFAULT_WATERMARK_CONFIG);
  const [shareOpen, setShareOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(initialPanel === "dataTemplate");
  const [templates, setTemplates] = useState<DataTemplate[]>([]);
  const router = useRouter();

  const open = Boolean(target);
  const activeTarget = target;
  const resolvedMime = target ? resolveMimeType(target.mimeType ?? "", target.name) : "";
  const category = target ? getPreviewMimeCategory(resolvedMime, target.name) : "unsupported";
  const { url, info, loading, error: urlError, epoch, refresh } = usePreviewUrl(open && activeTarget ? activeTarget.id : null);
  const effectiveSize = info?.size ?? activeTarget?.size ?? 0;
  const effectiveMime = info?.mime_type ?? resolvedMime;

  useEffect(() => {
    setPanel(initialPanel === "dataTemplate" ? null : initialPanel ?? null);
    setToast(null);
    setDlp(null);
    setWatermarkConfig(DEFAULT_WATERMARK_CONFIG);
    setShareOpen(false);
    setVersionOpen(false);
    setTemplateOpen(initialPanel === "dataTemplate");
    if (!activeTarget) return;
    let live = true;
    void getFileDlp(activeTarget.id).then((value) => {
      if (!live) return;
      setDlp(value);
      setWatermarkConfig((current) => ({
        ...current,
        enabled: value.watermark.enabled || current.enabled,
        text: value.watermark.text || current.text,
        kind: value.watermark.enabled ? "text" : current.kind,
      }));
    }).catch(() => { if (live) setDlp(null); });
    void getViewPreferences().then((value) => {
      if (!live || initialPanel) return;
      if (value.previewPanel === "DATA_TEMPLATE") {
        setPanel(null);
        setTemplateOpen(true);
        void listDataTemplates(false).then((rows) => { if (live) setTemplates(rows); }).catch(() => undefined);
        return;
      }
      setPanel(value.previewPanel === "DETAILS" ? "details" : value.previewPanel === "COMMENTS" ? "comments" : null);
    }).catch(() => undefined);
    if (initialPanel === "dataTemplate") {
      void listDataTemplates(false).then((rows) => { if (live) setTemplates(rows); }).catch(() => undefined);
    }
    return () => { live = false; };
  }, [activeTarget?.id, initialPanel]);

  useEffect(() => {
    if (!activeTarget) return;
    let cancelled = false;
    listFileComments(activeTarget.id).then((rows) => {
      if (!cancelled) setCommentCount(rows.length + rows.reduce((sum, row) => sum + (row.replies?.length ?? 0), 0));
    }).catch(() => { if (!cancelled) setCommentCount(0); });
    return () => { cancelled = true; };
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
      const node = event.target instanceof Element ? event.target : null;
      const overlay = shareOpen || versionOpen || templateOpen || Boolean(node?.closest(".wd-menu, .imkan-modal-backdrop, [data-radix-popper-content-wrapper]"));
      if (overlay) return;
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
  }, [open, onClose, onPrevFile, onNextFile, shareOpen, versionOpen, templateOpen]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2_500);
  }, []);

  const handleDownload = useCallback(async () => {
    if (!activeTarget) return;
    try {
      const result = await requestDownload(activeTarget.id);
      triggerDownload(result.download_url, activeTarget.name);
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : label("preview.error"));
    }
  }, [activeTarget, label, showToast]);

  const copyPermalink = useCallback(async () => {
    if (!activeTarget) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/files?file=${encodeURIComponent(activeTarget.id)}`);
      showToast(label("preview.copied"));
    } catch {
      showToast(label("preview.error"));
    }
  }, [activeTarget, label, showToast]);

  const openTemplates = useCallback(() => {
    setPanel(null);
    setTemplateOpen(true);
    void listDataTemplates(false).then(setTemplates).catch(() => setTemplates([]));
  }, []);

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

  const togglePanel = useCallback((next: "details" | "comments" | "watermark" | "zia") => {
    setTemplateOpen(false);
    setPanel((current) => current === next ? null : next);
  }, []);

  const openWith = useCallback((kind: "writer" | "sheet" | "show") => {
    if (!activeTarget) return;
    router.push(`/office/${kind}/${activeTarget.id}`);
  }, [activeTarget, router]);

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

  const railButton = (key: "details" | "comments" | "dataTemplate" | "watermark" | "zia", icon: ReactNode, title: string) => (
    <button
      type="button"
      className={`zoho-preview-rail-btn${key === "dataTemplate" ? (templateOpen ? " active" : "") : panel === key ? " active" : ""}`}
      onClick={() => { if (key === "dataTemplate") openTemplates(); else togglePanel(key); }}
      title={title}
      aria-label={title}
      aria-pressed={key === "dataTemplate" ? templateOpen : panel === key}
    >
      <span className="zoho-preview-rail-icon">{icon}</span>
      <span>{title}</span>
      {key === "comments" && commentCount > 0 ? <b className="zoho-rail-badge">{commentCount > 99 ? "99+" : commentCount}</b> : null}
    </button>
  );

  return (
    <div className="zoho-preview-modal" role="dialog" aria-modal="true" aria-label={`${activeTarget.name} — ${label("preview.title")}`}>
      <header className="zoho-preview-head">
        <div className="zoho-preview-breadcrumb">
          <WorkDriveLogo />
          <span className="zoho-preview-filetype">{extension}</span>
        </div>
        <span className="zoho-preview-file">
          <FileIcon kind="file" mimeType={effectiveMime} name={activeTarget.name} label={label("files.type.file")} />
          <strong title={info?.file_name || activeTarget.name}>{info?.file_name || activeTarget.name}</strong>
        </span>
        <div className="zoho-preview-actions">
          <div className="zoho-preview-menu-wrap">
            <button type="button" className="zoho-preview-share" onClick={() => setShareOpen(true)}><span>⇧</span>{label("preview.share")}<span>⌄</span></button>
          </div>
          {category === "office" ? (
            <div className="zoho-preview-menu-wrap">
              <button type="button" className="zoho-preview-outline-btn" onClick={() => {
                const ext = extension.toLowerCase();
                if (["xls", "xlsx", "ods"].includes(ext)) openWith("sheet");
                else if (["ppt", "pptx", "odp"].includes(ext)) openWith("show");
                else openWith("writer");
              }}>{label("preview.openWith")} <span>⌄</span></button>
            </div>
          ) : null}
          <button type="button" className="zoho-preview-icon-top" onClick={() => void copyPermalink()} aria-label={label("preview.copyLink")} title={label("preview.copyLink")}>↗</button>
          <button type="button" className="zoho-preview-icon-top" onClick={() => void handleDownload()} aria-label={label("preview.download")} title={label("preview.download")}>⇩</button>
          <ActionDropdown
            label={label("files.actions")}
            trigger={(
              <PopoverTrigger asChild>
                <button type="button" className="zoho-preview-icon-top" aria-label={label("files.actions")} title={label("files.actions")}>•••</button>
              </PopoverTrigger>
            )}
            items={[
              { label: label("files.download"), onSelect: () => void handleDownload() },
              { label: label("files.share"), onSelect: () => setShareOpen(true) },
              { label: label("preview.copyLink"), onSelect: () => void copyPermalink() },
              { label: label("files.versionHistory"), onSelect: () => setVersionOpen(true) },
              { label: label("preview.comments"), onSelect: () => setPanel("comments") },
              { label: label("files.details"), onSelect: () => setPanel("details") },
              { label: label("files.delete"), destructive: true, dividerBefore: true, onSelect: () => {
                if (!window.confirm(label("files.deleteConfirm"))) return;
                void trashFile(activeTarget.id).then(() => onClose()).catch((cause) => showToast(cause instanceof Error ? cause.message : label("preview.error")));
              } },
            ]}
          />
          <button type="button" className="zoho-preview-icon-top close" onClick={onClose} aria-label={label("preview.close")}>×</button>
        </div>
      </header>

      <div className="zoho-preview-shell">
        <div className="zoho-preview-stage">
          {onPrevFile ? <button type="button" className="zoho-preview-arrow start" onClick={onPrevFile} aria-label={label("preview.prevPage")} title="Previous">‹</button> : null}
          <div className="zoho-preview-body">
            <div className="zoho-preview-canvas-wrap">
              {renderStage()}
              <PreviewWatermark enabled={watermarkConfig.enabled || Boolean(dlp?.watermark.enabled)} config={watermarkConfig} />
            </div>
          </div>
          {onNextFile ? <button type="button" className="zoho-preview-arrow end" onClick={onNextFile} aria-label={label("preview.nextPage")} title="Next">›</button> : null}
        </div>

        {panel === "details" ? <DetailsSidebar open fileId={activeTarget.id} fileName={info?.file_name || activeTarget.name} mimeType={effectiveMime} size={effectiveSize} versionNumber={info?.version_number} updatedAt={info?.updated_at} onClose={() => setPanel(null)} onShare={() => setShareOpen(true)} onViewVersions={() => setVersionOpen(true)} /> : null}
        {panel === "comments" ? <FileCommentsPanel fileId={activeTarget.id} focusCommentId={focusCommentId} onCount={setCommentCount} onClose={() => setPanel(null)} /> : null}
        {panel === "watermark" ? <WatermarkSidebar open fileId={activeTarget.id} config={watermarkConfig} onChange={setWatermarkConfig} onClose={() => setPanel(null)} /> : null}
        {panel === "zia" ? (
          <aside className="zoho-preview-panel zoho-zia-panel" dir={label("preview.title") === "معاينة الملف" ? "rtl" : "ltr"}>
            <header className="zoho-preview-panel-head"><div><h2>Zia</h2><p>{activeTarget.name}</p></div><button type="button" className="zoho-panel-close" onClick={() => setPanel(null)}>×</button></header>
            <div className="zoho-preview-panel-body"><div className="zoho-panel-empty"><div className="zoho-panel-empty-icon">✦</div><strong>{label("preview.ziaComingSoon") || "Zia insights"}</strong><span>{label("preview.ziaComingSoonDescription") || "Zia actions for file summaries and insights are available from supported editors."}</span></div></div>
          </aside>
        ) : null}

        <nav className="zoho-preview-rail" aria-label="Preview tools">
          {railButton("details", <span className="rail-info">i</span>, label("preview.details") || "Details")}
          {railButton("comments", <span className="rail-comment">▱</span>, label("preview.comments") || "Comments")}
          {railButton("dataTemplate", <span className="rail-template">▤</span>, label("preview.dataTemplates") || "Data Templates")}
          {railButton("watermark", <span className="rail-watermark">♢</span>, label("preview.watermark") || "Watermark")}
          {railButton("zia", <span className="rail-zia">✣</span>, "Zia")}
          <div className="zoho-preview-rail-spacer" />
          <button type="button" className="zoho-preview-rail-plus" onClick={() => showToast(label("files.actions"))} aria-label={label("files.actions")} title={label("files.actions")}>+</button>
        </nav>
      </div>

      {toast ? <div className="zoho-preview-toast" role="status">{toast}</div> : null}
      {shareOpen ? (
        <ShareModal
          resourceType="FILE"
          resourceId={activeTarget.id}
          resourceName={info?.file_name || activeTarget.name}
          onClose={() => setShareOpen(false)}
        />
      ) : null}
      <VersionHistoryDrawer
        isOpen={versionOpen}
        onClose={() => setVersionOpen(false)}
        fileId={activeTarget.id}
        fileName={info?.file_name || activeTarget.name}
        mimeType={effectiveMime}
        size={effectiveSize}
        canWrite
        onRestored={() => void refresh()}
      />
      {templateOpen ? (
        <DataTemplateAssociationModal
          targets={[{ type: "FILE", id: activeTarget.id, name: info?.file_name || activeTarget.name }]}
          dataTemplates={templates}
          onClose={() => setTemplateOpen(false)}
        />
      ) : null}
    </div>
  );
}