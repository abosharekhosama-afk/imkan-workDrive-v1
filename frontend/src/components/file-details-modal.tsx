"use client";

import { useLocale } from "./locale-provider";
import { Modal } from "./modal";
import { FileIcon } from "./file-icon";
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
 * Compact metadata sheet ("View details") shown from any row actions menu.
 * Non-destructive read-only summary used by Shared, Favorites and Main views.
 */
export function FileDetailsModal({
  data,
  onClose,
}: {
  data: FileDetailsData;
  onClose: () => void;
}) {
  const { label, locale } = useLocale();

  const rows: Array<[string, string]> = [
    [label("files.column.name"), data.name],
    [
      label("files.column.type"),
      data.resourceType === "FOLDER"
        ? label("files.type.folder")
        : label("files.type.file"),
    ],
  ];
  if (typeof data.size === "number" && data.size > 0) {
    rows.push([label("files.column.size"), formatBytes(data.size)]);
  }
  if (data.updatedAt) {
    rows.push([label("files.column.updated"), formatDateLocalized(data.updatedAt, locale)]);
  }
  if (data.ownerName || data.ownerEmail) {
    rows.push([label("shared.owner"), data.ownerName || data.ownerEmail || "—"]);
  }
  if (data.permission) {
    rows.push([label("shared.permission"), data.permission]);
  }

  return (
    <Modal title={label("files.details")} onClose={onClose}>
      <div className="mb-3 flex items-center gap-3">
        <FileIcon
          kind={data.resourceType === "FOLDER" ? "folder" : "file"}
          mimeType={data.mimeType ?? undefined}
          name={data.name}
          label={label("files.type.file")}
        />
        <span className="truncate font-medium">{data.name}</span>
      </div>
      <dl className="flex flex-col gap-2 text-[length:var(--imkan-font-size-secondary)]">
        {rows.map(([term, value]) => (
          <div
            key={term}
            className="flex justify-between gap-4 border-b border-[color:var(--imkan-color-border)] pb-1"
          >
            <dt className="imkan-muted">{term}</dt>
            <dd className="max-w-[60%] truncate text-end">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="imkan-button-secondary" onClick={onClose}>
          {label("share.cancel")}
        </button>
      </div>
    </Modal>
  );
}