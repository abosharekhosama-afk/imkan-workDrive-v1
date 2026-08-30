"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocale } from "../locale-provider";
import { PreviewToolbar } from "../preview-toolbar";
import { getPreviewMimeCategory, getLanguageFromMime, type PreviewMimeCategory } from "../../lib/api/preview";
import { useBlobPreview } from "../../lib/preview-blob";
import { useRangedStream } from "../../lib/use-ranged-stream";

interface FilePreviewProps {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  previewUrl: string;
  versionNumber?: number;
  onDownload?: () => void;
  onOpenInNewTab?: () => void;
  canDownload?: boolean;
  onPageChange?: (page: number) => void;
  onZoomChange?: (zoom: number) => void;
  onRotationChange?: (rotation: number) => void;
  /**
   * When true, media (`video/*`, `audio/*`) is loaded through progressive
   * HTTP-Range hops against `/files/:id/stream` instead of a single blob
   * download, so playback starts before the whole file has transferred.
   */
  rangeStream?: boolean;
}

interface PreviewComponentProps {
  previewUrl: string;
  fileName: string;
  mimeType: string;
  size: number;
  versionNumber?: number;
  onPageChange?: (page: number) => void;
  onZoomChange?: (zoom: number) => void;
  onRotationChange?: (rotation: number) => void;
  onOpenInNewTab?: () => void;
  onDownload?: () => void;
  objectUrl: string | null;
  blobError: string | null;
  blobLoading: boolean;
  onBlobRetry: () => void;
}

function UnsupportedPreview({ fileName, mimeType, previewUrl, onOpenInNewTab, onDownload, objectUrl, blobError, blobLoading, onBlobRetry }: PreviewComponentProps) {
  const { label } = useLocale();
  const typeLabelKey = ("preview.type." + getPreviewMimeCategory(mimeType)) as "preview.type.pdf" | "preview.type.image" | "preview.type.video" | "preview.type.audio" | "preview.type.text";
  
  if (blobLoading) {
    return <LoadingPreview fileName={fileName} />;
  }

  if (blobError) {
    return <ErrorPreview fileName={fileName} error={blobError} onRetry={onBlobRetry} />;
  }

  if (!previewUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="imkan-icon text-6xl mb-4 text-[color:var(--imkan-color-error)]">⚠️</div>
        <h3 className="text-lg font-medium mb-2">{label("preview.error")}</h3>
        <p className="text-sm text-[color:var(--imkan-color-muted)] mb-4">{label("preview.urlMissing")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <div className="imkan-icon text-6xl mb-4 text-[color:var(--imkan-color-muted)]">📄</div>
      <h3 className="text-lg font-medium mb-2">{label("preview.unsupported")}</h3>
      <p className="text-sm text-[color:var(--imkan-color-muted)] mb-4">
        {label(typeLabelKey) || mimeType}
      </p>
      <div className="flex gap-2">
        <button className="imkan-button" onClick={() => window.open(objectUrl || previewUrl, "_blank")}>
          {label("preview.openInNewTab")}
        </button>
        {onDownload && (
          <button className="imkan-button-secondary" onClick={onDownload}>
            {label("preview.download")}
          </button>
        )}
      </div>
    </div>
  );
}

function LoadingPreview({ fileName }: { fileName: string }) {
  const { label } = useLocale();
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <div className="animate-spin rounded-full h-10 w-10 border-3 border-[color:var(--imkan-color-primary)] border-t-transparent mb-4" />
      <p className="text-[color:var(--imkan-color-muted)]">{label("preview.loading")}</p>
      <p className="text-sm text-[color:var(--imkan-color-muted)]">{fileName}</p>
    </div>
  );
}

function ErrorPreview({ fileName, error, onRetry }: { fileName: string; error: string; onRetry: () => void }) {
  const { label } = useLocale();
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <div className="imkan-icon text-6xl mb-4 text-[color:var(--imkan-color-error)]">⚠️</div>
      <h3 className="text-lg font-medium mb-2">{label("preview.error")}</h3>
      <p className="text-sm text-[color:var(--imkan-color-muted)] mb-4">{fileName}</p>
      <p className="text-sm text-[color:var(--imkan-color-error)] mb-4">{error}</p>
      <button className="imkan-button" onClick={onRetry}>{label("preview.retry")}</button>
    </div>
  );
}

