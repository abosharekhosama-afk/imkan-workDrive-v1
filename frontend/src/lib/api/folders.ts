import { apiRequest } from "./client";
import { emitGlobalToast } from "../global-toast";
import type { FolderContents, FolderDetail, FolderRecord } from "./types";

export type ContentFilters = { type?: string; status?: string; owner?: string; date?: string; dateField?: string; dateFrom?: string; dateTo?: string; query?: string };
function withFilters(path: string, filters?: ContentFilters) {
  if (!filters) return path;
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) q.set(key, value);
  return q.toString() ? `${path}?${q.toString()}` : path;
}
export function listRootContents(filters?: ContentFilters): Promise<FolderContents> {
  return apiRequest<FolderContents>(withFilters("/folders", filters));
}

export function getFolder(id: string, filters?: ContentFilters): Promise<FolderDetail> {
  return apiRequest<FolderDetail>(withFilters(`/folders/${id}`, filters));
}


export type FolderTreeItem = {
  id: string;
  name: string;
  parentId: string | null;
  teamFolderId?: string | null;
  folderType?: string;
  fileCount?: number;
  childCount?: number;
};

export function listFolderTree(): Promise<FolderTreeItem[]> {
  return apiRequest<FolderTreeItem[]>('/folders/tree');
}

export async function createFolder(name: string, parentId?: string, templateId?: string, customFields?: Record<string, unknown>): Promise<FolderRecord> {
  const result = await apiRequest<FolderRecord>("/folders", { method: "POST", body: JSON.stringify({ name, parentId, ...(templateId ? { templateId } : {}), ...(customFields ? { customFields } : {}) }) });
  emitGlobalToast({ message: "Folder created", messageAr: "تم إنشاء المجلد" }); return result;
}

export async function renameFolder(id: string, name: string): Promise<FolderRecord> { const result=await apiRequest<FolderRecord>(`/folders/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }); emitGlobalToast({message:"Folder renamed",messageAr:"تمت إعادة تسمية المجلد"}); return result; }

export async function deleteFolder(id: string): Promise<{ id: string; deleted: boolean }> { const result=await apiRequest(`/folders/${id}`, { method: "DELETE" }); emitGlobalToast({message:"Folder deleted",messageAr:"تم حذف المجلد"}); return result; }

export function moveFolder(id: string, destinationFolderId: string | null, templateId?: string, customFields?: Record<string, unknown>) { return apiRequest(`/folders/${id}/move`, { method: "PATCH", body: JSON.stringify({ destinationFolderId, ...(templateId ? { templateId } : {}), ...(customFields ? { customFields } : {}) }) }); }
export function copyFolder(id: string, destinationFolderId: string | null, templateId?: string, customFields?: Record<string, unknown>) { return apiRequest(`/folders/${id}/copy`, { method: "POST", body: JSON.stringify({ destinationFolderId, ...(templateId ? { templateId } : {}), ...(customFields ? { customFields } : {}) }) }); }
export function permanentDeleteFolder(id: string) { return apiRequest(`/folders/${id}/permanent`, { method: "DELETE" }); }
export function bulkMoveFolders(ids: string[], destinationFolderId: string | null) { return apiRequest(`/folders/bulk/move`, { method: "POST", body: JSON.stringify({ ids, destinationFolderId }) }); }
export function bulkTrashFolders(ids: string[]) { return apiRequest(`/folders/bulk/trash`, { method: "POST", body: JSON.stringify({ ids }) }); }
