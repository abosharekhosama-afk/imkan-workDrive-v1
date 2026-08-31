import { apiRequest } from "./client.ts";

export type PreviewMimeCategory =
  | "pdf"
  | "image"
  | "video"
  | "audio"
  | "text"
  | "office"
  | "archive"
  | "unsupported";

export type PreviewUrlResponse = {
  preview_url: string;
  expires_in_seconds: number;
  file_id: string;
  file_name: string;
  mime_type: string;
  size: number;
  version_number: number;
  updated_at: string | null;
};

export type FileActivityRecord = {
  id: string;
  action: string;
  user_id: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

/**
 * PVW-04: returns a directly renderable presigned URL (inline disposition)
 * instead of proxying bytes through the app — this avoids the fetch/Blob,
 * redirect and CORS 403 class of preview failures entirely.
 */
export async function getPreviewUrl(fileId: string): Promise<PreviewUrlResponse> {
  return apiRequest<PreviewUrlResponse>(`/files/${fileId}/preview-url`);
}

export async function getVersionPreviewUrl(fileId: string, versionNumber: number): Promise<PreviewUrlResponse> {
  return apiRequest<PreviewUrlResponse>(`/files/${fileId}/versions/${versionNumber}/download`);
}

export async function getFileActivities(fileId: string, limit = 20): Promise<FileActivityRecord[]> {
  return apiRequest<FileActivityRecord[]>(`/files/${fileId}/activities?limit=${limit}`);
}

const IMAGE_MIME_TYPES = new Set([
  "image/tiff", "image/heic", "image/heif", "image/vnd.adobe.photoshop",
  "application/illustrator", "image/x-raw", "image/x-canon-cr2",
  "image/x-nikon-nef", "image/x-sony-arw", "image/x-icon",
]);

const OFFICE_EXTENSIONS = new Set(["doc", "docx", "xls", "xlsx", "ppt", "pptx", "rtf", "odt", "ods", "odp"]);
const OFFICE_MIME_PREFIXES = [
  "application/vnd.openxmlformats-officedocument",
  "application/vnd.ms-",
  "application/vnd.oasis.opendocument",
];
const ARCHIVE_EXTENSIONS = new Set(["zip", "rar", "7z", "tar", "gz", "gzip", "bz2", "xz", "iso", "dmg"]);

export function getFileExtension(fileName: string): string {
  const index = fileName.lastIndexOf(".");
  return index > 0 && index < fileName.length - 1 ? fileName.slice(index + 1).toLowerCase() : "";
}

export function getPreviewMimeCategory(mimeType: string, fileName = ""): PreviewMimeCategory {
  const extension = getFileExtension(fileName);
  if (OFFICE_EXTENSIONS.has(extension)) return "office";
  if (ARCHIVE_EXTENSIONS.has(extension)) return "archive";
  if (!mimeType) return "unsupported";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("image/") || IMAGE_MIME_TYPES.has(mimeType)) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/javascript" ||
    mimeType === "application/typescript" ||
    mimeType === "application/x-sh" ||
    mimeType === "application/sql" ||
    mimeType === "text/markdown" ||
    mimeType === "text/csv" ||
    mimeType === "text/html" ||
    mimeType === "text/css" ||
    mimeType === "application/x-yaml" ||
    mimeType === "application/xml"
  ) return "text";
  if (OFFICE_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix))) return "office";
  if (
    mimeType === "application/zip" ||
    mimeType === "application/x-7z-compressed" ||
    mimeType === "application/gzip" ||
    mimeType === "application/x-tar" ||
    mimeType === "application/x-rar-compressed" ||
    mimeType === "application/vnd.rar" ||
    mimeType === "application/x-bzip2" ||
    mimeType === "application/x-iso9660-image"
  ) return "archive";
  return "unsupported";
}

/** Media the browser can decode natively (used to pick the image/video viewer). */
export function isBrowserRenderableImage(mimeType: string): boolean {
  return (
    mimeType.startsWith("image/") &&
    !mimeType.includes("photoshop") &&
    !mimeType.includes("x-raw") &&
    !mimeType.includes("cr2") &&
    !mimeType.includes("nef") &&
    !mimeType.includes("arw") &&
    mimeType !== "image/tiff" &&
    mimeType !== "image/heic" &&
    mimeType !== "image/heif"
  );
}

const EXTENSION_LANGUAGE: Record<string, string> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  json: "json",
  md: "markdown",
  markdown: "markdown",
  html: "html",
  htm: "html",
  css: "css",
  sql: "sql",
  sh: "bash",
  bash: "bash",
  yml: "yaml",
  yaml: "yaml",
  xml: "xml",
  csv: "csv",
  java: "java",
  kt: "kotlin",
  cpp: "cpp",
  cc: "cpp",
  c: "c",
  go: "go",
  rs: "rust",
  rb: "ruby",
  php: "php",
  cs: "csharp",
  swift: "swift",
  ps1: "powershell",
};

export function getLanguageFromMime(mimeType: string, fileName: string): string {
  const extLanguage = EXTENSION_LANGUAGE[getFileExtension(fileName)];
  if (extLanguage) return extLanguage;
  if (mimeType.startsWith("text/")) return "plaintext";
  return "plaintext";
}