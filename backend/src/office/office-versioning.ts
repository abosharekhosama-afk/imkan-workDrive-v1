import { createHash } from 'crypto';

/** Stable integrity marker for the canonical persisted Office JSON state. */
export function computeOfficeContentHash(content: unknown): string {
  return createHash('sha256').update(JSON.stringify(content ?? null)).digest('hex');
}
