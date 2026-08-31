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
  // Images
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
  heic: "image/heic",
  heif: "image/heif",
  avif: "image/avif",
  ico: "image/x-icon",
  raw: "image/x-raw",
  cr2: "image/x-canon-cr2",
  nef: "image/x-nikon-nef",
  arw: "image/x-sony-arw",
  psd: "image/vnd.adobe.photoshop",
  ai: "application/illustrator",
  // Documents
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  csv: "text/csv",
  rtf: "application/rtf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  odt: "application/vnd.oasis.opendocument.text",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odp: "application/vnd.oasis.opendocument.presentation",
  // Code & structured text
  json: "application/json",
  xml: "application/xml",
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  js: "application/javascript",
  mjs: "application/javascript",
  cjs: "application/javascript",
  jsx: "text/javascript",
  ts: "application/typescript",
  tsx: "application/typescript",
  py: "text/x-python",
  java: "text/x-java-source",
  kt: "text/x-kotlin",
  kts: "text/x-kotlin",
  swift: "text/x-swift",
  go: "text/x-go",
  rs: "text/x-rust",
  rb: "text/x-ruby",
  php: "application/x-httpd-php",
  c: "text/x-c",
  h: "text/x-c",
  cpp: "text/x-c++src",
  cc: "text/x-c++src",
  hpp: "text/x-c++hdr",
  cs: "text/x-csharp",
  sql: "application/sql",
  sh: "application/x-sh",
  bash: "application/x-sh",
  ps1: "text/x-powershell",
  yml: "application/x-yaml",
  yaml: "application/x-yaml",
  toml: "text/plain",
  ini: "text/plain",
  env: "text/plain",
  log: "text/plain",
  lock: "text/plain",
  gitignore: "text/plain",
  dockerfile: "text/plain",
  makefile: "text/plain",
  // Video
  mp4: "video/mp4",
  m4v: "video/x-m4v",
  webm: "video/webm",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
  mov: "video/quicktime",
  flv: "video/x-flv",
  wmv: "video/x-ms-wmv",
  "3gp": "video/3gpp",
  "3g2": "video/3gpp2",
  mpg: "video/mpeg",
  mpeg: "video/mpeg",
  // Audio
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  aac: "audio/aac",
  flac: "audio/flac",
  m4a: "audio/mp4",
  wma: "audio/x-ms-wma",
  opus: "audio/opus",
  midi: "audio/midi",
  // Archives & compression
  zip: "application/zip",
  rar: "application/vnd.rar",
  "7z": "application/x-7z-compressed",
  tar: "application/x-tar",
  gz: "application/gzip",
  gzip: "application/gzip",
  bz2: "application/x-bzip2",
  xz: "application/x-xz",
  iso: "application/x-iso9660-image",
  dmg: "application/x-apple-diskimage",
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
  const extension = getFileExtension(fileName);
  return Object.prototype.hasOwnProperty.call(EXTENSION_MIME, extension)
    ? EXTENSION_MIME[extension]
    : null;
}

/**
 * Extracts the lowercase extension, including dotfiles (`.env` → "env") which
 * `String.lastIndexOf` alone would miss (index 0).
 */
export function getFileExtension(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? "";
  const index = base.lastIndexOf(".");
  if (index <= 0 || index === base.length - 1) {
    // Dotfile like ".env": the whole name after the leading dot is the ext.
    if (base.startsWith(".") && base.length > 1) return base.slice(1).toLowerCase();
    return "";
  }
  return base.slice(index + 1).toLowerCase();
}

/** Preferred entry point: explicit browser type wins, otherwise sniff by name. */
export function resolveMimeType(mimeType: string | null | undefined, fileName: string): string {
  if (isTrustworthyMimeType(mimeType)) return mimeType!.trim();
  return guessMimeFromName(fileName) ?? OCTET_STREAM;
}
