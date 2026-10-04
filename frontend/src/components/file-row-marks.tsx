"use client";

import { collapsedLabels, rowExpiryMark, type ResourceMarkLabel } from "../lib/file-row-status-logic";

export function FileRowMarks({
  labels,
  expiresAt,
  status,
  expiredLabel,
}: {
  labels: ResourceMarkLabel[];
  expiresAt?: string | null;
  status?: string | null;
  expiredLabel: string;
}) {
  const { shown, hidden } = collapsedLabels(labels, 2);
  const expired = rowExpiryMark(status, expiresAt);
  if (shown.length === 0 && !expired) return null;
  const when = expired?.at ? new Date(expired.at).toLocaleDateString() : "";
  return (
    <span className="wd-row-marks" onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}>
      {shown.map((label) => (
        <span key={label.id} className="wd-row-label" title={label.name} style={{ color: label.color, borderColor: label.color }}>
          <i aria-hidden="true" style={{ background: label.color }} />
          <span>{label.name}</span>
        </span>
      ))}
      {hidden.length > 0 ? <span className="wd-row-label" title={hidden.map((label) => label.name).join(", ")}>+{hidden.length}</span> : null}
      {expired ? <span className="wd-badge wd-badge-red" title={when ? `${expiredLabel} · ${when}` : expiredLabel}>{expiredLabel}</span> : null}
    </span>
  );
}
