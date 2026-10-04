export type FileControlMark = "CHECKED_OUT" | "FINAL" | "ACTIVE";

export function fileControlFromRecord(file: {
  status?: string | null;
  isFinal?: boolean | null;
  checkedOutById?: string | null;
} | null | undefined): FileControlMark {
  if (file?.isFinal) return "FINAL";
  if (file?.checkedOutById) return "CHECKED_OUT";
  const raw = String(file?.status ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (raw === "CHECKED_OUT" || raw === "CHECKOUT" || raw === "LOCKED") return "CHECKED_OUT";
  if (raw === "FINAL" || raw === "MARKED_FINAL" || raw === "READONLY" || raw === "READ_ONLY") return "FINAL";
  return "ACTIVE";
}
