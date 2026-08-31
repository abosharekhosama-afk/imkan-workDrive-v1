"use client";

import { useEffect, useState } from "react";
import { useLocale } from "../locale-provider";
import { formatBytes } from "../../lib/api/quota";
import { getFileActivities, type FileActivityRecord } from "../../lib/api/preview";

interface DetailsSidebarProps {
  open: boolean;
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  versionNumber?: number;
  updatedAt?: string | null;
}

function formatDateTime(value: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}

/**
 * Collapsible Zoho-style details drawer: file metadata plus the recent
 * activity log (uploads, downloads, previews, renames…) fetched from
 * `GET /files/:id/activities` when the drawer opens.
 */
export function DetailsSidebar({ open, fileId, fileName, mimeType, size, versionNumber, updatedAt }: DetailsSidebarProps) {
  const { label } = useLocale();
  const [activities, setActivities] = useState<FileActivityRecord[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setActivities(null);
    getFileActivities(fileId, 20)
      .then((rows) => {
        if (!cancelled) setActivities(rows);
      })
      .catch(() => {
        if (!cancelled) setActivities([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, fileId]);

  if (!open) return null;

  const extension = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".") + 1).toUpperCase() : "—";

  return (
    <aside className="zoho-preview-side" aria-label={label("preview.fileDetails")}>
      <section className="zoho-side-section">
        <h4>{label("preview.fileDetails")}</h4>
        <dl className="zoho-side-grid">
          <dt>{label("preview.metadata.format")}</dt>
          <dd>{extension}</dd>
          <dt>{label("preview.metadata.size")}</dt>
          <dd>{formatBytes(size)}</dd>
          <dt>{label("preview.updatedAt")}</dt>
          <dd>{updatedAt ? formatDateTime(updatedAt) : "—"}</dd>
          {versionNumber ? (
            <>
              <dt>{label("preview.version").replace("{version}", String(versionNumber))}</dt>
              <dd>{`v${versionNumber}`}</dd>
            </>
          ) : null}
          <dt>MIME</dt>
          <dd className="zoho-side-mono">{mimeType || "—"}</dd>
        </dl>
      </section>
      <section className="zoho-side-section">
        <h4>{label("preview.activity")}</h4>
        {activities === null ? (
          <div className="zoho-viewer-spinner" aria-label={label("preview.loading")} />
        ) : activities.length === 0 ? (
          <p className="zoho-side-empty">{label("preview.noActivity")}</p>
        ) : (
          <ul className="zoho-activity-list">
            {activities.map((entry) => (
              <li key={entry.id}>
                <span className="zoho-activity-action">{entry.action.replaceAll("_", " ").toLowerCase()}</span>
                <time dateTime={entry.created_at}>{formatDateTime(entry.created_at)}</time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}