/**
 * Bridge between WorkDrive OfficeDocument.content and Univer unit snapshots.
 *
 * Stored shape (accepted by backend normalizeOfficeContent):
 * {
 *   __engine: "univer",
 *   type: "WRITER" | "SHEET" | "SHOW",
 *   kind: "writer" | "sheet" | "show",
 *   snapshot: object,
 *   savedAt?: string
 * }
 */

export type UniverKind = "writer" | "sheet" | "show";

export type UniverStoredContent = {
  __engine: "univer";
  type: "WRITER" | "SHEET" | "SHOW";
  kind: UniverKind;
  snapshot: Record<string, unknown>;
  savedAt?: string;
};

const KIND_TO_TYPE: Record<UniverKind, "WRITER" | "SHEET" | "SHOW"> = {
  writer: "WRITER",
  sheet: "SHEET",
  show: "SHOW",
};

export function isUniverStoredContent(value: unknown): value is UniverStoredContent {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return v.__engine === "univer" && v.snapshot != null && typeof v.snapshot === "object";
}

export function wrapUniverContent(kind: UniverKind, snapshot: Record<string, unknown>): UniverStoredContent {
  return {
    __engine: "univer",
    type: KIND_TO_TYPE[kind],
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
    const kind =
      content.kind === "sheet" || content.kind === "show" || content.kind === "writer"
        ? content.kind
        : content.type === "SHEET"
          ? "sheet"
          : content.type === "SHOW"
            ? "show"
            : "writer";
    const snap = content.snapshot as Record<string, unknown>;
    // Empty object means no prior snapshot
    const hasData = snap && Object.keys(snap).length > 0;
    return { kind, snapshot: hasData ? snap : null, legacy: false };
  }
  return { kind: undefined, snapshot: null, legacy: content != null };
}

export function officeTypeToKind(type: string | null | undefined): UniverKind {
  const t = (type ?? "").toUpperCase();
  if (t === "SHEET") return "sheet";
  if (t === "SHOW") return "show";
  return "writer";
}
