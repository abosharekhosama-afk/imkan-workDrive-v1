/**
 * Office editor routing — Univer is the only activated editor.
 * IMKAN Office routes exist in the tree but are not used for open/edit/save flows.
 */

export type OfficeEditorSegment = "writer" | "sheet" | "show";

const SEGMENTS_BY_DOCUMENT_TYPE: Record<string, OfficeEditorSegment> = {
  WRITER: "writer",
  SHEET: "sheet",
  SHOW: "show",
};

const SEGMENTS_BY_EXTENSION: Record<string, OfficeEditorSegment> = {
  doc: "writer", docx: "writer", docm: "writer", odt: "writer", rtf: "writer", txt: "writer",
  xls: "sheet", xlsx: "sheet", xlsm: "sheet", ods: "sheet", csv: "sheet",
  ppt: "show", pptx: "show", pptm: "show", odp: "show", pps: "show", ppsx: "show",
  imkan: "writer",
};

const SEGMENTS_BY_MIME_TYPE: Record<string, OfficeEditorSegment> = {
  "application/msword": "writer",
  "application/rtf": "writer",
  "text/plain": "writer",
  "application/vnd.oasis.opendocument.text": "writer",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "writer",
  "application/vnd.ms-excel": "sheet",
  "text/csv": "sheet",
  "application/vnd.oasis.opendocument.spreadsheet": "sheet",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "sheet",
  "application/vnd.ms-powerpoint": "show",
  "application/vnd.oasis.opendocument.presentation": "show",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "show",
  "application/vnd.imkan.writer+json": "writer",
  "application/vnd.imkan.sheet+json": "sheet",
  "application/vnd.imkan.show+json": "show",
};

export function officeExtensionOf(fileName?: string | null): string | null {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec((fileName ?? "").trim());
  return match?.[1] ? match[1].toLowerCase() : null;
}

export function resolveOfficeEditorSegment(input: {
  documentType?: string | null;
  extension?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
}): OfficeEditorSegment | null {
  const documentType = input.documentType?.trim().toUpperCase();
  if (documentType) {
    const byType = SEGMENTS_BY_DOCUMENT_TYPE[documentType];
    if (byType) return byType;
  }
  const mimeType = input.mimeType?.trim().toLowerCase();
  if (mimeType) {
    const byMimeType = SEGMENTS_BY_MIME_TYPE[mimeType];
    if (byMimeType) return byMimeType;
    if (mimeType.includes("imkan.writer")) return "writer";
    if (mimeType.includes("imkan.sheet")) return "sheet";
    if (mimeType.includes("imkan.show")) return "show";
  }
  const extension = (input.extension ?? officeExtensionOf(input.fileName))?.replace(/^\./, "").trim().toLowerCase();
  if (extension) {
    const byExtension = SEGMENTS_BY_EXTENSION[extension];
    if (byExtension) return byExtension;
  }
  return null;
}

/** Primary editor URL — always Univer. */
export function officeEditorHref(input: {
  fileId: string | null | undefined;
  documentType?: string | null;
  extension?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  templateId?: string | null;
}): string | null {
  const fileId = input.fileId?.trim();
  if (!fileId) return null;
  const segment = resolveOfficeEditorSegment(input);
  if (!segment) return null;
  const qs = new URLSearchParams();
  qs.set("kind", segment);
  const templateId = input.templateId?.trim();
  if (templateId) qs.set("templateId", templateId);
  return `/office/univer/${encodeURIComponent(fileId)}?${qs.toString()}`;
}

/** Kept for compatibility; same as officeEditorHref (Univer-only activation). */
export function imkanOfficeEditorHref(input: Parameters<typeof officeEditorHref>[0]): string | null {
  return officeEditorHref(input);
}

/** Rewrite any legacy /office/writer|sheet|show path to Univer. */
export function normalizeEditorPathToUniver(editorPath: string | null | undefined): string | null {
  if (!editorPath) return null;
  const trimmed = editorPath.trim();
  if (!trimmed) return null;
  if (trimmed.includes("/office/univer/")) return trimmed;
  try {
    const url = new URL(trimmed, "https://imkan.local");
    const match = url.pathname.match(/^\/office\/(writer|sheet|show)\/([^/]+)/i);
    if (!match) return trimmed;
    const kind = match[1].toLowerCase();
    const fileId = decodeURIComponent(match[2]);
    const templateId = url.searchParams.get("templateId");
    const qs = new URLSearchParams();
    qs.set("kind", kind);
    if (templateId) qs.set("templateId", templateId);
    return `/office/univer/${encodeURIComponent(fileId)}?${qs.toString()}`;
  } catch {
    return trimmed;
  }
}
