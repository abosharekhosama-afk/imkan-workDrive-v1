"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "../locale-provider";

interface MediaViewerProps {
  url: string;
  epoch: number;
  mimeType: string;
  fileName: string;
  isAudio: boolean;
  onLoadError?: () => void;
}

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];
const WAVEFORM_BARS = 160;

/**
 * Zoho-style media player for video and audio: playback speed control,
 * picture-in-picture (video), and a clickable Web-Audio waveform for audio
 * files so users can scrub visually before the full file has buffered.
 */
export function MediaViewer({ url, epoch, mimeType, fileName, isAudio, onLoadError }: MediaViewerProps) {
  const { label } = useLocale();
  const mediaRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [rate, setRate] = useState(1);
  const [error, setError] = useState(false);
  const [waveformReady, setWaveformReady] = useState(false);

  useEffect(() => {
    setError(false);
    setWaveformReady(false);
    setRate(1);
  }, [url, epoch]);

  // Audio waveform: decode the track once and draw peak bars on a canvas.
  useEffect(() => {
    if (!isAudio || !url || error) return;
    let cancelled = false;
    (async () => {
      try {
        const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        const context = new AudioCtx();
        const buffer = await context.decodeAudioData(await (await fetch(url)).arrayBuffer());
        if (cancelled) return;
        const channel = buffer.getChannelData(0);
        const block = Math.floor(channel.length / WAVEFORM_BARS) || 1;
        const peaks: number[] = [];
        for (let index = 0; index < WAVEFORM_BARS; index += 1) {
          let peak = 0;
          for (let sample = index * block; sample < Math.min((index + 1) * block, channel.length); sample += 1) {
            peak = Math.max(peak, Math.abs(channel[sample]));
          }
          peaks.push(peak);
        }
        await context.close();
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = canvas.clientWidth * dpr;
        canvas.height = canvas.clientHeight * dpr;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.scale(dpr, dpr);
        const width = canvas.width / dpr;
        const height = canvas.height / dpr;
        const barWidth = width / WAVEFORM_BARS;
        ctx.fillStyle = "#8ab4ff";
        peaks.forEach((peak, index) => {
          const barHeight = Math.max(2, peak * height * 0.9);
          ctx.fillRect(index * barWidth + barWidth * 0.2, (height - barHeight) / 2, barWidth * 0.6, barHeight);
        });
        setWaveformReady(true);
      } catch {
        if (!cancelled) setWaveformReady(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAudio, url, epoch, error]);

  const changeRate = useCallback((next: number) => {
    setRate(next);
    if (mediaRef.current) mediaRef.current.playbackRate = next;
  }, []);

  const togglePip = useCallback(async () => {
    const element = mediaRef.current;
    if (!element) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await element.requestPictureInPicture();
      }
    } catch {
      // PiP may be unavailable (permissions/format); the native controls remain.
    }
  }, []);

  const seekFromWaveform = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const element = mediaRef.current;
    if (!element || !element.duration) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    element.currentTime = Math.min(Math.max(ratio, 0), 1) * element.duration;
  }, []);

  if (error) {
    return (
      <div className="zoho-unsupported-card">
        <div className="zoho-unsupported-icon" aria-hidden>{isAudio ? "🎵" : "🎬"}</div>
        <h3>{fileName}</h3>
        <p>{isAudio ? label("preview.unsupported") : label("preview.videoFormatNotSupported")}</p>
        <button type="button" className="zoho-btn" onClick={() => void onLoadError?.()}>{label("preview.retry")}</button>
      </div>
    );
  }

  return (
    <div className="zoho-viewer-root zoho-media-root">
      <div className="zoho-media-stage">
        <video
          key={`${epoch}-${url}`}
          ref={mediaRef}
          src={url}
          controls
          playsInline
          preload="metadata"
          className={isAudio ? "zoho-media-audio" : "zoho-media-video"}
          onError={() => { setError(true); onLoadError?.(); }}
        >
          <track kind="captions" />
        </video>
        {isAudio ? (
          <canvas
            ref={canvasRef}
            className={`zoho-audio-wave${waveformReady ? "" : " hidden"}`}
            onClick={seekFromWaveform}
            aria-hidden
          />
        ) : null}
      </div>
      <div className="zoho-viewer-controls" role="toolbar" aria-label={label("preview.toolbar")}>
        <span className="zoho-ctl-zoom">{label("preview.playbackSpeed")}</span>
        {PLAYBACK_RATES.map((value) => (
          <button
            key={value}
            type="button"
            className={`zoho-ctl${rate === value ? " active" : ""}`}
            onClick={() => changeRate(value)}
          >
            {value}×
          </button>
        ))}
        {!isAudio ? (
          <>
            <span className="zoho-ctl-sep" />
            <button type="button" className="zoho-ctl" onClick={() => void togglePip()} aria-label={label("preview.pip")}>
              {label("preview.pip")}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}