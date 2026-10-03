/** Pure helpers for backup scheduling and incremental selection (no Nest deps). */

export type ScheduleKind = 'MANUAL' | 'DAILY' | 'WEEKLY' | 'MONTHLY';

/**
 * Compute the next run instant after `from` (UTC).
 * - DAILY: next occurrence of scheduleHourUtc
 * - WEEKLY: next scheduleDay (0=Sun..6=Sat) at scheduleHourUtc
 * - MONTHLY: next scheduleDay (1-28) at scheduleHourUtc
 * - MANUAL: null
 */
export function computeNextRunAt(
  kind: ScheduleKind,
  from: Date,
  scheduleHourUtc: number | null | undefined,
  scheduleDay: number | null | undefined,
): Date | null {
  if (kind === 'MANUAL') return null;
  const hour = Math.max(0, Math.min(23, scheduleHourUtc ?? 2));
  const base = new Date(from.getTime());
  base.setUTCMinutes(0, 0, 0);

  if (kind === 'DAILY') {
    const candidate = new Date(base);
    candidate.setUTCHours(hour, 0, 0, 0);
    if (candidate.getTime() <= from.getTime()) {
      candidate.setUTCDate(candidate.getUTCDate() + 1);
    }
    return candidate;
  }

  if (kind === 'WEEKLY') {
    const targetDow = Math.max(0, Math.min(6, scheduleDay ?? 0));
    const candidate = new Date(base);
    candidate.setUTCHours(hour, 0, 0, 0);
    for (let i = 0; i < 8; i++) {
      if (candidate.getUTCDay() === targetDow && candidate.getTime() > from.getTime()) return candidate;
      candidate.setUTCDate(candidate.getUTCDate() + 1);
    }
    return candidate;
  }

  // MONTHLY
  const dom = Math.max(1, Math.min(28, scheduleDay ?? 1));
  const candidate = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), dom, hour, 0, 0, 0));
  if (candidate.getTime() <= from.getTime()) {
    return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, dom, hour, 0, 0, 0));
  }
  return candidate;
}

/** Whether a live file should be included in an incremental run. */
export function shouldIncludeInIncremental(input: {
  fileId: string;
  updatedAt: Date | string;
  baselineSnapshotAt: Date | string | null;
  /** file IDs present in the baseline (last successful) backup run */
  baselineFileIds: Set<string>;
}): boolean {
  if (!input.baselineSnapshotAt) return true; // no baseline → treat as full set
  const updated = new Date(input.updatedAt).getTime();
  const baseline = new Date(input.baselineSnapshotAt).getTime();
  if (updated > baseline) return true;
  if (!input.baselineFileIds.has(input.fileId)) return true; // new file never seen
  return false;
}
