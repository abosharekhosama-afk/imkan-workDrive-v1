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
  const [matches, setMatches] = useState<number[]>([]);
  const [matchIndex, setMatchIndex] = useState(0);

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

  /** Flattens per-page occurrence counts into a navigable page sequence. */
  const runSearch = useCallback(async () => {
    const pdf = pdfRef.current;
    if (!pdf || !query.trim()) {
      setMatches([]);
      setMatchIndex(0);
      return;
    }
    const needle = query.trim().toLowerCase();
    const pages: number[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const textContent = await pdf.getPage(pageNumber).then((p: any) => p.getTextContent());
      const haystack = textContent.items.map((item: any) => item.str ?? "").join(" ").toLowerCase();
      const count = haystack.split(needle).length - 1;
      for (let hit = 0; hit < count; hit += 1) pages.push(pageNumber);
    }
    setMatches(pages);
    setMatchIndex(0);
    if (pages.length > 0) setPage(pages[0]);
  }, [query]);

  const stepMatch = useCallback((delta: number) => {
    if (matches.length === 0) return;
    setMatchIndex((current) => {
      const next = (current + delta + matches.length) % matches.length;
      setPage(matches[next]);
      return next;
    });
  }, [matches]);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setMatches([]);
    setMatchIndex(0);
    setQuery("");
  }, []);

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
          onClick={() => { if (searchOpen) closeSearch(); else setSearchOpen(true); }}
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
            onKeyDown={(event) => {
              if (event.key === "Enter") { event.preventDefault(); stepMatch(event.shiftKey ? -1 : 1); }
              if (event.key === "Escape") closeSearch();
            }}
          />
          <span className="zoho-pdf-count" role="status" aria-live="polite">
            {matches.length === 0 ? "0 / 0" : `${matchIndex + 1} / ${matches.length}`}
          </span>
          <button type="button" className="zoho-ctl" onClick={() => void runSearch()} aria-label={label("preview.search")}>🔍</button>
          <button type="button" className="zoho-ctl" onClick={() => stepMatch(-1)} aria-label={label("preview.prevPage")} disabled={matches.length === 0}>↑</button>
          <button type="button" className="zoho-ctl" onClick={() => stepMatch(1)} aria-label={label("preview.nextPage")} disabled={matches.length === 0}>↓</button>
          <button type="button" className="zoho-ctl" onClick={closeSearch} aria-label={label("preview.close")}>✕</button>
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