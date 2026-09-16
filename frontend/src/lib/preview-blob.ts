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

async function describeHttpFailure(response: Response): Promise<string> {
  let serverMessage: string | null = null;
  try {
    const text = await response.text();
    if (text) {
      try {
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
    // Body unreadable
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
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchBlob = useCallback(async () => {
    if (!previewUrl || !enabled) {
      if (!enabled) {
        setError(null);
        setIsLoading(false);
      }
      if (!previewUrl) {
        setError("Preview URL is not available");
        setIsLoading(false);
      }
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const isAbsolute = /^https?:\/\//i.test(previewUrl);
      const isExternalS3OrR2 =
        isAbsolute &&
        (previewUrl.includes("cloudflarestorage.com") ||
          previewUrl.includes("amazonaws.com") ||
          previewUrl.includes("X-Amz-Algorithm"));

      const requestUrl = isAbsolute
        ? previewUrl
        : `${getApiBaseUrl()}${previewUrl}`;
      const headers = new Headers();
      headers.set("Accept", "*/*");

      if (!isExternalS3OrR2) {
        const token = await getAccessToken();
        if (token) {
          headers.set("Authorization", `Bearer ${token}`);
        }
      }

      let response: Response;
      try {
        response = await fetch(requestUrl, {
          headers,
          signal: controller.signal,
        });
      } catch (cause: any) {
        if (cause?.name === "AbortError") return;
        console.error("Blob preview network error:", cause);
        throw new Error(
          "Unable to reach the server. Please check your connection and try again."
        );
      }

      if (!response.ok) {
        throw new Error(await describeHttpFailure(response));
      }

      const contentType = response.headers.get("content-type") || "";

      // التعامل مع Presigned URL المرسل كـ JSON
      if (contentType.includes("application/json")) {
        const json = await response.json();
        const directR2Url = json.url || json.presignedUrl;

        if (!directR2Url) {
          throw new Error("Invalid preview URL response from server");
        }

        // fetch مباشر لـ R2 بدون Authorization Header لتجنب مشكلة CORS
        const r2Response = await fetch(directR2Url, {
          signal: controller.signal,
        });

        if (!r2Response.ok) {
          throw new Error(await describeHttpFailure(r2Response));
        }

        const blobData = await r2Response.blob();
        if (blobData.size === 0) throw new Error("Empty file content");

        const blobUrl = URL.createObjectURL(blobData);
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = blobUrl;

        setBlob(blobData);
        setObjectUrl(blobUrl);
        setError(null);
        return;
      }

      // إذا كانت الاستجابة مباشرة عبارة عن binary blob
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
    } catch (err: any) {
      if (err?.name === "AbortError") return;
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
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [fetchBlob, enabled]);

  return { objectUrl, blob, error, isLoading, retry };
}