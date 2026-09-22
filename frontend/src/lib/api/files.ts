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

export type ResumableUploadStartResponse = {
  session_id: string;
  file_id: string;
  version_id: string;
  part_size: number;
  total_parts: number;
  expires_at: string;
};

export type ResumableUploadState = {
  session_id: string;
  file_id: string;
  version_id: string;
  status: string;
  part_size: number;
  total_parts: number;
  expected_size: string;
  expected_sha256: string;
  expires_at: string;
  received_parts: Array<{ part_number: number; size: number; checksum: string; etag: string | null }>;
};

export function startResumableUpload(input: { name: string; folder_id: string | null; size: number; mime_type: string; sha256: string; part_size?: number }) {
  return apiRequest<ResumableUploadStartResponse>("/files/upload-sessions", { method: "POST", body: JSON.stringify(input) });
}

export function getResumableUpload(sessionId: string) {
  return apiRequest<ResumableUploadState>(`/files/upload-sessions/${sessionId}`);
}

export function completeResumableUpload(sessionId: string) {
  return apiRequest<{ status: string }>(`/files/upload-sessions/${sessionId}/complete`, { method: "POST" });
}

export function abortResumableUpload(sessionId: string) {
  return apiRequest<{ aborted: boolean }>(`/files/upload-sessions/${sessionId}`, { method: "DELETE" });
}

export function cleanupExpiredResumableUploads() {
  return apiRequest<{ cleaned: number }>("/files/upload-sessions/cleanup-expired", { method: "POST" });
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

export type FileDetailsResponse = {
  id: string; resourceType: 'FILE'; name: string; originalName: string;
  mimeType: string | null; extension: string | null; size: number;
  createdAt: string; updatedAt: string;
  owner: { id: string; name: string | null; email: string };
  location: { id: string; name: string } | null;
  visibility: string; status: string;
  metadata: Record<string, unknown> | null;
  tags: Array<{ id: string; name: string }>;
};

export function getFileDetails(id: string) { return apiRequest<FileDetailsResponse>(`/files/${id}/details`); }


export type FileDlpDecision={fileId:string;labels:Array<{id:string;name:string;color?:string|null;actions:string[];source:string}>;blocked:{download:boolean;copy:boolean;print:boolean;externalShare:boolean};warning:boolean;watermark:{enabled:boolean;text:string|null}};
export const getFileDlp=(id:string)=>apiRequest<FileDlpDecision>(`/files/${id}/dlp`);
