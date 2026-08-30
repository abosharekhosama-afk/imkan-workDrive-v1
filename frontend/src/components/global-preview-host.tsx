"use client";

import { useEffect, useState } from "react";
import { WORKDRIVE_PREVIEW_EVENT, type PreviewEventDetail } from "./global-search";
import { FilePreviewModal, type FilePreviewModalTarget } from "./file-preview-modal";

/**
 * App-level preview sink: any page can dispatch a `workdrive:preview` window
 * event (e.g. the global search results) and the full-screen modal opens here
 * — independent of the per-page file browser instance.
 */
export function GlobalPreviewHost() {
  const [target, setTarget] = useState<FilePreviewModalTarget | null>(null);

  useEffect(() => {
    const onPreview = (event: Event) => {
      const detail = (event as CustomEvent<PreviewEventDetail>).detail;
      if (!detail?.id) return;
      setTarget({
        id: detail.id,
        name: detail.name,
        mimeType: detail.mimeType ?? null,
        size: detail.size ?? null,
      });
    };
    window.addEventListener(WORKDRIVE_PREVIEW_EVENT, onPreview);
    return () => window.removeEventListener(WORKDRIVE_PREVIEW_EVENT, onPreview);
  }, []);

  return <FilePreviewModal target={target} onClose={() => setTarget(null)} />;
}
