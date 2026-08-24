"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocale } from "../locale-provider";
import { PreviewToolbar } from "../preview-toolbar";
import { getPreviewMimeCategory, getLanguageFromMime, type PreviewMimeCategory } from "../../lib/api/preview";

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
}

function UnsupportedPreview({ fileName, mimeType, previewUrl, onOpenInNewTab }: PreviewComponentProps & { onOpenInNewTab?: () => void }) {
  const { label } = useLocale();
  const typeLabelKey = "preview.type." + getPreviewMimeCategory(mimeType) as "preview.type.pdf" | "preview.type.image" | "preview.type.video" | "preview.type.text";
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <div className="imkan-icon text-6xl mb-4 text-[color:var(--imkan-color-muted)]">📄</div>
      <h3 className="text-lg font-medium mb-2">{label("preview.unsupported")}</h3>
      <p className="text-sm text-[color:var(--imkan-color-muted)] mb-4">
        {label(typeLabelKey) || mimeType}
      </p>
      <div className="flex gap-2">
        <button className="imkan-button" onClick={() => window.open(previewUrl, "_blank")}>
          {label("preview.openInNewTab")}
        </button>
        {onOpenInNewTab && (
          <button className="imkan-button-secondary" onClick={onOpenInNewTab}>
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
}: FilePreviewProps) {
  const { label } = useLocale();
  const category = getPreviewMimeCategory(mimeType);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const handleRetry = () => {
    setError(null);
    setIsLoading(true);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [previewUrl]);

  if (isLoading) {
    return <LoadingPreview fileName={fileName} />;
  }

  if (error) {
    return <ErrorPreview fileName={fileName} error={error} onRetry={handleRetry} />;
  }

  const renderPreview = (): ReactNode => {
    switch (category) {
      case "pdf":
        return <PdfPreview previewUrl={previewUrl} fileName={fileName} mimeType={mimeType} size={size} versionNumber={versionNumber} onPageChange={onPageChange} onZoomChange={onZoomChange} />;
      case "image":
        return <ImagePreview previewUrl={previewUrl} fileName={fileName} mimeType={mimeType} size={size} versionNumber={versionNumber} onZoomChange={onZoomChange} onRotationChange={onRotationChange} />;
      case "video":
        return <VideoPreview previewUrl={previewUrl} fileName={fileName} mimeType={mimeType} size={size} versionNumber={versionNumber} />;
      case "text":
        return <TextPreview previewUrl={previewUrl} fileName={fileName} mimeType={mimeType} size={size} versionNumber={versionNumber} />;
      default:
        return <UnsupportedPreview previewUrl={previewUrl} fileName={fileName} mimeType={mimeType} size={size} versionNumber={versionNumber} onOpenInNewTab={onOpenInNewTab} />;
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
}: PreviewComponentProps) {
  const { label } = useLocale();
  const [pdfInstance, setPdfInstance] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());

  const minZoom = 0.5;
  const maxZoom = 3;

  const loadPdf = async () => {
    try {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
      
      const loadingTask = pdfjsLib.getDocument({ url: previewUrl });
      const pdf = await loadingTask.promise;
      setPdfInstance(pdf);
      setTotalPages(pdf.numPages);
    } catch (err) {
      console.error("PDF load error:", err);
    }
  };

  useEffect(() => {
    loadPdf();
  }, [previewUrl]);

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
        {pdfInstance && Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
          <div
            key={pageNum}
            data-page={pageNum}
            className="mx-auto mb-4 shadow-lg bg-white"
            style={{
              transform: `scale(${zoomLevel})`,
              transformOrigin: "top center",
            }}
          />
        ))}
        {!pdfInstance && <div className="text-center text-[color:var(--imkan-color-muted)] py-20">{label("preview.loading")}</div>}
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
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const minZoom = 0.25;
  const maxZoom = 5;

  const handleImageLoad = () => {
    if (imgRef.current) {
      setNaturalWidth(imgRef.current.naturalWidth);
      setNaturalHeight(imgRef.current.naturalHeight);
    }
  };

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

  const handleReset = () => {
    setZoomLevel(1);
    setRotation(0);
    setPanOffset({ x: 0, y: 0 });
    onZoomChange?.(1);
    onRotationChange?.(0);
  };

  const transformStyle = {
    transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel}) rotate(${rotation}deg)`,
    transformOrigin: "center center",
    cursor: isPanning ? "grabbing" : "grab",
  };

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
          src={previewUrl}
          alt={fileName}
          onLoad={handleImageLoad}
          style={{
            maxWidth: "100%",
            maxHeight: "100vh",
            objectFit: "contain",
          }}
        />
      </div>
      {showMetadata && naturalWidth > 0 && (
        <div className="absolute bottom-4 right-4 bg-[color:var(--imkan-color-surface)] border border-[color:var(--imkan-color-border)] rounded-sm p-3 text-sm shadow-lg">
          <div><strong>{label("preview.metadata.dimensions")}:</strong> {naturalWidth} × {naturalHeight} px</div>
          <div><strong>{label("preview.metadata.format")}:</strong> {mimeType}</div>
          <div><strong>{label("preview.metadata.size")}:</strong> {formatSize(size)}</div>
        </div>
      )}
    </div>
  );
}

function VideoPreview({
  previewUrl,
  fileName,
  mimeType,
  size,
  versionNumber,
}: PreviewComponentProps) {
  const { label } = useLocale();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [videoWidth, setVideoWidth] = useState(0);
  const [videoHeight, setVideoHeight] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      setVideoWidth(videoRef.current.videoWidth);
      setVideoHeight(videoRef.current.videoHeight);
    }
  };

  const handleError = () => {
    setError(label("preview.error"));
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-[color:var(--imkan-color-surface)]">
      {error ? (
        <div className="text-center p-8">
          <div className="imkan-icon text-6xl mb-4 text-[color:var(--imkan-color-error)]">🎬</div>
          <p className="text-[color:var(--imkan-color-error)]">{error}</p>
          <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="imkan-button mt-4">
            {label("preview.openInNewTab")}
          </a>
        </div>
      ) : (
        <div className="w-full max-w-full">
          <video
            ref={videoRef}
            src={previewUrl}
            controls
            preload="metadata"
            onLoadedMetadata={handleLoadedMetadata}
            onError={handleError}
            className="w-full max-h-[70vh] object-contain"
          />
          {(duration || videoWidth || videoHeight) && (
            <div className="mt-2 text-sm text-[color:var(--imkan-color-muted)] flex items-center justify-center gap-4">
              {duration && <span>{label("preview.metadata.duration").replace("{time}", formatTime(duration))}</span>}
              {videoWidth && videoHeight && <span>{label("preview.metadata.dimensions").replace("{width}", String(videoWidth)).replace("{height}", String(videoHeight))}</span>}
              <span>{label("preview.metadata.size").replace("{size}", formatSize(size))}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TextPreview({
  previewUrl,
  fileName,
  mimeType,
  size,
  versionNumber,
}: PreviewComponentProps) {
  const { label } = useLocale();
  const [content, setContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const language = getLanguageFromMime(mimeType, fileName);

  useEffect(() => {
    const controller = new AbortController();
    fetch(previewUrl, { signal: controller.signal })
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
  }, [previewUrl]);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const lines = content.split("\n");
  const isLarge = size > 100 * 1024 || lines.length > 2000;

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
          </div>
        ) : (
          <pre className="whitespace-pre-wrap break-words">{content}</pre>
        )}
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}