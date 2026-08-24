"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale } from "../../../components/locale-provider";
import { ApiError } from "../../../lib/api/client";
import { listAudit, type AuditRecord } from "../../../lib/api/audit";
import { AlertBanner } from "../../../components/alert-banner";
import { EmptyState } from "../../../components/empty-state";
import { SkeletonLoader } from "../../../components/skeleton-loader";
import { errorMessageForStatus } from "../../../components/feedback-state-logic";

export default function AuditPage() {
  const { label } = useLocale();
  const [rows, setRows] = useState<AuditRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    await Promise.resolve();
    try {
      setLoading(true);
      setError(null);
      setRows(await listAudit());
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
        {label("audit.heading")}
      </h1>
      {error ? <AlertBanner message={error} action={<button type="button" className="imkan-button-secondary" onClick={() => void load()}>{label("feedback.retry")}</button>} /> : null}
      {loading ? <SkeletonLoader rows={3} columns={2} /> : rows.length === 0 ? (
        <EmptyState title={label("audit.empty")} />
      ) : (
        <table className="w-full border-collapse text-start text-[length:var(--imkan-font-size-ui)]">
          <thead>
            <tr className="border-b border-[color:var(--imkan-color-muted)]">
              <th className="py-2 text-start font-medium">{label("audit.action")}</th>
              <th className="py-2 text-start font-medium">{label("audit.resource")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-[color:var(--imkan-color-surface)]">
                <td className="py-2">{row.action}</td>
                <td className="py-2">
                  {row.resourceType} {row.resourceId}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
