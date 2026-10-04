export type ResourceMarkLabel = { id: string; name: string; color: string };

export function collapsedLabels(labels: ResourceMarkLabel[], limit = 2): { shown: ResourceMarkLabel[]; hidden: ResourceMarkLabel[] } {
  const seen = new Set<string>();
  const unique: ResourceMarkLabel[] = [];
  for (const label of labels) {
    const name = label.name?.trim();
    if (!name || seen.has(label.id)) continue;
    seen.add(label.id);
    unique.push({ ...label, name });
  }
  return { shown: unique.slice(0, Math.max(0, limit)), hidden: unique.slice(Math.max(0, limit)) };
}

/** A real expiry timestamp in the past. Missing or future dates are not expired. */
export function shareExpiryMark(expiresAt: string | null | undefined, now = Date.now()): { at: string } | null {
  if (!expiresAt) return null;
  const time = Date.parse(expiresAt);
  if (!Number.isFinite(time) || time > now) return null;
  return { at: new Date(time).toISOString() };
}

export function rowExpiryMark(status: string | null | undefined, expiresAt: string | null | undefined, now = Date.now()): { at: string | null } | null {
  const raw = String(status ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (raw === "EXPIRED" || raw === "EXPIRE") {
    const dated = shareExpiryMark(expiresAt, now);
    return { at: dated?.at ?? (expiresAt && Number.isFinite(Date.parse(expiresAt)) ? new Date(expiresAt).toISOString() : null) };
  }
  const dated = shareExpiryMark(expiresAt, now);
  return dated ? { at: dated.at } : null;
}
