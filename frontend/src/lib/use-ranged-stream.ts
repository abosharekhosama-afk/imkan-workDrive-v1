"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { streamToBlobUrl, type RangedStreamState } from "./api/stream-ranged";

const IDLE_STATE: RangedStreamState = {
  objectUrl: null,
  contentType: null,
  totalBytes: null,
  receivedBytes: 0,
  supportsRange: false,
  loading: false,
  error: null,
  retry: () => undefined,
};

/**
 * Loads `/files/:id/stream` through progressive Range hops and exposes one
 * growing Blob URL plus transfer metadata to media players.
 */
export function useRangedStream(previewUrl: string | undefined, mimeType: string): RangedStreamState {
  const [state, setState] = useState<RangedStreamState>(IDLE_STATE);
  const [nonce, setNonce] = useState(0);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!previewUrl) {
      setState(IDLE_STATE);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true, error: null }));
    void (async () => {
      try {
        const result = await streamToBlobUrl(previewUrl, mimeType, undefined, controller.signal);
        if (cancelled || controller.signal.aborted) return;
        if (urlRef.current && urlRef.current !== result.objectUrl) URL.revokeObjectURL(urlRef.current);
        urlRef.current = result.objectUrl;
        setState({ ...result, loading: false, error: null, retry: () => undefined });
      } catch (cause) {
        if ((cause as Error)?.name === "AbortError") return;
        if (cancelled) return;
        setState((current) => ({
          ...current,
          loading: false,
          error: cause instanceof Error ? cause.message : "Failed to load media",
        }));
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [previewUrl, mimeType, nonce]);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const retry = useCallback(() => setNonce((value) => value + 1), []);

  return { ...state, retry };
}

