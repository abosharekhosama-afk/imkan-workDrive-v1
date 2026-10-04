import { apiRequest } from "./client";
import { emitGlobalToast } from "../global-toast";

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

export async function renameFile(id: string, name: string): Promise<{ id: string; name: string }> { const result=await apiRequest(`/files/${id}`, { method:"PATCH", body:JSON.stringify({name}) }); emitGlobalToast({message:"File renamed",messageAr:"تمت إعادة تسمية الملف"}); return result; }

export type FileControlAction = "check-out" | "check-in" | "mark-final" | "enable-editing" | "reindex";
export async function runFileControl(id: string, action: FileControlAction) { const result=await apiRequest<{ id: string; isFinal: boolean; checkedOutById: string | null; checkedOutAt: string | null; indexedAt: string | null; action: string }>(`/files/${id}/control/${action}`, { method: "POST" }); const labels: Record<FileControlAction,string>={"check-out":"File checked out","check-in":"File checked in","mark-final":"File marked as final","enable-editing":"Editing enabled","reindex":"File reindexed"}; const labelsAr: Record<FileControlAction,string>={"check-out":"تم إجراء الحجز على الملف","check-in":"تم إيداع الملف","mark-final":"تم جعل الملف نهائيًا","enable-editing":"تم تمكين التحرير","reindex":"تمت إعادة فهرسة الملف"}; emitGlobalToast({message:labels[action],messageAr:labelsAr[action]}); return result; }

export async function trashFile(id: string): Promise<{ id: string; deleted: boolean }> { const result=await apiRequest(`/files/${id}`, { method: "DELETE" }); emitGlobalToast({message:"File moved to Trash",messageAr:"تم نقل الملف إلى سلة المهملات"}); return result; }

export type LargeFileRecord = {
  id: string;
  name: string;
  size: number;
  mimeType: string | null;
  extension: string | null;
  updatedAt: string;
  folderId: string | null;
};

/** List the current user's active files larger than 100 MiB. */
export function listLargeFiles(): Promise<LargeFileRecord[]> {
  return apiRequest<LargeFileRecord[]>("/files/manage/large");
}

export async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function moveFile(id: string, destinationFolderId: string | null, templateId?: string, customFields?: Record<string, unknown>) { return apiRequest(`/files/${id}/move`, { method: "PATCH", body: JSON.stringify({ destinationFolderId, ...(templateId ? { templateId } : {}), ...(customFields ? { customFields } : {}) }) }); }
export function copyFile(id: string, destinationFolderId: string | null, templateId?: string, customFields?: Record<string, unknown>) { return apiRequest(`/files/${id}/copy`, { method: "POST", body: JSON.stringify({ destinationFolderId, ...(templateId ? { templateId } : {}), ...(customFields ? { customFields } : {}) }) }); }
export async function permanentDeleteFile(id: string) { const result=await apiRequest(`/files/${id}/permanent`, { method: "DELETE" }); emitGlobalToast({message:"File permanently deleted",messageAr:"تم حذف الملف نهائيًا"}); return result; }
export function bulkMoveFiles(ids: string[], destinationFolderId: string | null) { return apiRequest(`/files/bulk/move`, { method: "POST", body: JSON.stringify({ ids, destinationFolderId }) }); }
export async function bulkTrashFiles(ids: string[]) { const result=await apiRequest(`/files/bulk/trash`, { method: "POST", body: JSON.stringify({ ids }) }); emitGlobalToast({message:`${ids.length} items moved to Trash`,messageAr:`تم نقل ${ids.length} عناصر إلى سلة المهملات`}); return result; }
export async function emptyTrash() { const result=await apiRequest(`/files/trash/empty`, { method: "POST" }); emitGlobalToast({message:"Trash emptied",messageAr:"تم إفراغ سلة المهملات"}); return result; }

export type FileDetailsResponse = {
  id: string; resourceType: 'FILE'; name: string; originalName: string;
  mimeType: string | null; extension: string | null; size: number;
  createdAt: string; updatedAt: string;
  owner: { id: string; name: string | null; email: string };
  location: { id: string; name: string } | null;
  visibility: string; status: string;
  isFinal?: boolean;
  checkedOutById?: string | null;
  checkedOutAt?: string | null;
  indexedAt?: string | null;
  metadata: Record<string, unknown> | null;
  tags: Array<{ id: string; name: string }>;
};

export function getFileDetails(id: string) { return apiRequest<FileDetailsResponse>(`/files/${id}/details`); }


export type FileDlpDecision={fileId:string;labels:Array<{id:string;name:string;color?:string|null;actions:string[];source:string}>;blocked:{download:boolean;copy:boolean;print:boolean;externalShare:boolean};warning:boolean;watermark:{enabled:boolean;text:string|null}};
export const getFileDlp=(id:string)=>apiRequest<FileDlpDecision>(`/files/${id}/dlp`);
