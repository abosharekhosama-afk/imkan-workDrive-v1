import { apiRequest } from "./client";

export type UploadRequestResponse = {
  upload_url: string;
  upload_id: string;
  file_id: string;
};

export function requestUpload(input: {
  name: string;
  folder_id: string | null;
  size: number;
  mime_type: string;
  sha256: string;
}): Promise<UploadRequestResponse> {
  return apiRequest<UploadRequestResponse>("/files/upload-request", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function completeUpload(upload_id: string): Promise<{ status: string }> {
  return apiRequest("/files/upload-complete", {
    method: "POST",
    body: JSON.stringify({ upload_id }),
  });
}

export function requestDownload(fileId: string): Promise<{ download_url: string }> {
  return apiRequest(`/files/${fileId}/download`);
}

export function renameFile(id: string, name: string): Promise<{ id: string; name: string }> {
  return apiRequest(`/files/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export function trashFile(id: string): Promise<{ id: string; deleted: boolean }> {
  return apiRequest(`/files/${id}`, { method: "DELETE" });
}

export async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function moveFile(id: string, destinationFolderId: string | null) { return apiRequest(`/files/${id}/move`, { method: "PATCH", body: JSON.stringify({ destinationFolderId }) }); }
export function copyFile(id: string, destinationFolderId: string | null) { return apiRequest(`/files/${id}/copy`, { method: "POST", body: JSON.stringify({ destinationFolderId }) }); }
export function permanentDeleteFile(id: string) { return apiRequest(`/files/${id}/permanent`, { method: "DELETE" }); }
export function bulkMoveFiles(ids: string[], destinationFolderId: string | null) { return apiRequest(`/files/bulk/move`, { method: "POST", body: JSON.stringify({ ids, destinationFolderId }) }); }
export function bulkTrashFiles(ids: string[]) { return apiRequest(`/files/bulk/trash`, { method: "POST", body: JSON.stringify({ ids }) }); }
export function emptyTrash() { return apiRequest(`/files/trash/empty`, { method: "POST" }); }
