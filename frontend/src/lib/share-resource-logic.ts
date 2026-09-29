import type { SharedItem } from "./api/shared";

export type ShareResourceType = "FILE" | "FOLDER";

export type ShareTarget = { type: ShareResourceType; id: string };

/** Resolve a single selected row into a share target (files or folders). */
export function resolveShareTarget(
  selectedIds: Set<string> | Iterable<string>,
  folders: Array<{ id: string }>,
  files: Array<{ id: string }>,
): ShareTarget | null {
  const ids = selectedIds instanceof Set ? selectedIds : new Set(selectedIds);
  if (ids.size !== 1) return null;
  const id = Array.from(ids)[0]!;
  if (folders.some((folder) => folder.id === id)) return { type: "FOLDER", id };
  if (files.some((file) => file.id === id)) return { type: "FILE", id };
  return null;
}

/** Find the first active share row for a resource. */
export function findActiveShareForResource(
  shares: SharedItem[],
  type: ShareResourceType,
  id: string,
): SharedItem | null {
  const now = Date.now();
  const matches = shares.filter((share) => {
    if (share.resourceType !== type || share.resourceId !== id) return false;
    if (share.status && share.status !== "ACTIVE") return false;
    if (share.expiresAt && new Date(share.expiresAt).getTime() < now) return false;
    return true;
  });
  if (!matches.length) return null;
  return matches.sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  })[0] ?? null;
}

/** Filter shares created by the current user for one resource. */
export function sharesForResource(
  shares: SharedItem[],
  type: ShareResourceType,
  id: string,
): SharedItem[] {
  const now = Date.now();
  return shares.filter((share) => {
    if (share.resourceType !== type || share.resourceId !== id) return false;
    if (share.status && share.status !== "ACTIVE") return false;
    if (share.expiresAt && new Date(share.expiresAt).getTime() < now) return false;
    return true;
  });
}

/** Human-readable share summary for the inspector details panel. */
export function formatInspectorShareSummary(
  shares: SharedItem[],
  locale: string,
  privateLabel: string,
): string {
  if (shares.length === 0) return privateLabel;

  const recipientNames = new Set<string>();
  let hasLink = false;
  for (const share of shares) {
    if (share.linkUrl) hasLink = true;
    for (const recipient of share.recipients ?? []) {
      const name = recipient.user?.name?.trim() || recipient.user?.email?.trim();
      if (name) recipientNames.add(name);
    }
  }

  const parts: string[] = [];
  if (recipientNames.size > 0) {
    const names = Array.from(recipientNames).slice(0, 3).join(", ");
    const suffix =
      recipientNames.size > 3
        ? locale === "ar"
          ? ` +${recipientNames.size - 3}`
          : ` +${recipientNames.size - 3} more`
        : "";
    parts.push(names + suffix);
  }
  if (hasLink) {
    parts.push(locale === "ar" ? "رابط عام" : "Public link");
  }
  return parts.length ? parts.join(" · ") : privateLabel;
}
