export function fileIconSymbol(kind: "folder" | "file", mimeType?: string | null, name = ""): string {
  if (kind === "folder") return "▰";
  const extension = name.split(".").pop()?.toLowerCase();
  if (mimeType?.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(extension ?? "")) return "▧";
  if (mimeType === "application/pdf" || extension === "pdf") return "▤";
  if (mimeType?.startsWith("text/") || ["txt", "md", "csv"].includes(extension ?? "")) return "▥";
  return "▱";
}
