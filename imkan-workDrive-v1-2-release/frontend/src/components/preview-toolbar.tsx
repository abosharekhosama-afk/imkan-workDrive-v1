"use client";

import { useLocale } from "./locale-provider";

interface PreviewToolbarProps {
  category: "pdf" | "image" | "video" | "audio" | "text" | "office" | "archive" | "unsupported";
  currentPage?: number;
  totalPages?: number;
  zoomLevel?: number;
  minZoom?: number;
  maxZoom?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomReset?: () => void;
  onPrevPage?: () => void;
  onNextPage?: () => void;
  onPageChange?: (page: number) => void;
  onRotate?: () => void;
  onSearch?: (query: string) => void;
  searchQuery?: string;
  onDownload?: () => void;
  onOpenInNewTab?: () => void;
  canDownload?: boolean;
  rotation?: number;
}

export function PreviewToolbar({
  category,
  currentPage,
  totalPages,
  zoomLevel = 1,
  minZoom = 0.25,
  maxZoom = 5,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onPrevPage,
  onNextPage,
  onPageChange,
  onRotate,
  onSearch,
  searchQuery,
  onDownload,
  onOpenInNewTab,
  canDownload = true,
  rotation = 0,
}: PreviewToolbarProps) {
  const { label } = useLocale();
  const zoomPercent = Math.round(zoomLevel * 100);

  const showPageNav = category === "pdf" && totalPages && totalPages > 1;
  const showZoom = category !== "unsupported";
  const showRotate = category === "image";
  const showSearch = category === "pdf";

  return (
    <div
      className="imkan-toolbar flex items-center gap-2 bg-[color:var(--imkan-color-surface)] px-3 py-2 rounded-sm border border-[color:var(--imkan-color-border)] flex-wrap"
      role="toolbar"
      aria-label={label("preview.toolbar")}
    >
      {showSearch && (
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <label htmlFor="preview-search" className="sr-only">{label("preview.search")}</label>
          <input
            id="preview-search"
            type="search"
            value={searchQuery ?? ""}
            onChange={(e) => onSearch?.(e.target.value)}
            placeholder={label("preview.searchPlaceholder")}
            className="imkan-input flex-1 text-sm"
            aria-label={label("preview.search")}
          />
        </div>
      )}

      <div className="flex items-center gap-1 border-l border-[color:var(--imkan-color-border)] pl-3">
        {showZoom && (
          <>
            <button
              type="button"
              className="imkan-button-secondary p-1"
              onClick={onZoomOut}
              disabled={zoomLevel <= minZoom}
              aria-label={label("preview.zoomOut")}
              title={label("preview.zoomOut")}
            >
              −
            </button>
            <span className="px-2 text-sm text-[color:var(--imkan-color-muted)]" aria-live="polite">
              {zoomPercent}%
            </span>
            <button
              type="button"
              className="imkan-button-secondary p-1"
              onClick={onZoomIn}
              disabled={zoomLevel >= maxZoom}
              aria-label={label("preview.zoomIn")}
              title={label("preview.zoomIn")}
            >
              +
            </button>
            <button
              type="button"
              className="imkan-button-secondary p-1 px-2 text-xs"
              onClick={onZoomReset}
              aria-label={label("preview.zoomReset")}
              title={label("preview.zoomReset")}
            >
              {label("preview.zoomReset")}
            </button>
          </>
        )}

        {showPageNav && (
          <>
            <div className="w-px h-6 bg-[color:var(--imkan-color-border)] mx-2" />
            <button
              type="button"
              className="imkan-button-secondary p-1"
              onClick={onPrevPage}
              disabled={!currentPage || currentPage <= 1}
              aria-label={label("preview.prevPage")}
              title={label("preview.prevPage")}
            >
              ‹
            </button>
            <span className="px-2 text-sm" aria-live="polite">
              {label("preview.page").replace("{current}", String(currentPage ?? 1)).replace("{total}", String(totalPages ?? 1))}
            </span>
            <button
              type="button"
              className="imkan-button-secondary p-1"
              onClick={onNextPage}
              disabled={!currentPage || !totalPages || currentPage >= totalPages}
              aria-label={label("preview.nextPage")}
              title={label("preview.nextPage")}
            >
              ›
            </button>
            {onPageChange && totalPages && (
              <input
                type="number"
                min={1}
                max={totalPages}
                value={currentPage ?? 1}
                onChange={(e) => onPageChange?.(parseInt(e.target.value) || 1)}
                className="w-16 text-sm text-center border border-[color:var(--imkan-color-muted)] bg-background px-1 py-0.5"
                aria-label={label("preview.goToPage")}
              />
            )}
          </>
        )}

        {showRotate && onRotate && (
          <>
            <div className="w-px h-6 bg-[color:var(--imkan-color-border)] mx-2" />
            <button
              type="button"
              className="imkan-button-secondary p-1"
              onClick={onRotate}
              aria-label={label("preview.rotate")}
              title={`${label("preview.rotate")} (${rotation}°)`}
            >
              ↻
            </button>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 ml-auto border-l border-[color:var(--imkan-color-border)] pl-3">
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
  );
}