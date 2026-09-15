import { apiRequest } from "./client.ts";

export type VersionRecord = {
  id: string;
  versionNumber: number;
  size: number;
  mimeType: string;
  sha256Hash: string;
  uploadedById: string;
  uploadedBy?: { email: string; name?: string | null };
  createdAt: string;
};

export type RestoreVersionResponse = {
  fileId: string;
  newVersionNumber: number;
  restoredFromVersion: number;
};

export function getVersionDownloadUrl(fileId: string, versionNumber: number): Promise<{ download_url: string; expires_in_seconds: number; file_id: string; version_number: number }> {
  return apiRequest<{ download_url: string; expires_in_seconds: number; file_id: string; version_number: number }>(`/files/${fileId}/versions/${versionNumber}/download`);
}

export function restoreVersion(fileId: string, versionNumber: number): Promise<RestoreVersionResponse> {
  return apiRequest<RestoreVersionResponse>(`/files/${fileId}/restore-version`, {
    method: "POST",
    body: JSON.stringify({ versionNumber }),
  });
}