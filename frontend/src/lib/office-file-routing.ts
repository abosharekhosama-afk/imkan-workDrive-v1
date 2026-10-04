export type OfficeEditor = "writer" | "sheet" | "show";

export function resolveOfficeEditor(fileName: string, mimeType?: string | null): OfficeEditor | null {
  const ext = fileName.includes(".") ? fileName.split(".").pop()!.toLowerCase() : "";
  const mime = (mimeType ?? "").toLowerCase();
  if (ext === "imkan") {
    if (mime.includes("sheet")) return "sheet";
    if (mime.includes("show")) return "show";
    return "writer";
  }
  if (["docx", "doc", "docm", "odt", "rtf", "txt"].includes(ext) || /wordprocessingml|msword|opendocument\.text|text\/plain/.test(mime)) return "writer";
  if (["xlsx", "xls", "xlsm", "ods", "csv"].includes(ext) || /spreadsheet|excel|opendocument\.spreadsheet|text\/csv/.test(mime)) return "sheet";
  if (["pptx", "ppt", "pptm", "odp", "pps", "ppsx"].includes(ext) || /presentation|powerpoint|opendocument\.presentation/.test(mime)) return "show";
  if (mime.includes("imkan.sheet") || mime.includes("spreadsheet")) return "sheet";
  if (mime.includes("imkan.show") || mime.includes("presentation")) return "show";
  if (mime.includes("imkan.writer") || mime.includes("wordprocessing")) return "writer";
  return null;
}

export function isNativeImkanOfficeFile(fileName: string, mimeType?: string | null): boolean {
  const ext = fileName.includes(".") ? fileName.split(".").pop()!.toLowerCase() : "";
  return ext === "imkan" || (mimeType ?? "").toLowerCase().startsWith("application/vnd.imkan.");
}

/** Legacy IMKAN Office path — kept for reference only; not used as primary open. */
export function imkanOfficeEditorPath(fileId: string, fileName: string, mimeType?: string | null): string | null {
  const editor = resolveOfficeEditor(fileName, mimeType);
  return editor ? `/office/${editor}/${encodeURIComponent(fileId)}` : null;
}

/**
 * PRIMARY editor path — always Univer for every editable office type
 * (documents, spreadsheets, presentations, including legacy .imkan).
 * IMKAN Office routes remain in the codebase but are not activated.
 */
export function officeEditorPath(fileId: string, fileName: string, mimeType?: string | null): string | null {
  const editor = resolveOfficeEditor(fileName, mimeType);
  if (!editor) return null;
  return `/office/univer/${encodeURIComponent(fileId)}?kind=${editor}`;
}
