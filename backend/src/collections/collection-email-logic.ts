const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const COLLECTION_EMAIL_LIMIT = 25;

export function parseInviteEmails(input: string[] | string | null | undefined, limit = COLLECTION_EMAIL_LIMIT): { emails: string[]; invalid: string[] } {
  const raw = Array.isArray(input) ? input.join(',') : String(input ?? '');
  const parts = raw.split(/[,;\s]+/).map((part) => part.trim().toLowerCase()).filter(Boolean);
  const emails: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    if (!EMAIL.test(part) || part.length > 320) {
      invalid.push(part);
      continue;
    }
    if (seen.has(part)) continue;
    if (emails.length >= limit) {
      invalid.push(part);
      continue;
    }
    seen.add(part);
    emails.push(part);
  }
  return { emails, invalid };
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));
}
