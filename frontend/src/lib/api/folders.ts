import { apiRequest } from "./client";
import type { FolderContents, FolderDetail, FolderRecord } from "./types";

export function listRootContents(): Promise<FolderContents> {
  return apiRequest<FolderContents>("/folders");
}

export function getFolder(id: string): Promise<FolderDetail> {
  return apiRequest<FolderDetail>(`/folders/${id}`);
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
