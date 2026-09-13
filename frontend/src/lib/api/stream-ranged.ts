"use client";

import { getAccessToken, getApiBaseUrl } from "./client.ts";

/** Byte chunk requested per Range hop while progressively buffering media. */
export const STREAM_CHUNK_BYTES = 1_048_576; // 1 MiB

export interface ContentRangeInfo {
  start: number;
  end: number;
  /** -1 when the server omits the total (`bytes 0-99/*`). */
  total: number;
}

/**
 * Parses a `Content-Range` response header (RFC 7233):
 * `bytes 0-1048575/4718592` → `{ start, end, total }`. Returns `null` when the
 * header is absent or malformed so callers can fall back gracefully.
 */
export function parseContentRange(header: string | null | undefined): ContentRangeInfo | null {
  if (!header) return null;
  const match = /^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i.exec(header.trim());
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return { start, end, total: match[3] === "*" ? -1 : Number(match[3]) };
}

/** Builds the next sequential Range window; returns null once the file is done. */
export function nextRange(receivedBytes: number, totalBytes: number | null, chunkBytes = STREAM_CHUNK_BYTES): string | null {
  if (totalBytes !== null && receivedBytes >= totalBytes) return null;
  if (receivedBytes < 0) return null;
  const end = totalBytes === null ? receivedBytes + chunkBytes - 1 : Math.min(receivedBytes + chunkBytes, totalBytes) - 1;
  return `bytes=${receivedBytes}-${end}`;
}

/** Authorization + Range headers required by the guarded stream endpoint. */
export async function streamRequestHeaders(range: string): Promise<Headers> {
  const headers = new Headers();
  headers.set("Range", range);
  const token = await getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return headers;
}

export interface RangedStreamState {
  /** Blob URL for the bytes received so far — refreshed as more chunks land. */
  objectUrl: string | null;
  /** Content-Type reported by the server (dynamic MIME detection). */
  contentType: string | null;
  totalBytes: number | null;
  receivedBytes: number;
  /** True when the server honored the Range request with 206. */
  supportsRange: boolean;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

/**
 * Progressive Range-streaming player source for `/files/:id/stream`.
 *
 * The stream endpoint sits behind the JWT guard, so native `<video src>` tags
 * cannot authenticate on their own; instead sequential chunks are fetched with
 * `Authorization` + `Range` headers and republished as one growing Blob URL,
 * letting media elements start playback long before the transfer completes.
 */
export async function streamToBlobUrl(
  previewUrl: string,
  fallbackMime: string,
  chunkBytes = STREAM_CHUNK_BYTES,
  signal?: AbortSignal,
): Promise<{ objectUrl: string; contentType: string; totalBytes: number | null; receivedBytes: number; supportsRange: boolean }> {
  const parts: BlobPart[] = [];
  let received = 0;
  let total: number | null = null;
  let supportsRange = false;
  let contentType = "";

  for (;;) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const range = nextRange(received, total, chunkBytes);
    if (range === null) break;
    const response = await fetch(`${getApiBaseUrl()}${previewUrl}`, {
      headers: await streamRequestHeaders(range),
      signal,
    });
    if (!response.ok && response.status !== 206) {
      throw new Error(`Stream request failed ${response.status}`.trim());
    }
    if (!contentType) contentType = response.headers.get("content-type") ?? "";
    const parsed = parseContentRange(response.headers.get("content-range"));
    if (response.status === 206 && parsed) {
      supportsRange = true;
      if (parsed.total >= 0) total = parsed.total;
    } else if (!supportsRange) {
      const lengthHeader = Number(response.headers.get("content-length"));
      total = Number.isFinite(lengthHeader) && lengthHeader > 0 ? lengthHeader : null;
    }
    const reader = response.body?.getReader() ?? null;
    if (!reader) {
      const blob = await response.blob();
      parts.push(blob);
      received += blob.size;
      break;
    }
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          parts.push(value.slice().buffer as ArrayBuffer);
          received += value.byteLength;
        }
      }
    } finally {
      reader.releaseLock();
    }
    // A plain 200 response delivers the entire resource in one hop.
    if (response.status === 200) break;
  }

  if (received === 0) throw new Error("Empty file content");
  return {
    objectUrl: URL.createObjectURL(new Blob(parts)),
    contentType: contentType || fallbackMime,
    totalBytes: total ?? received,
    receivedBytes: received,
    supportsRange,
  };
}

