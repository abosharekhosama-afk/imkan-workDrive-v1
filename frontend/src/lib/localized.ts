/**
 * Locale-aware formatting helpers for dates and byte sizes shared by the
 * folder/file tables and grid. Kept pure (no React) so they are unit-testable.
 */

/** Human-friendly date; renders in Arabic via the Cairo/ar-EG locale for RTL. */
export function formatDateLocalized(
  value: string | null | undefined,
  locale: string,
  includeTime = false,
): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const resolvedLocale = locale === "ar" ? "ar-EG" : locale || undefined;
  try {
    const options: Intl.DateTimeFormatOptions = includeTime
      ? { dateStyle: "medium", timeStyle: "short" }
      : { dateStyle: "medium" };
    return new Intl.DateTimeFormat(resolvedLocale, options).format(date);
  } catch {
    return date.toLocaleDateString();
  }
}

/** Returns whichever ISO timestamp sorts latest, preferring `b` on ties. */
export function latestOf(a: string | null | undefined, b: string | null | undefined): string | null | undefined {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

/**
 * Recursive/aggregated folder size: sums the `size` of every active file that
 * belongs to the folder subtree, using the provided files and per-folder
 * child sizes already resolved downstream. Falls back gracefully when a folder
 * has no known children.
 */
export function aggregateFolderSize(files: { folderId?: string | null; size?: number | null }[]): (folderId: string) => number {
  const direct = new Map<string, number>();
  for (const file of files) {
    if (!file.folderId) continue;
    const current = direct.get(file.folderId) ?? 0;
    direct.set(file.folderId, current + (file.size ?? 0));
  }
  return (folderId: string) => direct.get(folderId) ?? 0;
}