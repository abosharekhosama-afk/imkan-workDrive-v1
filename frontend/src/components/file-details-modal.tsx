"use client";

import { useLocale } from "./locale-provider";
import { Modal } from "./modal";
import { fileIconKind, FileTypeIcon } from "./file-icon";
import { formatBytes } from "../lib/api/quota";
import { formatDateLocalized } from "../lib/localized";

export interface FileDetailsData {
  resourceType: "FILE" | "FOLDER";
  name: string;
  mimeType?: string | null;
  size?: number | null;
  updatedAt?: string | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
  permission?: string | null;
}

/**
 * Zoho WorkDrive-style metadata sheet ("View details") shown from any row
 * actions menu: icon header card + a two-column fact grid. The size row is
 * always rendered (formatted `1.5 MB` / `420 KB`) — never hidden or "N/A".
 */
export function FileDetailsModal({
  data,
  onClose,
}: {
  data: FileDetailsData;
  onClose: () => void;
}) {
  const { label, locale } = useLocale();
  const isFolder = data.resourceType === "FOLDER";
  const kind = fileIconKind(isFolder ? "folder" : "file", data.mimeType, data.name);

  const facts: Array<{ term: string; value: string; mono?: boolean }> = [
    { term: label("files.column.type"), value: isFolder ? label("files.type.folder") : label("files.type.file") },
    { term: label("files.column.size"), value: formatBytes(data.size ?? null) },
  ];
  if (data.updatedAt) {
    facts.push({ term: label("files.column.updated"), value: formatDateLocalized(data.updatedAt, locale) });
  }
  if (data.ownerName || data.ownerEmail) {
    facts.push({ term: label("shared.owner"), value: data.ownerName || data.ownerEmail || "—" });
  }
  if (data.permission) {
    facts.push({ term: label("shared.permission"), value: data.permission });
  }

  return (
    <Modal title={label("files.details")} onClose={onClose}>
      <div className="wd-details">
        <div className="wd-details-head">
          <span className="wd-details-thumb" aria-hidden="true">
            <FileTypeIcon kind={kind} size={34} />
          </span>
          <span className="wd-details-title" title={data.name}>{data.name}</span>
        </div>

        <dl className="wd-details-grid">
          {facts.map(({ term, value, mono }) => (
            <div key={term} className="wd-details-row">
              <dt>{term}</dt>
              <dd className={mono ? "wd-details-mono" : undefined} title={value}>{value}</dd>
            </div>
          ))}
        </dl>

        <div className="wd-details-actions">
          <button type="button" className="imkan-button-secondary" onClick={onClose}>
            {label("share.cancel")}
          </button>
        </div>
      </div>
    </Modal>
  );
}