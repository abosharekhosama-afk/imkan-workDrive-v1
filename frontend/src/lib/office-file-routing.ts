export type OfficeEditor = "writer" | "sheet" | "show";

export function resolveOfficeEditor(fileName: string, mimeType?: string | null): OfficeEditor | null {
  const ext = fileName.includes(".") ? fileName.split(".").pop()!.toLowerCase() : "";
  const mime = (mimeType ?? "").toLowerCase();
  if (ext === "imkan") {
    if (mime.includes("writer")) return "writer";
    if (mime.includes("sheet")) return "sheet";
    if (mime.includes("show")) return "show";
  }
  if (["docx", "doc", "odt", "rtf", "txt"].includes(ext) || /wordprocessingml|msword|opendocument.text|text\/plain/.test(mime)) return "writer";
  if (["xlsx", "xls", "ods", "csv"].includes(ext) || /spreadsheet|excel|opendocument.spreadsheet|text\/csv/.test(mime)) return "sheet";
  if (["pptx", "ppt", "odp"].includes(ext) || /presentation|powerpoint|opendocument.presentation/.test(mime)) return "show";
  return null;
}

export function isNativeImkanOfficeFile(fileName: string, mimeType?: string | null): boolean {
  const ext = fileName.includes(".") ? fileName.split(".").pop()!.toLowerCase() : "";
  return ext === "imkan" || (mimeType ?? "").toLowerCase().startsWith("application/vnd.imkan.");
}

export function officeEditorPath(fileId: string, fileName: string, mimeType?: string | null): string | null {
  const editor = resolveOfficeEditor(fileName, mimeType);
  return editor ? `/office/${editor}/${encodeURIComponent(fileId)}` : null;
}
