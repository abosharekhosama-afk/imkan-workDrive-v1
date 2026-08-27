/**
 * Central MIME-type resolution for uploads and previews.
 *
 * Browsers frequently send an empty `file.type` (and some deliver the useless
 * `application/octet-stream`). Guessing "application/pdf" for every such file
 * broke image/video previews downstream (PVW-01), so resolution order is:
 *
 *   1. a trustworthy explicit mime type (well-formed, not octet-stream)
 *   2. an extension lookup from the file name
 *   3. `application/octet-stream` as last resort
 */

const EXTENSION_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  heic: "image/heic",
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  xml: "application/xml",
  html: "text/html",
  css: "text/css",
  js: "application/javascript",
  mjs: "application/javascript",
  ts: "application/typescript",
  tsx: "application/typescript",
  py: "text/x-python",
  sql: "application/sql",
  sh: "application/x-sh",
  yml: "application/x-yaml",
  yaml: "application/x-yaml",
  zip: "application/zip",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  wav: "audio/wav",
};

const OCTET_STREAM = "application/octet-stream";

export function isTrustworthyMimeType(mimeType: string | null | undefined): boolean {
  if (!mimeType) return false;
  const normalized = mimeType.trim().toLowerCase();
  if (!normalized || !normalized.includes("/")) return false;
  // Generic containers carry no renderable signal.
  return normalized !== OCTET_STREAM && normalized !== "binary/octet-stream" && normalized !== "application/download";
}

export function guessMimeFromName(fileName: string): string | null {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  return Object.prototype.hasOwnProperty.call(EXTENSION_MIME, extension)
    ? EXTENSION_MIME[extension]
    : null;
}

/** Preferred entry point: explicit browser type wins, otherwise sniff by name. */
export function resolveMimeType(mimeType: string | null | undefined, fileName: string): string {
  if (isTrustworthyMimeType(mimeType)) return mimeType!.trim();
  return guessMimeFromName(fileName) ?? OCTET_STREAM;
}
