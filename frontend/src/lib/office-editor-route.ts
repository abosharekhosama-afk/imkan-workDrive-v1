/**
 * Office editor routing contract (Univer-first).
 *
 * Standard documents, spreadsheets, presentations, and template working copies
 * open in Univer at `/office/univer/[fileId]?kind=writer|sheet|show`.
 *
 * Native IMKAN Office routes (`/office/writer|sheet|show/...`) remain available
 * for `.imkan` files and explicit "Open in IMKAN Office" actions.
 */

export type OfficeEditorSegment = "writer" | "sheet" | "show";

const SEGMENTS_BY_DOCUMENT_TYPE: Record<string, OfficeEditorSegment> = {
  WRITER: "writer",
  SHEET: "sheet",
  SHOW: "show",
};

const SEGMENTS_BY_EXTENSION: Record<string, OfficeEditorSegment> = {
  doc: "writer",
  docx: "writer",
  docm: "writer",
  odt: "writer",
  rtf: "writer",
  txt: "writer",
  xls: "sheet",
  xlsx: "sheet",
  xlsm: "sheet",
  ods: "sheet",
  csv: "sheet",
  ppt: "show",
  pptx: "show",
  pptm: "show",
  odp: "show",
  imkan: "writer", // refined by mime when available
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

/** Extension of a file name without the leading dot, lower-cased. */
export function officeExtensionOf(fileName?: string | null): string | null {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec((fileName ?? "").trim());
  return match?.[1] ? match[1].toLowerCase() : null;
}

/**
 * Resolves which editor segment (writer / sheet / show) owns a document.
 */
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

function isNativeImkan(input: {
  extension?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
}): boolean {
  const ext = (input.extension ?? officeExtensionOf(input.fileName))?.replace(/^\./, "").toLowerCase();
  if (ext === "imkan") return true;
  const mime = (input.mimeType ?? "").toLowerCase();
  return mime.startsWith("application/vnd.imkan.");
}

/**
 * Primary editor URL — Univer for standard formats and template working copies.
 * Native `.imkan` documents still open in IMKAN Office.
 */
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
  const templateId = input.templateId?.trim();
  const qs = new URLSearchParams();
  qs.set("kind", segment);
  if (templateId) qs.set("templateId", templateId);

  if (isNativeImkan(input)) {
    return `/office/${segment}/${encodeURIComponent(fileId)}${templateId ? `?templateId=${encodeURIComponent(templateId)}` : ""}`;
  }

  return `/office/univer/${encodeURIComponent(fileId)}?${qs.toString()}`;
}

/**
 * Explicit IMKAN Office URL (never Univer).
 */
export function imkanOfficeEditorHref(input: {
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
  const templateId = input.templateId?.trim();
  return `/office/${segment}/${encodeURIComponent(fileId)}${templateId ? `?templateId=${encodeURIComponent(templateId)}` : ""}`;
}

/**
 * Rewrites a legacy backend `editorPath` (`/office/writer|sheet|show/...`)
 * to the Univer route, preserving templateId when present.
 */
export function normalizeEditorPathToUniver(editorPath: string | null | undefined): string | null {
  if (!editorPath) return null;
  const trimmed = editorPath.trim();
  if (!trimmed) return null;
  // Already Univer
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
