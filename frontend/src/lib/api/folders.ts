import { apiRequest } from "./client";
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

export function createFolder(name: string, parentId?: string): Promise<FolderRecord> {
  return apiRequest<FolderRecord>("/folders", {
    method: "POST",
    body: JSON.stringify({ name, parentId }),
  });
}

export function renameFolder(id: string, name: string): Promise<FolderRecord> {
  return apiRequest<FolderRecord>(`/folders/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export function deleteFolder(id: string): Promise<{ id: string; deleted: boolean }> {
  return apiRequest(`/folders/${id}`, { method: "DELETE" });
}

export function moveFolder(id: string, destinationFolderId: string | null) { return apiRequest(`/folders/${id}/move`, { method: "PATCH", body: JSON.stringify({ destinationFolderId }) }); }
export function copyFolder(id: string, destinationFolderId: string | null) { return apiRequest(`/folders/${id}/copy`, { method: "POST", body: JSON.stringify({ destinationFolderId }) }); }
export function permanentDeleteFolder(id: string) { return apiRequest(`/folders/${id}/permanent`, { method: "DELETE" }); }
export function bulkMoveFolders(ids: string[], destinationFolderId: string | null) { return apiRequest(`/folders/bulk/move`, { method: "POST", body: JSON.stringify({ ids, destinationFolderId }) }); }
export function bulkTrashFolders(ids: string[]) { return apiRequest(`/folders/bulk/trash`, { method: "POST", body: JSON.stringify({ ids }) }); }
