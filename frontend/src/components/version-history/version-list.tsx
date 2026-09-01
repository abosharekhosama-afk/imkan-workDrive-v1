"use client";

import { useLocale } from "../locale-provider";

interface VersionListProps {
  versions: Array<{
    id: string;
    versionNumber: number;
    size: number;
    mimeType: string;
    sha256Hash: string;
    uploadedById: string;
    uploadedBy?: { email: string; name?: string | null };
    createdAt: string;
    isCurrent: boolean;
  }>;
  fileName: string;
  mimeType: string;
  currentVersion: number;
  canWrite: boolean;
  onPreview: (versionNumber: number) => void;
  onRestore: (versionNumber: number) => void;
  formatSize: (bytes: number) => string;
  formatDate: (dateString: string) => string;
  formatHash: (hash: string) => string;
}

export function VersionList({
  versions,
  fileName,
  mimeType,
  currentVersion,
  canWrite,
  onPreview,
  onRestore,
  formatSize,
  formatDate,
  formatHash,
}: VersionListProps) {
  const { label } = useLocale();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm text-[color:var(--imkan-color-muted)] mb-3">
        <span>{label("versionHistory.totalVersions").replace("{count}", String(versions.length))}</span>
        <span className="imkan-badge">{label("versionHistory.current").replace("{version}", String(currentVersion))}</span>
      </div>
      <div className="overflow-x-auto w-full max-w-full">
        <table className="imkan-table min-w-full w-full">
          <thead>
            <tr className="imkan-table-row">
              <th scope="col" className="px-3 py-2 text-start font-medium w-16">
                {label("versionHistory.version")}
              </th>
              <th scope="col" className="px-3 py-2 text-start font-medium">
                {label("versionHistory.date")}
              </th>
              <th scope="col" className="px-3 py-2 text-start font-medium">
                {label("versionHistory.uploader")}
              </th>
              <th scope="col" className="px-3 py-2 text-start font-medium">
                {label("versionHistory.size")}
              </th>
              <th scope="col" className="px-3 py-2 text-start font-medium">
                {label("versionHistory.hash")}
              </th>
              <th scope="col" className="px-3 py-2 text-end font-medium">
                <span className="sr-only">{label("versionHistory.actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {versions.map((version) => (
              <tr
                key={version.id}
                className={`imkan-table-row ${version.isCurrent ? "bg-[color:var(--imkan-color-primary)]/10" : "hover:bg-[color:var(--imkan-color-surface)]"}`}
              >
                <td className="px-3 py-2 font-mono text-sm">
                  <span className={version.isCurrent ? "font-semibold" : ""}>
                    v{version.versionNumber}
                    {version.isCurrent && (
                      <span className="ml-2 imkan-badge">{label("versionHistory.current")}</span>
                    )}
                  </span>
                </td>
                <td className="px-3 py-2 text-sm">{formatDate(version.createdAt)}</td>
                <td className="px-3 py-2 text-sm">
                  {version.uploadedBy?.name || version.uploadedBy?.email || label("versionHistory.unknown")}
                </td>
                <td className="px-3 py-2 text-sm">{formatSize(version.size)}</td>
                <td className="px-3 py-2 font-mono text-xs text-[color:var(--imkan-color-muted)]">
                  {formatHash(version.sha256Hash)}
                </td>
                <td className="px-3 py-2 text-end">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      className="imkan-button-secondary text-sm"
                      onClick={() => onPreview(version.versionNumber)}
                      aria-label={label("versionHistory.preview").replace("{version}", String(version.versionNumber))}
                    >
                      {label("versionHistory.preview")}
                    </button>
                    {!version.isCurrent && canWrite && (
                      <button
                        type="button"
                        className="imkan-button-secondary text-sm"
                        onClick={() => onRestore(version.versionNumber)}
                        aria-label={label("versionHistory.restore").replace("{version}", String(version.versionNumber))}
                      >
                        {label("versionHistory.restore")}
                      </button>
                    )}
                    {version.isCurrent && canWrite && (
                      <span className="text-xs text-[color:var(--imkan-color-muted)]">
                        {label("versionHistory.currentVersionNoRestore")}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
