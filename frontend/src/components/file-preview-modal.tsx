"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocale } from "./locale-provider";
import { FileIcon } from "./file-icon";
import { ShareModal } from "./share-modal";
import { MoveModal } from "./move-modal";
import { RenameModal } from "./rename-modal";
import { FollowUpdatesModal } from "./follow-updates-modal";
import { WorkflowPicker } from "./workflow-picker";
import { VersionHistoryDrawer } from "./files/version-history-drawer";
import { ImageViewer } from "./preview/image-viewer";
import { PdfViewer } from "./preview/pdf-viewer";
import { OfficeViewer } from "./preview/office-viewer";
import { MediaViewer } from "./preview/media-viewer";
import { CodeViewer } from "./preview/code-viewer";
import { ArchiveViewer } from "./preview/archive-viewer";
import { MarkdownViewer } from "./preview/markdown-viewer";
import { DetailsSidebar } from "./preview/details-sidebar";
import { FileCommentsPanel } from "./preview/file-comments-panel";
import { DataTemplateSidebar } from "./preview/data-template-sidebar";
import { DEFAULT_WATERMARK_CONFIG, PreviewWatermark, WatermarkSidebar, type WatermarkConfig } from "./preview/watermark-sidebar";
import { Icons } from "./layout/icons";
import { ZohoMenu } from "./layout/zoho-menu";
import { FileActionsMenu } from "./file-actions-menu";
import { FileMenuIcons } from "../lib/file-menu-icons";
import { listFileComments } from "../lib/api/comments";
import { usePreviewUrl } from "./preview/use-preview-url";
import { resolveMimeType } from "../lib/api/mime";
import { getLanguageFromMime, getPreviewMimeCategory, isBrowserRenderableImage } from "../lib/api/preview";
import { formatBytes } from "../lib/api/quota";
import { copyFile, getFileDetails, getFileDlp, moveFile, renameFile, requestDownload, runFileControl, trashFile, type FileControlAction, type FileDlpDecision } from "../lib/api/files";
import type { FileControlState } from "./file-actions-menu";
import { triggerDownload } from "../lib/api/download";
import { getViewPreferences } from "../lib/api/enterprise";
import { saveFileAsTemplate } from "../lib/api/templates";
import { openResourceInNewTab } from "../lib/selection-bar-actions-logic";
import type { ShareLaunchMode } from "../lib/share-launch-logic";
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
  const { label, locale } = useLocale();
  const previousActiveRef = useRef<HTMLElement | null>(null);
  const [panel, setPanel] = useState<"details" | "comments" | "dataTemplate" | "watermark" | "zia" | null>(initialPanel ?? null);
  const [commentCount, setCommentCount] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [dlp, setDlp] = useState<FileDlpDecision | null>(null);
  const [watermarkConfig, setWatermarkConfig] = useState<WatermarkConfig>(DEFAULT_WATERMARK_CONFIG);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [shareLaunch, setShareLaunch] = useState<ShareLaunchMode | null>(null);
  const [versionOpen, setVersionOpen] = useState(false);
  const [moveMode, setMoveMode] = useState<"move" | "copy" | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [followOpen, setFollowOpen] = useState(false);
  const [fileControl, setFileControl] = useState<FileControlState>({ status: "ACTIVE" });
  const router = useRouter();

  const open = Boolean(target);
  const activeTarget = target;
  const resolvedMime = target ? resolveMimeType(target.mimeType ?? "", target.name) : "";
  const category = target ? getPreviewMimeCategory(resolvedMime, target.name) : "unsupported";
  const { url, info, loading, error: urlError, epoch, refresh } = usePreviewUrl(open && activeTarget ? activeTarget.id : null);
  const effectiveSize = info?.size ?? activeTarget?.size ?? 0;
  const effectiveMime = info?.mime_type ?? resolvedMime;

  useEffect(() => {
    setPanel(initialPanel ?? null);
    setToast(null);
    setDlp(null);
    setWatermarkConfig(DEFAULT_WATERMARK_CONFIG);
    setShareMenuOpen(false);
    setShareLaunch(null);
    setVersionOpen(false);
    setMoveMode(null);
    setRenameOpen(false);
    setWorkflowOpen(false);
    setFollowOpen(false);
    setFileControl({ status: "ACTIVE" });
    if (!activeTarget) return;
    let live = true;
    void getFileDetails(activeTarget.id).then((details) => {
      if (!live) return;
      setFileControl({ status: details.status, isFinal: details.isFinal, checkedOutById: details.checkedOutById });
    }).catch(() => undefined);
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
      setPanel(value.previewPanel === "DETAILS" ? "details" : value.previewPanel === "COMMENTS" ? "comments" : value.previewPanel === "DATA_TEMPLATE" ? "dataTemplate" : null);
    }).catch(() => undefined);
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
      const overlay = Boolean(shareMenuOpen || shareLaunch || versionOpen || moveMode || renameOpen || workflowOpen || followOpen || node?.closest(".wd-menu, .imkan-modal-backdrop, [data-radix-popper-content-wrapper]"));
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
  }, [open, onClose, onPrevFile, onNextFile, shareMenuOpen, shareLaunch, versionOpen, moveMode, renameOpen, workflowOpen, followOpen]);

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

  const togglePanel = useCallback((next: "details" | "comments" | "dataTemplate" | "watermark" | "zia") => {
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
        if (getLanguageFromMime(effectiveMime, activeTarget.name) === "markdown") return <MarkdownViewer url={url} fileName={activeTarget.name} />;
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
      className={`zoho-preview-rail-btn${panel === key ? " active" : ""}`}
      onClick={() => togglePanel(key)}
      title={title}
      aria-label={title}
      aria-pressed={panel === key}
    >
      <span className="zoho-preview-rail-icon">{icon}</span>
      <span>{title}</span>
      {key === "comments" && commentCount > 0 ? <b className="zoho-rail-badge">{commentCount > 99 ? "99+" : commentCount}</b> : null}
    </button>
  );

  const fileName = info?.file_name || activeTarget.name;
  const runAction = (key: string) => {
    if (key === "openNewTab") openResourceInNewTab("FILE", activeTarget.id);
    else if (key === "share") setShareLaunch("invite");
    else if (key === "copyPermalink") void copyPermalink();
    else if (key === "moveTo") setMoveMode("move");
    else if (key === "copyTo") setMoveMode("copy");
    else if (key === "assignWorkflow") setWorkflowOpen(true);
    else if (key === "organize" || key === "organize:associateDataTemplate") setPanel("dataTemplate");
    else if (key === "searchInFold") {
      window.dispatchEvent(new CustomEvent("workdrive:focus-search"));
      onClose();
    } else if (key === "download") void handleDownload();
    else if (key === "rename") setRenameOpen(true);
    else if (key === "followUpdates") setFollowOpen(true);
    else if (key === "saveAsTemplate") {
      const suggestedName = activeTarget.name.replace(/\.[^.]+$/, "");
      const name = window.prompt(label("menu.saveAsTemplate") || "Save as template", suggestedName);
      if (!name?.trim()) return;
      void saveFileAsTemplate({ fileId: activeTarget.id, name: name.trim(), library: "PERSONAL" })
        .then(() => showToast(label("templates.created") || "Template created"))
        .catch((cause) => showToast(cause instanceof Error ? cause.message : label("preview.error")));
    }
    else if (key === "moreOptions") setPanel("details");
    else if (key === "moveToTrash") {
      if (!window.confirm(label("files.deleteConfirm"))) return;
      void trashFile(activeTarget.id).then(() => onClose()).catch((cause) => showToast(cause instanceof Error ? cause.message : label("preview.error")));
    }
  };
  const applyControl = (action: FileControlAction) => {
    if (!activeTarget) return;
    const ar = locale === "ar";
    if (action === "mark-final" && !window.confirm(ar ? "تعليم هذا الملف كمنتهٍ؟ سيصبح للقراءة فقط." : "Mark this file as final? It will become read-only.")) return;
    if (action === "enable-editing" && !window.confirm(ar ? "تفعيل التعديل لهذا الملف المنتهي؟" : "Enable editing for this final file?")) return;
    void runFileControl(activeTarget.id, action).then((result) => {
      setFileControl({ status: result.isFinal ? "FINAL" : result.checkedOutById ? "CHECKED_OUT" : "ACTIVE", isFinal: result.isFinal, checkedOutById: result.checkedOutById });
      window.dispatchEvent(new CustomEvent("workdrive:file-control", { detail: { id: activeTarget.id, isFinal: result.isFinal, checkedOutById: result.checkedOutById, checkedOutAt: result.checkedOutAt, indexedAt: result.indexedAt } }));
      const done = action === "check-out" ? (ar ? "تم سحب الملف" : "File checked out")
        : action === "check-in" ? (ar ? "تم إرجاع الملف" : "File checked in")
        : action === "mark-final" ? (ar ? "تم التعليم كمنتهٍ" : "Marked as final")
        : action === "enable-editing" ? (ar ? "تم تفعيل التعديل" : "Editing enabled")
        : (ar ? "تم تحديث فهرس البحث" : "Search index refreshed");
      showToast(done);
    }).catch((cause) => showToast(cause instanceof Error ? cause.message : label("preview.error")));
  };

  return (
    <div className="zoho-preview-modal" role="dialog" aria-modal="true" aria-label={`${activeTarget.name} — ${label("preview.title")}`}>
      <header className="zoho-preview-head">
        <div className="zoho-preview-breadcrumb">
          <WorkDriveLogo />
          <span className="zoho-preview-filetype">{extension}</span>
        </div>
        <span className="zoho-preview-file">
          <FileIcon kind="file" mimeType={effectiveMime} name={activeTarget.name} label={label("files.type.file")} />
          <strong title={fileName}>{fileName}</strong>
        </span>
        <div className="zoho-preview-actions">
          <div className="zoho-preview-menu-wrap">
            <button id="preview-share-btn" type="button" className="zoho-preview-share" aria-expanded={shareMenuOpen} aria-haspopup="menu" onClick={() => { setShareMenuOpen((openMenu) => !openMenu); }}>
              <span><Icons.share size={15} /></span>{label("preview.share")}<span><Icons.chevD size={13} /></span>
            </button>
            <ZohoMenu
              open={shareMenuOpen}
              onClose={() => setShareMenuOpen(false)}
              labelledBy="preview-share-btn"
              zIndex={240}
              constrainToLane={false}
              onSelect={(key) => {
                if (key === "addMembers") setShareLaunch("invite");
                else if (key === "externalShareLink") setShareLaunch("link");
              }}
              items={[
                { key: "addMembers", labelKey: "menu.addMembers", icon: FileMenuIcons.addMembers },
                { key: "externalShareLink", labelKey: "menu.externalShareLink", icon: FileMenuIcons.externalShareLink },
              ]}
            />
          </div>
          {category === "office" ? (
            <div className="zoho-preview-menu-wrap">
              <button type="button" className="zoho-preview-outline-btn" onClick={() => {
                const ext = extension.toLowerCase();
                if (["xls", "xlsx", "ods"].includes(ext)) openWith("sheet");
                else if (["ppt", "pptx", "odp"].includes(ext)) openWith("show");
                else openWith("writer");
              }}>{label("preview.openWith")} <span><Icons.chevD size={13} /></span></button>
            </div>
          ) : null}
          <button type="button" className="zoho-preview-icon-top" onClick={() => void copyPermalink()} aria-label={label("preview.copyLink")} title={label("preview.copyLink")}><Icons.link size={15} /></button>
          <button type="button" className="zoho-preview-icon-top" onClick={() => void handleDownload()} aria-label={label("preview.download")} title={label("preview.download")}><Icons.download size={15} /></button>
          <FileActionsMenu
            zIndex={280}
            control={fileControl}
            context={{ resourceType: "FILE", canMutate: true, canShare: true, canFavorite: false }}
            handlers={{
              onCheckOut: () => applyControl("check-out"),
              onCheckIn: () => applyControl("check-in"),
              onMarkFinal: () => applyControl("mark-final"),
              onEnableEditing: () => applyControl("enable-editing"),
              onReindex: () => applyControl("reindex"),
              onOpen: () => runAction("openNewTab"),
              onShare: () => runAction("share"),
              onCopyLink: () => runAction("copyPermalink"),
              onSaveAsTemplate: () => runAction("saveAsTemplate"),
              onMove: () => runAction("moveTo"),
              onCopy: () => runAction("copyTo"),
              onAssignWorkflow: () => runAction("assignWorkflow"),
              onOrganize: () => runAction("organize"),
              onSearchInFolder: () => runAction("searchInFold"),
              onDownload: () => runAction("download"),
              onRename: () => runAction("rename"),
              onFollowUpdates: () => runAction("followUpdates"),
              onComment: () => setPanel("comments"),
              onInspect: () => runAction("moreOptions"),
              onVersionHistory: () => setVersionOpen(true),
              onDelete: () => runAction("moveToTrash"),
            }}
            trigger={<button type="button" className="zoho-preview-icon-top" onClick={() => setShareMenuOpen(false)} aria-label={label("files.actions")} title={label("files.actions")}><Icons.dots size={16} /></button>}
          />
          <button type="button" className="zoho-preview-icon-top close" onClick={onClose} aria-label={label("preview.close")}><Icons.x size={16} /></button>
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

        {panel === "details" ? <DetailsSidebar open fileId={activeTarget.id} fileName={fileName} mimeType={effectiveMime} size={effectiveSize} versionNumber={info?.version_number} updatedAt={info?.updated_at} onClose={() => setPanel(null)} onShare={() => setShareMenuOpen(true)} onViewVersions={() => setVersionOpen(true)} /> : null}
        {panel === "comments" ? <FileCommentsPanel fileId={activeTarget.id} focusCommentId={focusCommentId} onCount={setCommentCount} onClose={() => setPanel(null)} /> : null}
        {panel === "dataTemplate" ? <DataTemplateSidebar open fileId={activeTarget.id} onClose={() => setPanel(null)} /> : null}
        {panel === "watermark" ? <WatermarkSidebar open fileId={activeTarget.id} config={watermarkConfig} onChange={setWatermarkConfig} onClose={() => setPanel(null)} /> : null}
        {panel === "zia" ? (
          <aside className="zoho-preview-panel zoho-zia-panel" dir={label("preview.title") === "معاينة الملف" ? "rtl" : "ltr"}>
            <header className="zoho-preview-panel-head"><div><h2>Zia</h2><p>{activeTarget.name}</p></div><button type="button" className="zoho-panel-close" onClick={() => setPanel(null)}>×</button></header>
            <div className="zoho-preview-panel-body"><div className="zoho-panel-empty"><div className="zoho-panel-empty-icon">✦</div><strong>{label("preview.ziaComingSoon") || "Zia insights"}</strong><span>{label("preview.ziaComingSoonDescription") || "Zia actions for file summaries and insights are available from supported editors."}</span></div></div>
          </aside>
        ) : null}

        <nav className="zoho-preview-rail" aria-label="Preview tools">
          {railButton("details", <Icons.info size={16} />, label("preview.details") || "Details")}
          {railButton("comments", <Icons.horn size={16} />, label("preview.comments") || "Comments")}
          {railButton("dataTemplate", <Icons.layout size={16} />, label("preview.dataTemplates") || "Data Templates")}
          {railButton("watermark", <Icons.shield size={16} />, label("preview.watermark") || "Watermark")}
          {railButton("zia", <Icons.spark size={16} />, "Zia")}
          <div className="zoho-preview-rail-spacer" />
        </nav>
      </div>

      {toast ? <div className="zoho-preview-toast" role="status">{toast}</div> : null}
      {shareLaunch ? (
        <ShareModal
          resourceType="FILE"
          resourceId={activeTarget.id}
          resourceName={fileName}
          launchMode={shareLaunch}
          onClose={() => setShareLaunch(null)}
        />
      ) : null}
      <VersionHistoryDrawer
        isOpen={versionOpen}
        onClose={() => setVersionOpen(false)}
        fileId={activeTarget.id}
        fileName={fileName}
        mimeType={effectiveMime}
        size={effectiveSize}
        canWrite
        onRestored={() => void refresh()}
      />
      {moveMode ? (
        <MoveModal
          resourceType="FILE"
          resourceId={activeTarget.id}
          resourceName={fileName}
          mode={moveMode}
          onClose={() => setMoveMode(null)}
          onMove={async (destinationFolderId, templateId, customFields) => {
            if (moveMode === "copy") await copyFile(activeTarget.id, destinationFolderId, templateId, customFields);
            else {
              await moveFile(activeTarget.id, destinationFolderId, templateId, customFields);
              onClose();
            }
          }}
        />
      ) : null}
      {renameOpen ? (
        <RenameModal
          currentName={fileName}
          onClose={() => setRenameOpen(false)}
          onSubmit={async (name) => { await renameFile(activeTarget.id, name); void refresh(); }}
        />
      ) : null}
      {workflowOpen ? (
        <WorkflowPicker
          resourceType="FILE"
          resourceId={activeTarget.id}
          resourceName={fileName}
          onClose={() => setWorkflowOpen(false)}
          onStarted={() => undefined}
        />
      ) : null}
      {followOpen ? (
        <FollowUpdatesModal
          targets={[{ type: "FILE", id: activeTarget.id, name: fileName }]}
          onClose={() => setFollowOpen(false)}
          onChanged={(messageKey, name) => { if (messageKey) showToast(label(messageKey).replace("{name}", name || fileName)); }}
        />
      ) : null}
    </div>
  );
}
