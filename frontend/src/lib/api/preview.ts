import { apiRequest } from "./client.ts";

export type PreviewMimeCategory = "pdf" | "image" | "video" | "text" | "unsupported";

export type PreviewFileInfo = {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  versionNumber?: number;
  s3Key?: string;
};

export async function getPreviewUrl(fileId: string): Promise<{ download_url: string; expires_in_seconds: number }> {
  return apiRequest<{ download_url: string; expires_in_seconds: number }>(`/files/${fileId}/download`);
}

export async function getVersionPreviewUrl(fileId: string, versionNumber: number): Promise<{ download_url: string; expires_in_seconds: number }> {
  return apiRequest<{ download_url: string; expires_in_seconds: number }>(`/files/${fileId}/versions/${versionNumber}/download`);
}

export function getPreviewMimeCategory(mimeType: string): PreviewMimeCategory {
  if (!mimeType) return "unsupported";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
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
    mimeType === "text/css"
  ) return "text";
  return "unsupported";
}

export function getLanguageFromMime(mimeType: string, fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const extMap: Record<string, string> = {
    js: "javascript",
    mjs: "javascript",
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
  };
  if (extMap[ext]) return extMap[ext];
  if (mimeType.startsWith("text/")) return "plaintext";
  return "plaintext";
}