"use client";

import { useEffect, useState } from "react";
import { useLocale } from "./locale-provider";
import { formatBytes, getStorageOverview, type QuotaOverview } from "../lib/api/quota";

function severityFor(percent: number): "ok" | "warn" | "danger" {
  if (percent >= 90) return "danger";
  if (percent >= 75) return "warn";
  return "ok";
}

/**
 * Compact storage usage meter for the Quick Actions area of the top bar.
 * Renders bytes-used against the tenant quota and degrades to a simple total
 * when no quota limit is configured.
 */
export function StorageIndicator() {
  const { label } = useLocale();
  const [quota, setQuota] = useState<QuotaOverview | null>(null);

  useEffect(() => {
    let cancelled = false;
    getStorageOverview()
      .then((overview) => {
        if (!cancelled) setQuota(overview);
      })
      .catch(() => {
        if (!cancelled) setQuota(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!quota) {
    // Loading and failure both stay silent — storage is an indicator, not a blocker.
    return (
      <span className="zoho-storage" title={label("quota.title")}>
        <span className="zoho-storage-track"><span className="zoho-storage-fill indeterminate" /></span>
      </span>
    );
  }

  const percent = quota.unlimited ? 0 : quota.usedPercent;
  const severity = severityFor(percent);
  const title = quota.unlimited
    ? `${label("quota.title")} · ${formatBytes(quota.buckets.total.usedBytes)} · ${label("quota.unlimited")}`
    : `${label("quota.title")} · ${formatBytes(quota.buckets.total.usedBytes)} ${label("quota.of")} ${formatBytes(quota.buckets.total.quotaBytes)} (${percent}%)`;

  return (
    <span className={`zoho-storage ${severity}`} title={title}>
      <span className="zoho-storage-track" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={title}>
        <span className="zoho-storage-fill" style={{ width: `${quota.unlimited ? 100 : Math.max(percent, 2)}%` }} />
      </span>
      <small>{formatBytes(quota.buckets.total.usedBytes)}</small>
    </span>
  );
}
