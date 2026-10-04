export type OfficeEditor = "writer" | "sheet" | "show";

export function resolveOfficeEditor(fileName: string, mimeType?: string | null): OfficeEditor | null {
  const ext = fileName.includes(".") ? fileName.split(".").pop()!.toLowerCase() : "";
  const mime = (mimeType ?? "").toLowerCase();
  if (ext === "imkan") {
    if (mime.includes("writer")) return "writer";
    if (mime.includes("sheet")) return "sheet";
    if (mime.includes("show")) return "show";
    return "writer";
  }
  if (["docx", "doc", "docm", "odt", "rtf", "txt"].includes(ext) || /wordprocessingml|msword|opendocument\.text|text\/plain/.test(mime)) return "writer";
  if (["xlsx", "xls", "xlsm", "ods", "csv"].includes(ext) || /spreadsheet|excel|opendocument\.spreadsheet|text\/csv/.test(mime)) return "sheet";
  if (["pptx", "ppt", "pptm", "odp", "pps", "ppsx"].includes(ext) || /presentation|powerpoint|opendocument\.presentation/.test(mime)) return "show";
  return null;
}

export function isNativeImkanOfficeFile(fileName: string, mimeType?: string | null): boolean {
  const ext = fileName.includes(".") ? fileName.split(".").pop()!.toLowerCase() : "";
  return ext === "imkan" || (mimeType ?? "").toLowerCase().startsWith("application/vnd.imkan.");
}

/**
 * Path to the built-in IMKAN Office editor (writer / sheet / show).
 */
export function imkanOfficeEditorPath(fileId: string, fileName: string, mimeType?: string | null): string | null {
  const editor = resolveOfficeEditor(fileName, mimeType);
  return editor ? `/office/${editor}/${encodeURIComponent(fileId)}` : null;
}

/**
 * Primary editor path for opening a file for editing.
 * - Native IMKAN Office files (.imkan) → IMKAN Office
 * - All other office formats (doc/docx/xls/xlsx/ppt/pptx/…) → Univer
 */
export function officeEditorPath(fileId: string, fileName: string, mimeType?: string | null): string | null {
  const editor = resolveOfficeEditor(fileName, mimeType);
  if (!editor) return null;

  if (isNativeImkanOfficeFile(fileName, mimeType)) {
    return `/office/${editor}/${encodeURIComponent(fileId)}`;
  }

  return `/office/univer/${encodeURIComponent(fileId)}?kind=${editor}`;
}
