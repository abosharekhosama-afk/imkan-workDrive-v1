"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale } from "../../../components/locale-provider";
import { ApiError } from "../../../lib/api/client";
import { listAudit, type AuditRecord, formatAuditAction } from "../../../lib/api/audit";
import { AlertBanner } from "../../../components/alert-banner";
import { EmptyState } from "../../../components/empty-state";
import { SkeletonLoader } from "../../../components/skeleton-loader";
import { errorMessageForStatus } from "../../../components/feedback-state-logic";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

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
    <section className="wd-page">
      <div className="wd-page-head">
        <div className="wd-page-head-titles">
          <h1>{label("audit.heading")}</h1>
          <p>{label("audit.description")}</p>
        </div>
        <div className="wd-page-head-actions">
          <button className="wd-btn wd-btn-ghost" onClick={() => void load()}>
            {label("audit.refresh")}
          </button>
        </div>
      </div>

      {error ? <AlertBanner message={error} action={<button type="button" className="imkan-button-secondary" onClick={() => void load()}>{label("feedback.retry")}</button>} /> : null}

      {loading ? (
        <SkeletonLoader rows={5} columns={4} />
      ) : rows.length === 0 ? (
        <EmptyState title={label("audit.empty")} />
      ) : (
        <div className="wd-card">
          <div className="wd-table-wrap">
            <table className="wd-table">
              <thead>
                <tr>
                  <th className="num">{label("audit.column.time")}</th>
                  <th>{label("audit.column.action")}</th>
                  <th>{label("audit.column.actor")}</th>
                  <th>{label("audit.column.resource")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="num" style={{ whiteSpace: "nowrap" }}>{formatDate(row.createdAt)}</td>
                    <td className="max-w-[400px] truncate" style={{ maxWidth: "400px" }}>
                      {formatAuditAction(row, label as (key: string) => string)}
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="wd-avatar">
                          {row.actor?.name ? row.actor.name.split(/\s+/).map((n) => n[0]).join("").slice(0, 2).toUpperCase() : row.actor?.email?.slice(0, 2).toUpperCase() ?? "؟"}
                        </div>
                        <span>{row.actor?.name ?? row.actor?.email ?? label("audit.unknownUser")}</span>
                      </div>
                    </td>
                    <td>
                      <span className="text-sm text-[color:var(--imkan-color-muted)]">
                        {row.resourceType} {row.resourceId}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}