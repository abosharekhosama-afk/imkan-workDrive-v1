/**
 * Persistence bridge between WorkDrive OfficeDocument.content and Univer snapshots.
 *
 * Stored shape:
 * {
 *   __engine: "univer",
 *   kind: "writer" | "sheet" | "show",
 *   snapshot: object,   // Univer unit data
 *   savedAt?: string
 * }
 */

export type UniverKind = "writer" | "sheet" | "show";

export type UniverStoredContent = {
  __engine: "univer";
  kind: UniverKind;
  snapshot: Record<string, unknown>;
  savedAt?: string;
};

export function isUniverStoredContent(value: unknown): value is UniverStoredContent {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return v.__engine === "univer" && typeof v.kind === "string" && v.snapshot != null && typeof v.snapshot === "object";
}

export function wrapUniverContent(kind: UniverKind, snapshot: Record<string, unknown>): UniverStoredContent {
  return {
    __engine: "univer",
    kind,
    snapshot,
    savedAt: new Date().toISOString(),
  };
}

export function extractUniverSnapshot(content: unknown): {
  kind?: UniverKind;
  snapshot: Record<string, unknown> | null;
  legacy: boolean;
} {
  if (isUniverStoredContent(content)) {
    return { kind: content.kind, snapshot: content.snapshot as Record<string, unknown>, legacy: false };
  }
  // Legacy IMKAN Office JSON or empty — no Univer snapshot yet
  return { kind: undefined, snapshot: null, legacy: content != null };
}

/** Map office document type string to Univer kind */
export function officeTypeToKind(type: string | null | undefined): UniverKind {
  const t = (type ?? "").toUpperCase();
  if (t === "SHEET") return "sheet";
  if (t === "SHOW") return "show";
  return "writer";
}
