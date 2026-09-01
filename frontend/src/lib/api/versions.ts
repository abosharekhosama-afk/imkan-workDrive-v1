import { apiRequest } from "./client.ts";

export type VersionStatus = "ACTIVE" | "SUPERSEDED" | "RESTORED" | "DELETED";

export type VersionUploader = {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
};

export type VersionRecord = {
  id: string;
  versionNumber: number;
  status: VersionStatus;
  size: number;
  mimeType: string;
  sha256Hash: string;
  uploadedById: string;
  uploadedBy?: VersionUploader;
  createdAt: string;
  /** True for the newest version of the file. */
  isCurrent: boolean;
};

export type RestoreVersionResponse = {
  fileId: string;
  newVersionNumber: number;
  restoredFromVersion: number;
};

export function getVersionHistory(fileId: string): Promise<VersionRecord[]> {
  return apiRequest<VersionRecord[]>(`/files/${fileId}/versions`);
}

export function getVersionDownloadUrl(fileId: string, versionNumber: number): Promise<{ download_url: string; expires_in_seconds: number; file_id: string; version_number: number }> {
  return apiRequest<{ download_url: string; expires_in_seconds: number; file_id: string; version_number: number }>(`/files/${fileId}/versions/${versionNumber}/download`);
}

export function getVersionDownloadUrlById(fileId: string, versionId: string): Promise<{ download_url: string; expires_in_seconds: number; file_id: string; version_number: number }> {
  return apiRequest<{ download_url: string; expires_in_seconds: number; file_id: string; version_number: number }>(`/files/${fileId}/versions/${versionId}/download`);
}

export function restoreVersion(fileId: string, versionNumber: number): Promise<RestoreVersionResponse> {
  return apiRequest<RestoreVersionResponse>(`/files/${fileId}/restore-version`, {
    method: "POST",
    body: JSON.stringify({ versionNumber }),
  });
}

/** Restore addressed by the version's id — creates version N+1 with status RESTORED. */
export function restoreVersionById(fileId: string, versionId: string): Promise<RestoreVersionResponse> {
  return apiRequest<RestoreVersionResponse>(`/files/${fileId}/versions/${versionId}/restore`, {
    method: "POST",
  });
}