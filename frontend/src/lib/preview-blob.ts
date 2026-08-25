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

export function useBlobPreview(
  previewUrl: string | undefined,
  mimeType: string
): BlobPreviewResult {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const objectUrlRef = useRef<string | null>(null);

  const fetchBlob = useCallback(async () => {
    if (!previewUrl) {
      setError("Preview URL is not available");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const token = await getAccessToken();
      const headers = new Headers();
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }

      const response = await fetch(`${getApiBaseUrl()}${previewUrl}`, {
        headers,
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
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
  }, [previewUrl]);

  const retry = useCallback(() => {
    fetchBlob();
  }, [fetchBlob]);

  useEffect(() => {
    fetchBlob();
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [fetchBlob]);

  return { objectUrl, blob, error, isLoading, retry };
}