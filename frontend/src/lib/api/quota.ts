import { apiRequest } from "./client.ts";

/** Per-bucket storage usage reported by the backend quota service. */
export interface QuotaBucketUsage {
  usedBytes: number;
  quotaBytes: number | null;
}

export interface QuotaOverview {
  scope: "ORGANIZATION" | "USER";
  buckets: {
    personal: QuotaBucketUsage;
    teamFolders: QuotaBucketUsage;
    sharedLinks: QuotaBucketUsage;
    total: QuotaBucketUsage;
  };
  /** True when the active tenant provides no storage limit. */
  unlimited: boolean;
  /** Percentage of the total quota consumed (0–100), clamped and rounded. */
  usedPercent: number;
}

interface RawQuotaRecord {
  usedBytes?: number | string | null;
  quotaBytes?: number | string | null;
}

interface RawQuotaOverview extends RawQuotaRecord {
  scope?: unknown;
  unlimited?: unknown;
  usedPercent?: number | string | null;
  buckets?: Record<string, RawQuotaRecord>;
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeBucket(raw: RawQuotaRecord | undefined): QuotaBucketUsage {
  return {
    usedBytes: toNumber(raw?.usedBytes) ?? 0,
    quotaBytes: toNumber(raw?.quotaBytes),
  };
}

/**
 * Normalizes the tenant quota payload served by `GET /storage/quota`
 * (`{quotaBytes, usedBytes}` as strings) into the overview contract.
 */
export function normalizeQuota(raw: RawQuotaOverview): QuotaOverview {
  const rawBuckets = raw.buckets ?? {};
  const buckets = {
    personal: normalizeBucket(rawBuckets.personal),
    teamFolders: normalizeBucket(rawBuckets.teamFolders),
    sharedLinks: normalizeBucket(rawBuckets.sharedLinks),
    total: normalizeBucket(
      Object.keys(rawBuckets).length > 0 ? (rawBuckets.total ?? rawBuckets) : raw,
    ),
  };
  let usedPercent = toNumber(raw.usedPercent) ?? 0;
  if (usedPercent === 0 && buckets.total.quotaBytes !== null && buckets.total.quotaBytes > 0) {
    usedPercent = Math.round((buckets.total.usedBytes / buckets.total.quotaBytes) * 100);
  }
  if (!Number.isFinite(usedPercent) || usedPercent < 0) usedPercent = 0;
  if (usedPercent > 100) usedPercent = 100;
  // Unlimited is an explicit server flag; absent a flag it means "no configured ceiling".
  const unlimited =
    raw.unlimited === undefined || raw.unlimited === null
      ? buckets.total.quotaBytes === null || buckets.total.quotaBytes <= 0
      : Boolean(raw.unlimited);
  return {
    scope: raw.scope === "USER" ? "USER" : "ORGANIZATION",
    buckets,
    unlimited,
    usedPercent,
  };
}

/** Fetch storage usage for the current active tenant context. */
export async function getStorageOverview(): Promise<QuotaOverview> {
  const raw = await apiRequest<RawQuotaOverview>("/storage/quota");
  return normalizeQuota(raw);
}

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/** Human-readable byte size (e.g. 1.4 MB) shared by grids, tables and toast. */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return "—";
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const digits = unitIndex === 0 || value >= 100 ? 0 : 1;
  return `${value.toFixed(digits)} ${BYTE_UNITS[unitIndex]}`;
}
