"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "../locale-provider";

interface ImageViewerProps {
  url: string;
  /** Increments when a fresh presigned URL is issued so <img> reloads. */
  epoch: number;
  alt: string;
  onLoadError?: () => void;
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.25;

/**
 * Zoho-style image viewer: zoom (controls + Ctrl+wheel), pan (drag), rotate
 * and fit-to-screen. Animated GIF/SVG render natively since the element is a
 * plain <img> pointed at the presigned URL.
 */
export function ImageViewer({ url, epoch, alt, onLoadError }: ImageViewerProps) {
  const { label } = useLocale();
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const reset = useCallback(() => {
    setZoom(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  }, []);

  // New file → drop any transform state carried over from the previous one.
  useEffect(() => {
    reset();
    setStatus("loading");
  }, [url, reset]);

  const zoomBy = useCallback((factor: number) => {
    setZoom((current) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current * factor)));
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      zoomBy(event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, baseX: offset.x, baseY: offset.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setOffset({ x: drag.baseX + (event.clientX - drag.startX), y: drag.baseY + (event.clientY - drag.startY) });
  };
  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  return (
    <div className="zoho-viewer-root">
      <div
        ref={stageRef}
        className="zoho-image-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {status === "loading" ? <div className="zoho-viewer-spinner" aria-label={label("preview.loading")} /> : null}
        {status === "error" ? (
          <div className="zoho-viewer-error">
            <p>{label("preview.imageLoadFailed")}</p>
            <button type="button" className="zoho-btn" onClick={() => void onLoadError?.()}>{label("preview.retry")}</button>
          </div>
        ) : null}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={`${epoch}-${url}`}
          src={url}
          alt={alt}
          draggable={false}
          decoding="async"
          className="zoho-image-canvas"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg) scale(${zoom})`,
            cursor: dragRef.current ? "grabbing" : "grab",
            visibility: status === "ready" ? "visible" : "hidden",
          }}
          onLoad={() => setStatus("ready")}
          onError={() => setStatus("error")}
        />
      </div>
      <div className="zoho-viewer-controls" role="toolbar" aria-label={label("preview.toolbar")}>
        <button type="button" className="zoho-ctl" onClick={() => zoomBy(1 / ZOOM_STEP)} aria-label={label("preview.zoomOut")}>−</button>
        <span className="zoho-ctl-zoom">{Math.round(zoom * 100)}%</span>
        <button type="button" className="zoho-ctl" onClick={() => zoomBy(ZOOM_STEP)} aria-label={label("preview.zoomIn")}>+</button>
        <span className="zoho-ctl-sep" />
        <button type="button" className="zoho-ctl" onClick={() => setZoom(1)} aria-label={label("preview.fitToScreen")}>{label("preview.fitToScreen")}</button>
        <button type="button" className="zoho-ctl" onClick={() => setZoom(1)} aria-label={label("preview.zoomReset")}>⤢</button>
        <span className="zoho-ctl-sep" />
        <button type="button" className="zoho-ctl" onClick={() => setRotation((r) => (r + 90) % 360)} aria-label={label("preview.rotate")}>⟳</button>
        <button type="button" className="zoho-ctl" onClick={reset} aria-label={label("preview.reset")}>↺</button>
      </div>
    </div>
  );
}