"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale } from "../../../components/locale-provider";
import { ApiError } from "../../../lib/api/client";
import { listTrash, restoreFile } from "../../../lib/api/trash";
import type { FileRecord } from "../../../lib/api/types";
import { AlertBanner } from "../../../components/alert-banner";
import { EmptyState } from "../../../components/empty-state";
import { SkeletonLoader } from "../../../components/skeleton-loader";
import { errorMessageForStatus } from "../../../components/feedback-state-logic";

export default function TrashPage() {
  const { label } = useLocale();
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    await Promise.resolve();
    try {
      setLoading(true);
      setError(null);
      setFiles(await listTrash());
    } catch (cause) {
      setError(errorMessageForStatus(cause instanceof ApiError ? cause.status : undefined, {
        unauthenticated: label("error.unauthenticated"), forbidden: label("error.forbidden"), generic: label("error.generic"),
      }));
    } finally {
      setLoading(false);
    }
  }, [label]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section>
      <h1 className="mb-2 text-[length:var(--imkan-font-size-ui)] font-semibold">
        {label("files.trash")}
      </h1>
      {error ? <AlertBanner message={error} action={<button type="button" className="imkan-button-secondary" onClick={() => void load()}>{label("feedback.retry")}</button>} /> : null}
      {loading ? <SkeletonLoader rows={3} columns={2} /> : files.length === 0 ? (
        <EmptyState title={label("files.trash")} description={label("files.empty")} />
      ) : (
        <ul className="text-[length:var(--imkan-font-size-ui)]">
          {files.map((file) => (
            <li key={file.id} className="flex items-center justify-between gap-3 py-2">
              <span>{file.name}</span>
              <button
                type="button"
                onClick={async () => {
                  await restoreFile(file.id);
                  await load();
                }}
              >
                {label("files.restore")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
