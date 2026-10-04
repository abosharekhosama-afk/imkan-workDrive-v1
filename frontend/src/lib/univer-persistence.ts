/**
 * Bridge between WorkDrive OfficeDocument.content and Univer unit snapshots.
 */

import {
  imkanContentToUniverSnapshot,
  type UniverKind,
} from "./imkan-to-univer";

export type { UniverKind };

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

export function extractUniverSnapshot(
  content: unknown,
  preferredKind?: UniverKind,
  title?: string,
): {
  kind?: UniverKind;
  snapshot: Record<string, unknown> | null;
  legacy: boolean;
  source: "univer" | "imkan" | "empty";
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
    const hasData = snap && Object.keys(snap).length > 0;
    return { kind, snapshot: hasData ? snap : null, legacy: false, source: "univer" };
  }

  if (content && typeof content === "object") {
    const c = content as any;
    const kind: UniverKind =
      preferredKind ||
      (String(c.type).toUpperCase() === "SHEET"
        ? "sheet"
        : String(c.type).toUpperCase() === "SHOW"
          ? "show"
          : "writer");
    const converted = imkanContentToUniverSnapshot(content, kind, title);
    if (converted) {
      return { kind, snapshot: converted, legacy: true, source: "imkan" };
    }
  }

  return { kind: preferredKind, snapshot: null, legacy: content != null, source: "empty" };
}

export function officeTypeToKind(type: string | null | undefined): UniverKind {
  const t = (type ?? "").toUpperCase();
  if (t === "SHEET") return "sheet";
  if (t === "SHOW") return "show";
  return "writer";
}
