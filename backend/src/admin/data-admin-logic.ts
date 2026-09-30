export const LARGE_FILE_MIN_BYTES = 100 * 1024 * 1024;

export const SHARE_PERMISSIONS = ['VIEW', 'COMMENT', 'EDIT', 'ORGANIZE', 'FULL_ACCESS'] as const;
export type DataSharePermission = (typeof SHARE_PERMISSIONS)[number];

export type DataShareKind = 'team' | 'internet' | 'download';

const TRASH_DAY_CHOICES = [7, 15, 30, 90, 120];

export function classifyDataShare(input: { recipientCount: number; canDownload: boolean }): DataShareKind {
  if (input.recipientCount > 0) return 'team';
  if (input.canDownload) return 'download';
  return 'internet';
}

export function dataShareMatches(kind: DataShareKind, filter: string | undefined): boolean {
  switch (filter) {
    case 'team':
      return kind === 'team';
    case 'internet':
      return kind === 'internet' || kind === 'download';
    case 'download':
      return kind === 'download';
    case 'external':
      return kind !== 'team';
    default:
      return true;
  }
}

export function dataLocationMatches(teamFolderId: string | null | undefined, location: string | undefined): boolean {
  if (!location || location === 'all') return true;
  if (location === 'personal') return teamFolderId == null;
  return teamFolderId === location;
}

export function containsLikePattern(query: string): string {
  const escaped = query.trim().slice(0, 120).replace(/[\\%_]/g, (ch) => `\\${ch}`);
  return `%${escaped}%`;
}

export function resolveTrashDays(value: unknown): number {
  const days = Number(value);
  return TRASH_DAY_CHOICES.includes(days) ? days : 30;
}

export function trashExpiresAt(now: Date, trashDays: unknown): Date {
  return new Date(now.getTime() + resolveTrashDays(trashDays) * 24 * 60 * 60 * 1000);
}

export function normalizeAccessReason(reason: unknown): string | null {
  if (typeof reason !== 'string') return null;
  const text = reason.trim();
  if (text.length < 3 || text.length > 500) return null;
  return text;
}

export function isSharePermission(value: unknown): value is DataSharePermission {
  return typeof value === 'string' && (SHARE_PERMISSIONS as readonly string[]).includes(value);
}

export function uniqueResourceIds(ids: unknown, limit = 50): string[] {
  if (!Array.isArray(ids)) return [];
  const out: string[] = [];
  for (const id of ids) {
    if (typeof id !== 'string' || !/^[0-9a-fA-F-]{36}$/.test(id) || out.includes(id)) continue;
    out.push(id);
    if (out.length >= limit) break;
  }
  return out;
}
