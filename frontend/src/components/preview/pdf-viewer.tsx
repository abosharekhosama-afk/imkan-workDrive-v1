"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "../locale-provider";

interface PdfViewerProps {
  url: string;
  /** Increments when a fresh presigned URL is issued so the doc reloads. */
  epoch: number;
  onLoadError?: () => void;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type PdfDocument = any;

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 1.2;

/**
 * Dedicated PDF viewer built on the pinned `pdfjs-dist` dependency:
 * page navigation, zoom and full-document text search. Only the currently
 * visible page is rendered to canvas so large PDFs preview quickly.
 */
export function PdfViewer({ url, epoch, onLoadError }: PdfViewerProps) {
  const { label } = useLocale();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pdfRef = useRef<PdfDocument | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void; promise: Promise<unknown> } | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<{ page: number; count: number }[]>([]);

  // Load the document whenever the (fresh) URL changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
        const pdf = await pdfjsLib.getDocument({ url }).promise;
        if (cancelled) {
          void (pdf as unknown as { destroy?: () => Promise<void> }).destroy?.();
          return;
        }
        pdfRef.current = pdf;
        setPageCount(pdf.numPages);
        setPage(1);
        setLoading(false);
      } catch (loadError) {
        if (cancelled) return;
        setLoading(false);
        if (String((loadError as Error)?.message ?? "").includes("password")) {
          setError(label("preview.passwordProtected"));
        } else {
          setError(label("preview.error"));
          onLoadError?.();
        }
      }
    })();
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
      void pdfRef.current?.destroy();
      pdfRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, epoch]);

  // Render the active page (fitted to the stage width, DPR-aware).
  useEffect(() => {
    const pdf = pdfRef.current;
    const canvas = canvasRef.current;
    if (!pdf || !canvas || loading || error) return;
    let cancelled = false;
    (async () => {
      try {
        const pdfPage = await pdf.getPage(page);
        const baseViewport = pdfPage.getViewport({ scale: 1 });
        const containerWidth = canvas.parentElement?.clientWidth ?? 800;
        const fittedScale = Math.min((containerWidth - 32) / baseViewport.width, 2);
        const viewport = pdfPage.getViewport({ scale: fittedScale * zoom });
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        renderTaskRef.current?.cancel();
        const task = pdfPage.render({
          canvasContext: canvas.getContext("2d")!,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        });
        renderTaskRef.current = task;
        await task.promise;
        if (!cancelled) renderTaskRef.current = null;
      } catch (renderError) {
        if (!cancelled && (renderError as Error)?.name !== "RenderingCancelledException") {
          setError(label("preview.error"));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, zoom, loading, error]);

  const runSearch = useCallback(async () => {
    const pdf = pdfRef.current;
    if (!pdf || !query.trim()) {
      setMatches([]);
      return;
    }
    const needle = query.trim().toLowerCase();
    const results: { page: number; count: number }[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const textContent = await pdf.getPage(pageNumber).then((p: any) => p.getTextContent());
      const haystack = textContent.items.map((item: any) => item.str ?? "").join(" ").toLowerCase();
      const count = haystack.split(needle).length - 1;
      if (count > 0) results.push({ page: pageNumber, count });
    }
    setMatches(results);
    if (results.length > 0) setPage(results[0].page);
  }, [query]);

  return (
    <div className="zoho-viewer-root">
      <div className="zoho-viewer-controls" role="toolbar" aria-label={label("preview.toolbar")}>
        <button type="button" className="zoho-ctl" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} aria-label={label("preview.prevPage")}>‹</button>
        <span className="zoho-ctl-zoom">{label("preview.page").replace("{current}", String(page)).replace("{total}", String(pageCount))}</span>
        <button type="button" className="zoho-ctl" disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))} aria-label={label("preview.nextPage")}>›</button>
        <span className="zoho-ctl-sep" />
        <button type="button" className="zoho-ctl" onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z / ZOOM_STEP))} aria-label={label("preview.zoomOut")}>−</button>
        <button type="button" className="zoho-ctl" onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z * ZOOM_STEP))} aria-label={label("preview.zoomIn")}>+</button>
        <span className="zoho-ctl-sep" />
        <button
          type="button"
          className="zoho-ctl"
          onClick={() => { setSearchOpen((open) => !open); if (searchOpen) { setMatches([]); setQuery(""); } }}
          aria-label={label("preview.search")}
        >
          {label("preview.search")}
        </button>
      </div>
      {searchOpen ? (
        <div className="zoho-pdf-search">
          <input
            type="search"
            value={query}
            placeholder={label("preview.searchPlaceholder")}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") void runSearch(); }}
          />
          <button type="button" className="zoho-btn" onClick={() => void runSearch()}>{label("preview.search")}</button>
          {matches.length > 0 ? (
            <div className="zoho-pdf-hits">
              {matches.slice(0, 20).map((match) => (
                <button key={match.page} type="button" onClick={() => setPage(match.page)}>
                  {label("preview.page").replace("{current}", String(match.page)).replace("{total}", String(pageCount))} · {match.count}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="zoho-pdf-stage">
        {loading ? <div className="zoho-viewer-spinner" aria-label={label("preview.loading")} /> : null}
        {error ? (
          <div className="zoho-viewer-error">
            <p>{error}</p>
            <button type="button" className="zoho-btn" onClick={() => void onLoadError?.()}>{label("preview.retry")}</button>
          </div>
        ) : null}
        <canvas ref={canvasRef} style={{ display: loading || error ? "none" : "block" }} />
      </div>
    </div>
  );
}