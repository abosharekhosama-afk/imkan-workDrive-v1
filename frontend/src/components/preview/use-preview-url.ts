"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getPreviewUrl, type PreviewUrlResponse } from "../../lib/api/preview";

type PreviewUrlState = {
  url: string | null;
  info: PreviewUrlResponse | null;
  loading: boolean;
  error: string | null;
  /** Increments every time the URL is (re)issued so viewers can reload. */
  epoch: number;
};

const REFRESH_MARGIN_SECONDS = 60;
const MIN_REFRESH_INTERVAL_MS = 30_000;

/**
 * PVW-04 / token-expiry auto-refresh: resolves the presigned preview URL for a
 * file and re-issues it shortly before expiry so long-lived preview sessions
 * (videos, idle viewers) never break. Consumers can also call `refresh()` to
 * force a new URL, e.g. after a media element reports a load error.
 */
export function usePreviewUrl(fileId: string | null) {
  const [state, setState] = useState<PreviewUrlState>({
    url: null,
    info: null,
    loading: false,
    error: null,
    epoch: 0,
  });
  const timerRef = useRef<number | null>(null);
  const inflightRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!fileId || inflightRef.current) return;
    inflightRef.current = true;
    setState((current) => ({ ...current, loading: current.url === null }));
    try {
      const info = await getPreviewUrl(fileId);
      setState((current) => ({
        url: info.preview_url,
        info,
        loading: false,
        error: null,
        epoch: current.epoch + 1,
      }));
      clearTimer();
      const refreshInMs = Math.max(
        (info.expires_in_seconds - REFRESH_MARGIN_SECONDS) * 1000,
        MIN_REFRESH_INTERVAL_MS,
      );
      timerRef.current = window.setTimeout(() => {
        void refresh();
      }, refreshInMs);
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : "Preview failed",
      }));
    } finally {
      inflightRef.current = false;
    }
  }, [fileId, clearTimer]);

  useEffect(() => {
    setState({ url: null, info: null, loading: false, error: null, epoch: 0 });
    void refresh();
    return clearTimer;
  }, [refresh, clearTimer]);

  return { ...state, refresh };
}