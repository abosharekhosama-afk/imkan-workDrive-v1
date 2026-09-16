"use client";

import { useState } from "react";
import { useLocale } from "../locale-provider";

interface OfficeViewerProps {
  url: string;
  fileName: string;
  onDownload: () => void;
}

/**
 * Office documents (Word/Excel/PowerPoint/ODF) render through the online
 * Office viewer inside an iframe instead of downloading the file. The viewer
 * needs a publicly reachable presigned URL; when that is unavailable we fall
 * back to an elegant download card.
 */
export function OfficeViewer({ url, fileName, onDownload }: OfficeViewerProps) {
  const { label } = useLocale();
  const [failed, setFailed] = useState(false);
  const [frameKey, setFrameKey] = useState(0);

  if (failed) {
    return (
      <div className="zoho-unsupported-card">
        <div className="zoho-unsupported-icon" aria-hidden>📄</div>
        <h3>{fileName}</h3>
        <p>{label("preview.officeExternal")}</p>
        <button type="button" className="zoho-btn zoho-btn-primary" onClick={onDownload}>
          {label("preview.downloadToView")}
        </button>
      </div>
    );
  }

  return (
    <div className="zoho-viewer-root">
      <div className="zoho-office-banner">{label("preview.officeExternal")}</div>
      <iframe
        key={frameKey}
        title={fileName}
        className="zoho-office-frame"
        src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`}
        onError={() => setFailed(true)}
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
      />
      <div className="zoho-viewer-controls">
        <button type="button" className="zoho-ctl" onClick={() => setFrameKey((key) => key + 1)}>
          {label("preview.retry")}
        </button>
        <button type="button" className="zoho-ctl" onClick={onDownload}>
          {label("preview.download")}
        </button>
      </div>
    </div>
  );
}