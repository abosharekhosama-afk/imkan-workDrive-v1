/** Pure helpers for WORM-style backup lock decisions (P4). */

export function isRunImmutable(input: {
  locked: boolean;
  immutableUntil: Date | string | null | undefined;
  purgedAt?: Date | string | null;
  now?: Date;
}): boolean {
  if (input.purgedAt) return false;
  if (!input.locked) return false;
  const now = (input.now ?? new Date()).getTime();
  if (input.immutableUntil == null) return true; // locked with no expiry = indefinite
  return new Date(input.immutableUntil).getTime() > now;
}

/** Whether retention automation may hard-delete this run. */
export function canAutoPurge(input: {
  locked: boolean;
  immutableUntil: Date | string | null | undefined;
  purgedAt?: Date | string | null;
  snapshotAt: Date | string;
  retentionDays: number | null | undefined;
  now?: Date;
}): boolean {
  if (input.purgedAt) return false;
  if (isRunImmutable(input)) return false;
  if (input.retentionDays == null) return false; // keep forever
  const now = input.now ?? new Date();
  const ageMs = now.getTime() - new Date(input.snapshotAt).getTime();
  return ageMs > input.retentionDays * 86_400_000;
}

/** Dual-control: approver must differ from requester. */
export function canApprovePurge(requesterId: string, approverId: string): boolean {
  return Boolean(requesterId && approverId && requesterId !== approverId);
}

export const DOWNLOAD_MEMORY_LIMIT_BYTES = 500 * 1024 * 1024;
export const DOWNLOAD_STREAM_LIMIT_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB hard cap
