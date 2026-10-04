import { apiRequest } from "./client";
import { restorePath, trashPath } from "./trash-path";
import type { FileRecord } from "./types";
import { emitGlobalToast } from "../global-toast";

export function listTrash(): Promise<FileRecord[]> {
  return apiRequest<FileRecord[]>(trashPath());
}

export async function restoreFile(fileId: string): Promise<FileRecord> {
  const result = await apiRequest<FileRecord>(restorePath(fileId), { method: "POST" });
  emitGlobalToast({ message: "File restored", messageAr: "تمت استعادة الملف" });
  return result;
}