export function FilePreview({
  fileId,
  fileName,
  mimeType,
  size,
  previewUrl,
  versionNumber,
  onDownload,
  onOpenInNewTab,
  canDownload = true,
  onPageChange,
  onZoomChange,
  onRotationChange,
  rangeStream = false,
}: FilePreviewProps) {
  const { label } = useLocale();
  const category = getPreviewMimeCategory(mimeType);
  const isStreamableMedia = rangeStream && (category === "video" || category === "audio");

  const ranged = useRangedStream(isStreamableMedia ? previewUrl : undefined, mimeType);
  const { objectUrl, error: blobError, isLoading: blobLoading, retry: onBlobRetry } = useBlobPreview(previewUrl, mimeType, !isStreamableMedia);

  // When Range streaming owns the resource, media players receive the growing
  // Blob URL from the stream loader instead of the (disabled) full-blob path.
  const mediaSource = isStreamableMedia
    ? {
        objectUrl: ranged.objectUrl,
        blobError: ranged.error,
        blobLoading: ranged.loading,
        onBlobRetry: ranged.retry,
      }
    : { objectUrl, blobError, blobLoading, onBlobRetry };

  const renderPreview = (): ReactNode => {
    switch (category) {
      case "pdf":
        return <PdfPreview previewUrl={previewUrl} fileName={fileName} mimeType={mimeType} size={size} versionNumber={versionNumber} onPageChange={onPageChange} onZoomChange={onZoomChange} objectUrl={objectUrl} blobError={blobError} blobLoading={blobLoading} onBlobRetry={onBlobRetry} />;
      case "image":
        return <ImagePreview previewUrl={previewUrl} fileName={fileName} mimeType={mimeType} size={size} versionNumber={versionNumber} onZoomChange={onZoomChange} onRotationChange={onRotationChange} objectUrl={objectUrl} blobError={blobError} blobLoading={blobLoading} onBlobRetry={onBlobRetry} />;
      case "video":
        return <VideoPreview previewUrl={previewUrl} fileName={fileName} mimeType={mimeType} size={size} versionNumber={versionNumber} {...mediaSource} />;
      case "audio":
        return <AudioPreview previewUrl={previewUrl} fileName={fileName} mimeType={mimeType} size={size} versionNumber={versionNumber} {...mediaSource} />;
      case "text":
        return <TextPreview previewUrl={previewUrl} fileName={fileName} mimeType={mimeType} size={size} versionNumber={versionNumber} objectUrl={objectUrl} blobError={blobError} blobLoading={blobLoading} onBlobRetry={onBlobRetry} />;
      default:
        return <UnsupportedPreview previewUrl={previewUrl} fileName={fileName} mimeType={mimeType} size={size} versionNumber={versionNumber} onOpenInNewTab={onOpenInNewTab} onDownload={onDownload} objectUrl={objectUrl} blobError={blobError} blobLoading={blobLoading} onBlobRetry={onBlobRetry} />;
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <PreviewToolbar
        category={category}
        onDownload={onDownload}
        onOpenInNewTab={onOpenInNewTab}
        canDownload={canDownload}
      />
      <div className="flex-1 overflow-hidden relative min-h-0">
        {renderPreview()}
      </div>
    </div>
  );
}

function PdfPreview({
  previewUrl,
  fileName,
  mimeType,
  size,
  versionNumber,
  onPageChange,
  onZoomChange,
  objectUrl,
  blobError,
  blobLoading,
  onBlobRetry,
}: PreviewComponentProps) {
  const { label } = useLocale();
  const [pdfInstance, setPdfInstance] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const loadingTaskRef = useRef<any>(null);

  const minZoom = 0.5;
  const maxZoom = 3;

  const loadPdf = async () => {
    if (!objectUrl) {
      if (blobLoading) return;
      if (blobError) {
        setLoadError(blobError);
        return;
      }
      setLoadError("Preview URL is not available");
      return;
    }

    setLoadError(null);
    try {
      const pdfjsLib = await import("pdfjs-dist");
      
      const pdfjsVersion = pdfjsLib.version || "4.8.69";
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`;
      
      loadingTaskRef.current = pdfjsLib.getDocument({ url: objectUrl });
      const pdf = await loadingTaskRef.current.promise;
      setPdfInstance(pdf);
      setTotalPages(pdf.numPages);
      setCurrentPage(1);
    } catch (err: any) {
      console.error("PDF load error:", err);
      if (err.name !== "AbortError" && err.name !== "CancelError") {
        setLoadError(err.message || "Failed to load PDF");
      }
    }
  };

  useEffect(() => {
    if (objectUrl) {
      loadPdf();
    }
    return () => {
      if (loadingTaskRef.current) {
        loadingTaskRef.current.cancel();
        loadingTaskRef.current = null;
      }
      if (pdfInstance) {
        pdfInstance.cleanup();
      }
    };
  }, [objectUrl]);

  const renderPage = async (pageNum: number) => {
    if (!pdfInstance || !containerRef.current) return;
    
    try {
      const page = await pdfInstance.getPage(pageNum);
      const viewport = page.getViewport({ scale: zoomLevel });
      
      let canvas = canvasRefs.current.get(pageNum);
      if (!canvas) {
        canvas = document.createElement("canvas");
        canvasRefs.current.set(pageNum, canvas);
      }
      
      const context = canvas.getContext("2d");
      if (!context) return;
      
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };
      
      await page.render(renderContext).promise;
      
      const pageContainer = containerRef.current.querySelector(`[data-page="${pageNum}"]`);
      if (pageContainer) {
        pageContainer.innerHTML = "";
        pageContainer.appendChild(canvas);
      }
    } catch (err) {
      console.error("Page render error:", err);
    }
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    setCurrentPage(newPage);
    onPageChange?.(newPage);
  };

  const handleZoomChange = (newZoom: number) => {
    const clampedZoom = Math.max(minZoom, Math.min(maxZoom, newZoom));
    setZoomLevel(clampedZoom);
    onZoomChange?.(clampedZoom);
    
    if (pdfInstance) {
      for (let i = 1; i <= totalPages; i++) {
        renderPage(i);
      }
    }
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (!query.trim() || !pdfInstance) {
      setSearchResults([]);
      return;
    }
    
    const results: any[] = [];
    for (let i = 1; i <= totalPages; i++) {
      const page = await pdfInstance.getPage(i);
      const textContent = await page.getTextContent();
      const text = textContent.items.map((item: any) => item.str).join(" ");
      if (text.toLowerCase().includes(query.toLowerCase())) {
        results.push({ page: i, text });
      }
    }
    setSearchResults(results);
    setCurrentSearchIndex(0);
    if (results.length > 0) {
      handlePageChange(results[0].page);
    }
  };

  const handleNextSearch = () => {
    if (searchResults.length === 0) return;
    const nextIndex = (currentSearchIndex + 1) % searchResults.length;
    setCurrentSearchIndex(nextIndex);
    handlePageChange(searchResults[nextIndex].page);
  };

  const handlePrevSearch = () => {
    if (searchResults.length === 0) return;
    const prevIndex = (currentSearchIndex - 1 + searchResults.length) % searchResults.length;
    setCurrentSearchIndex(prevIndex);
    handlePageChange(searchResults[prevIndex].page);
  };

  return (
    <div className="flex flex-col h-full">
      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-[color:var(--imkan-color-surface)] p-4"
        style={{ background: "#f5f5f5" }}
      >
        {loadError ? (
          <div className="text-center text-[color:var(--imkan-color-error)] py-20">
            <div className="imkan-icon text-6xl mb-4">⚠️</div>
            <p>{label("preview.error")}: {loadError}</p>
            <button className="imkan-button mt-4" onClick={loadPdf}>{label("preview.retry")}</button>
          </div>
        ) : pdfInstance ? (
          Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
            <div
              key={pageNum}
              data-page={pageNum}
              className="mx-auto mb-4 shadow-lg bg-white"
              style={{
                transform: `scale(${zoomLevel})`,
                transformOrigin: "top center",
              }}
            />
          ))
        ) : (
          <div className="text-center text-[color:var(--imkan-color-muted)] py-20">{label("preview.loading")}</div>
        )}
      </div>
    </div>
  );
}

function ImagePreview({
  previewUrl,
  fileName,
  mimeType,
  size,
  versionNumber,
  onZoomChange,
  onRotationChange,
  objectUrl,
  blobError,
  blobLoading,
  onBlobRetry,
}: PreviewComponentProps) {
  const { label } = useLocale();
  const [zoomLevel, setZoomLevel] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [naturalWidth, setNaturalWidth] = useState(0);
  const [naturalHeight, setNaturalHeight] = useState(0);
  const [showMetadata, setShowMetadata] = useState(false);
  const [imageError, setImageError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const minZoom = 0.25;
  const maxZoom = 5;

  useEffect(() => {
    setImageError(false);
    setNaturalWidth(0);
    setNaturalHeight(0);
    setZoomLevel(1);
    setRotation(0);
    setPanOffset({ x: 0, y: 0 });
  }, [objectUrl]);

  const handleImageLoad = () => {
    if (imgRef.current) {
      setNaturalWidth(imgRef.current.naturalWidth);
      setNaturalHeight(imgRef.current.naturalHeight);
    }
  };

  const handleImageError = () => {
    setImageError(true);
  };

  if (blobLoading) {
    return <LoadingPreview fileName={fileName} />;
  }

  if (blobError) {
    return <ErrorPreview fileName={fileName} error={blobError} onRetry={onBlobRetry} />;
  }

  const handleZoomChange = (delta: number) => {
    const newZoom = Math.max(minZoom, Math.min(maxZoom, zoomLevel + delta));
    setZoomLevel(newZoom);
    onZoomChange?.(newZoom);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      handleZoomChange(e.deltaY > 0 ? -0.1 : 0.1);
    } else {
      setPanOffset(prev => ({
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY,
      }));
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0 || e.button === 1) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
      e.preventDefault();
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    setPanOffset({
      x: e.clientX - panStart.x,
      y: e.clientY - panStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const handleRotate = () => {
    const newRotation = (rotation + 90) % 360;
    setRotation(newRotation);
    onRotationChange?.(newRotation);
  };

  const transformStyle = {
    transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel}) rotate(${rotation}deg)`,
    transformOrigin: "center center",
    cursor: isPanning ? "grabbing" : "grab",
  };

  if (imageError || !objectUrl) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[color:var(--imkan-color-surface)]">
        <div className="text-center p-8">
          <div className="imkan-icon text-6xl mb-4 text-[color:var(--imkan-color-error)]">🖼️</div>
          <p className="text-[color:var(--imkan-color-error)]">{label("preview.error")}: {label("preview.imageLoadFailed")}</p>
          <button className="imkan-button mt-4" onClick={() => setImageError(false)}>
            {label("preview.retry")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-auto bg-[color:var(--imkan-color-surface)] flex items-center justify-center"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div style={transformStyle} className="max-w-full max-h-full">
        <img
          ref={imgRef}
          src={objectUrl}
          alt={fileName}
          onLoad={handleImageLoad}
          onError={handleImageError}
          style={{
            maxWidth: "100%",
            maxHeight: "100vh",
            objectFit: "contain",
          }}
        />
      </div>
      <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between pointer-events-none">
        <div className="pointer-events-auto flex gap-2">
          <button className="imkan-button-secondary p-2" onClick={() => handleZoomChange(0.2)} aria-label={label("preview.zoomIn")}>+</button>
          <button className="imkan-button-secondary p-2" onClick={() => handleZoomChange(-0.2)} aria-label={label("preview.zoomOut")}>-</button>
          <button className="imkan-button-secondary p-2" onClick={handleRotate} aria-label={label("preview.rotate")}>⟳</button>
          <button className="imkan-button-secondary p-2" onClick={() => { setZoomLevel(1); setRotation(0); setPanOffset({ x: 0, y: 0 }); onZoomChange?.(1); onRotationChange?.(0); }} aria-label={label("preview.reset")}>⌂</button>
        </div>
        {showMetadata && naturalWidth > 0 && (
          <div className="pointer-events-auto bg-[color:var(--imkan-color-surface)] border border-[color:var(--imkan-color-border)] rounded-sm p-3 text-sm shadow-lg">
            <div><strong>{label("preview.metadata.dimensions")}:</strong> {naturalWidth} × {naturalHeight} px</div>
            <div><strong>{label("preview.metadata.format")}:</strong> {mimeType}</div>
            <div><strong>{label("preview.metadata.size")}:</strong> {formatSize(size)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function VideoPreview({
  previewUrl,
  fileName,
  mimeType,
  size,
  versionNumber,
  objectUrl,
  blobError,
  blobLoading,
  onBlobRetry,
}: PreviewComponentProps) {
  const { label } = useLocale();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [videoWidth, setVideoWidth] = useState(0);
  const [videoHeight, setVideoHeight] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setError(null);
    setDuration(0);
    setVideoWidth(0);
    setVideoHeight(0);
    setIsLoading(true);
  }, [objectUrl]);

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      setVideoWidth(videoRef.current.videoWidth);
      setVideoHeight(videoRef.current.videoHeight);
      setIsLoading(false);
    }
  };

  const handleError = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    const errorCode = video.error?.code;
    let errorMessage = label("preview.error");
    // HTMLMediaElement error codes: 1=MEDIA_ERR_ABORTED, 2=MEDIA_ERR_NETWORK, 3=MEDIA_ERR_DECODE, 4=MEDIA_ERR_SRC_NOT_SUPPORTED
    if (errorCode === 4) {
      errorMessage = label("preview.videoFormatNotSupported");
    } else if (errorCode === 2) {
      errorMessage = label("preview.videoNetworkError");
    } else if (errorCode === 3) {
      errorMessage = label("preview.videoDecodeError");
    }
    setError(errorMessage);
    setIsLoading(false);
  };

  const handleCanPlay = () => {
    setIsLoading(false);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (blobLoading) {
    return <LoadingPreview fileName={fileName} />;
  }

  if (blobError) {
    return <ErrorPreview fileName={fileName} error={blobError} onRetry={onBlobRetry} />;
  }

  if (!objectUrl) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[color:var(--imkan-color-surface)]">
        <div className="text-center p-8 text-[color:var(--imkan-color-muted)]">{label("preview.loading")}</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-[color:var(--imkan-color-surface)]">
      {error ? (
        <div className="text-center p-8">
          <div className="imkan-icon text-6xl mb-4 text-[color:var(--imkan-color-error)]">🎬</div>
          <p className="text-[color:var(--imkan-color-error)]">{error}</p>
          <a href={objectUrl} target="_blank" rel="noopener noreferrer" className="imkan-button mt-4">
            {label("preview.openInNewTab")}
          </a>
        </div>
      ) : (
        <div className="w-full max-w-full">
          {isLoading && (
            <div className="flex items-center justify-center h-[70vh]">
              <div className="animate-spin rounded-full h-10 w-10 border-3 border-[color:var(--imkan-color-primary)] border-t-transparent" />
            </div>
          )}
          <video
            ref={videoRef}
            src={objectUrl}
            controls
            preload="metadata"
            onLoadedMetadata={handleLoadedMetadata}
            onError={handleError}
            onCanPlay={handleCanPlay}
            className="w-full max-h-[70vh] object-contain"
          />
          {(duration || videoWidth || videoHeight) && (
            <div className="mt-2 text-sm text-[color:var(--imkan-color-muted)] flex items-center justify-center gap-4 flex-wrap">
              {duration > 0 && <span>{label("preview.metadata.duration").replace("{time}", formatTime(duration))}</span>}
              {videoWidth > 0 && videoHeight > 0 && <span>{label("preview.metadata.dimensions").replace("{width}", String(videoWidth)).replace("{height}", String(videoHeight))}</span>}
              <span>{label("preview.metadata.size").replace("{size}", formatSize(size))}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AudioPreview({
  fileName,
  mimeType,
  size,
  objectUrl,
  blobError,
  blobLoading,
  onBlobRetry,
}: PreviewComponentProps) {
  const { label } = useLocale();

  if (blobLoading) {
    return <LoadingPreview fileName={fileName} />;
  }

  if (blobError) {
    return <ErrorPreview fileName={fileName} error={blobError} onRetry={onBlobRetry} />;
  }

  if (!objectUrl) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[color:var(--imkan-color-surface)]">
        <div className="text-center p-8 text-[color:var(--imkan-color-muted)]">{label("preview.loading")}</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-[color:var(--imkan-color-surface)] gap-4 p-8">
      <div className="wd-empty-icon" aria-hidden="true">🎧</div>
      <p className="text-sm font-medium text-[color:var(--imkan-color-fg)]">{fileName}</p>
      <audio src={objectUrl} controls preload="metadata" className="w-full max-w-md" aria-label={fileName} />
      <span className="text-xs text-[color:var(--imkan-color-muted)]">{mimeType} · {formatSize(size)}</span>
    </div>
  );
}

function TextPreview({
  previewUrl,
  fileName,
  mimeType,
  size,
  versionNumber,
  objectUrl,
  blobError,
  blobLoading,
  onBlobRetry,
}: PreviewComponentProps) {
  const { label } = useLocale();
  const [content, setContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!objectUrl) {
      if (blobLoading) return;
      if (blobError) {
        setError(blobError);
        setIsLoading(false);
        return;
      }
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    setError(null);
    setContent("");
    fetch(objectUrl, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.text();
      })
      .then((text) => {
        setContent(text);
        setIsLoading(false);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setError(err.message);
          setIsLoading(false);
        }
      });
    return () => controller.abort();
  }, [objectUrl]);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  const copyLine = async (line: string, lineNumber: number) => {
    try {
      await navigator.clipboard.writeText(line);
    } catch (err) {
      console.error("Copy line failed:", err);
    }
  };

  const lines = content.split("\n");

  if (blobLoading) {
    return <LoadingPreview fileName={fileName} />;
  }

  if (blobError) {
    return <ErrorPreview fileName={fileName} error={blobError} onRetry={onBlobRetry} />;
  }

  if (!objectUrl) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[color:var(--imkan-color-surface)]">
        <div className="text-center p-8 text-[color:var(--imkan-color-muted)]">{label("preview.loading")}</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between p-2 border-b border-[color:var(--imkan-color-border)] bg-[color:var(--imkan-color-surface)]">
        <span className="text-sm text-[color:var(--imkan-color-muted)]">
          {label("preview.type.text")} • {lines.length} {label("preview.lines").replace("{count}", String(lines.length))} • {formatSize(size)}
        </span>
        <button
          className="imkan-button-secondary text-sm"
          onClick={copyToClipboard}
          aria-label={copied ? label("preview.copied") : label("preview.copy")}
        >
          {copied ? label("preview.copied") : label("preview.copy")}
        </button>
      </div>
      <div className="flex-1 overflow-auto p-4 font-mono text-sm" style={{ lineHeight: 1.6 }}>
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-[color:var(--imkan-color-primary)] border-t-transparent" />
          </div>
        ) : error ? (
          <div className="text-center p-8 text-[color:var(--imkan-color-error)]">
            {label("preview.error")}: {error}
            <button className="imkan-button mt-4" onClick={() => { setIsLoading(true); setError(null); }}>{label("preview.retry")}</button>
          </div>
        ) : (
          <div className="grid grid-cols-[auto_1fr] gap-x-4">
            <div className="text-right text-[color:var(--imkan-color-muted)] select-none py-2 border-r border-[color:var(--imkan-color-border)] pr-2">
              {lines.map((_, index) => (
                <div key={index} className="line-number">{index + 1}</div>
              ))}
            </div>
            <pre className="whitespace-pre-wrap break-words">{content}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}