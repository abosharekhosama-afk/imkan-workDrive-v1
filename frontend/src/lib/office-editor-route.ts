/**
 * IMKAN Office routing contract.
 *
 * Templates → Actions → Edit Content creates a working copy through
 * `POST /templates/:id/use` and then has to open it in the editor that owns the
 * generated document. The Office document type returned by that API (WRITER,
 * SHEET, SHOW) is authoritative, because the backend refuses to prepare a
 * working copy for anything that is not Word/Excel/PowerPoint. The extension /
 * file name / mime type are only used as secondary signals so that a template
 * can never be silently pushed into the wrong editor (or into a route that does
 * not exist) and so a non-office template fails loudly instead of opening a
 * broken page.
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
  rtf: "writer",
  xls: "sheet",
  xlsx: "sheet",
  xlsm: "sheet",
  csv: "sheet",
  ppt: "show",
  pptx: "show",
};

const SEGMENTS_BY_MIME_TYPE: Record<string, OfficeEditorSegment> = {
  "application/msword": "writer",
  "application/rtf": "writer",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "writer",
  "application/vnd.ms-excel": "sheet",
  "text/csv": "sheet",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "sheet",
  "application/vnd.ms-powerpoint": "show",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "show",
};

/** Extension of a file name without the leading dot, lower-cased. */
export function officeExtensionOf(fileName?: string | null): string | null {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec((fileName ?? "").trim());
  return match?.[1] ? match[1].toLowerCase() : null;
}

/**
 * Resolves which IMKAN Office editor owns a document, or `null` when the
 * document is not editable in IMKAN Office.
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
  const extension = (input.extension ?? officeExtensionOf(input.fileName))?.replace(/^\./, "").trim().toLowerCase();
  if (extension) {
    const byExtension = SEGMENTS_BY_EXTENSION[extension];
    if (byExtension) return byExtension;
  }
  const mimeType = input.mimeType?.trim().toLowerCase();
  if (mimeType) {
    const byMimeType = SEGMENTS_BY_MIME_TYPE[mimeType];
    if (byMimeType) return byMimeType;
  }
  return null;
}

/**
 * Builds the editor URL for a working copy created from a template.
 * Returns `null` when the document cannot be edited in IMKAN Office so the
 * caller can surface a clear error instead of navigating to a dead route.
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
  return `/office/${segment}/${fileId}${templateId ? `?templateId=${encodeURIComponent(templateId)}` : ""}`;
}
