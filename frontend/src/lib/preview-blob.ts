"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getAccessToken, getApiBaseUrl } from "./api/client";

export interface BlobPreviewResult {
  objectUrl: string | null;
  blob: Blob | null;
  error: string | null;
  isLoading: boolean;
  retry: () => void;
}

/** Extracts a user-friendly message from a non-2xx preview response. */
async function describeHttpFailure(response: Response): Promise<string> {
  let serverMessage: string | null = null;
  try {
    const text = await response.text();
    if (text) {
      try {
        // NestJS error envelope: { statusCode, message }
        const parsed = JSON.parse(text) as { message?: unknown };
        if (typeof parsed.message === "string" && parsed.message.length > 0) {
          serverMessage = parsed.message;
        } else if (Array.isArray(parsed.message)) {
          serverMessage = parsed.message
            .filter((item): item is string => typeof item === "string")
            .join(", ");
        }
      } catch {
        serverMessage = text;
      }
    }
  } catch {
    // Body unreadable; fall back to the status-based message below.
  }

  switch (response.status) {
    case 401:
      return serverMessage ?? "Your session has expired. Please sign in again.";
    case 403:
      return serverMessage ?? "You do not have permission to preview this file.";
    case 404:
      return (
        serverMessage ??
        "This file's content is no longer available on the server."
      );
    default:
      if (response.status >= 500) {
        return (
          serverMessage ??
          "The server could not load this preview. Please try again later."
        );
      }
      return (
        serverMessage ??
        `Failed to load preview: ${response.status} ${response.statusText}`.trim()
      );
  }
}

export function useBlobPreview(
  previewUrl: string | undefined,
  mimeType: string,
  enabled = true
): BlobPreviewResult {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const objectUrlRef = useRef<string | null>(null);

  const fetchBlob = useCallback(async () => {
    if (!previewUrl || !enabled) {
      if (!enabled) {
        // Another loader (e.g. Range streaming) owns this resource — stay idle
        // so we do not issue a second full-file download.
        setError(null);
        setIsLoading(false);
      }
      if (!previewUrl) {
        setError("Preview URL is not available");
        setIsLoading(false);
      }
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const token = await getAccessToken();
      const headers = new Headers();
      headers.set("Accept", "*/*");
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      // Tenant isolation is enforced server-side from the `org_id` claim of
      // the Bearer token, so no separate tenant header is required here.

      const isAbsolute = /^https?:\/\//i.test(previewUrl);
      const requestUrl = isAbsolute ? previewUrl : `${getApiBaseUrl()}${previewUrl}`;

      let response: Response;
      try {
        response = await fetch(requestUrl, { headers });
      } catch (cause) {
        // Network-level failure: the server being offline, a DNS failure,
        // a CORS rejection or a dropped connection all surface here as
        // TypeError("Failed to fetch"). Translate it into something the
        // preview error card can show instead of a raw TypeError message.
        console.error("Blob preview network error:", cause);
        throw new Error(
          "Unable to reach the server. Please check your connection and try again."
        );
      }

      if (!response.ok) {
        throw new Error(await describeHttpFailure(response));
      }

      const blobData = await response.blob();
      
      if (blobData.size === 0) {
        throw new Error("Empty file content");
      }

      const blobUrl = URL.createObjectURL(blobData);
      
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
      objectUrlRef.current = blobUrl;
      
      setBlob(blobData);
      setObjectUrl(blobUrl);
      setError(null);
    } catch (err) {
      console.error("Blob preview fetch error:", err);
      setError(err instanceof Error ? err.message : "Failed to load preview");
    } finally {
      setIsLoading(false);
    }
  }, [previewUrl, enabled]);

  const retry = useCallback(() => {
    fetchBlob();
  }, [fetchBlob]);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      setError(null);
      return;
    }
    fetchBlob();
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps tracked below
  }, [fetchBlob, enabled]);

  return { objectUrl, blob, error, isLoading, retry };
}