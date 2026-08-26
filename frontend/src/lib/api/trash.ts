import { apiRequest } from "./client";
import { restorePath, trashPath } from "./trash-path";
import type { FileRecord } from "./types";

export function listTrash(): Promise<FileRecord[]> {
  return apiRequest<FileRecord[]>(trashPath());
}

export function restoreFile(fileId: string): Promise<FileRecord> {
  return apiRequest<FileRecord>(restorePath(fileId), { method: "POST" });
}
