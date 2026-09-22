import {
  cleanupExpiredResumableUploads,
  completeResumableUpload,
  completeUpload,
  getResumableUpload,
  requestUpload,
  sha256Hex,
  startResumableUpload,
} from "./files";
import { getAccessToken, getApiBaseUrl } from "./client";
import { filesFromDrop } from "./drop-files";
import { resolveMimeType } from "./mime";

export { filesFromDrop };

const RESUMABLE_THRESHOLD = 32 * 1024 * 1024;
const RESUMABLE_PART_SIZE = 16 * 1024 * 1024;
const RESUME_STORAGE_PREFIX = "workdrive_resumable_upload:";

async function sha256HexBytes(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function uploadResumablePart(sessionId: string, partNumber: number, file: File, start: number, end: number, mimeType: string): Promise<void> {
  const chunk = file.slice(start, end);
  const buffer = await chunk.arrayBuffer();
  const checksum = await sha256HexBytes(buffer);
  const token = await getAccessToken();
  if (!token) throw new Error("UNAUTHENTICATED");
  const form = new FormData();
  form.append("chunk", new File([buffer], `part-${partNumber}.bin`, { type: "application/octet-stream" }));
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`${getApiBaseUrl()}/files/upload-sessions/${sessionId}/parts/${partNumber}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "X-Part-SHA256": checksum },
        body: form,
      });
      if (!response.ok) throw new Error(`Upload part failed: ${response.status}`);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Upload part failed");
}

async function uploadLargeFile(folderId: string | null, file: File, mimeType: string, sha256: string, onProgress?: (progress: number) => void): Promise<void> {
  if (typeof window === "undefined") throw new Error("Resumable uploads require a browser");
  const storageKey = `${RESUME_STORAGE_PREFIX}${folderId ?? "root"}:${sha256}`;
  let sessionId: string | null = window.localStorage.getItem(storageKey);
  let state = sessionId ? await getResumableUpload(sessionId).catch(() => null) : null;
  if (state?.status === "COMPLETE") {
    window.localStorage.removeItem(storageKey);
    onProgress?.(100);
    return;
  }

  if (!state || state.status !== "PENDING" || state.expected_sha256.toLowerCase() !== sha256.toLowerCase() || Number(state.expected_size) !== file.size) {
    if (sessionId) window.localStorage.removeItem(storageKey);
    sessionId = null;
    state = null;
    await cleanupExpiredResumableUploads().catch(() => undefined);
    const started = await startResumableUpload({ name: file.name, folder_id: folderId, size: file.size, mime_type: mimeType, sha256, part_size: RESUMABLE_PART_SIZE });
    sessionId = started.session_id;
    window.localStorage.setItem(storageKey, sessionId);
    state = await getResumableUpload(sessionId);
  }

  const received = new Set(state.received_parts.map((part) => part.part_number));
  let uploadedBytes = state.received_parts.reduce((sum, part) => sum + part.size, 0);
  onProgress?.(Math.min(99, Math.round((uploadedBytes / file.size) * 100)));

  for (let partNumber = 1; partNumber <= state.total_parts; partNumber += 1) {
    if (received.has(partNumber)) continue;
    const start = (partNumber - 1) * state.part_size;
    const end = Math.min(file.size, start + state.part_size);
    await uploadResumablePart(sessionId, partNumber, file, start, end, mimeType);
    uploadedBytes += end - start;
    onProgress?.(Math.min(99, Math.round((uploadedBytes / file.size) * 100)));
  }

  await completeResumableUpload(sessionId);
  window.localStorage.removeItem(storageKey);
  onProgress?.(100);
}

export async function uploadFileToFolder(folderId: string | null, file: File, onProgress?: (progress: number) => void): Promise<void> {
  const sha256 = await sha256Hex(file);
  const mimeType = resolveMimeType(file.type || "", file.name);

  if (file.size >= RESUMABLE_THRESHOLD) {
    await uploadLargeFile(folderId, file, mimeType, sha256, onProgress);
    return;
  }

  const request = await requestUpload({ name: file.name, folder_id: folderId, size: file.size, mime_type: mimeType, sha256 });
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", request.upload_url);
    xhr.setRequestHeader("Content-Type", mimeType);
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100)); };
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`));
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.send(file);
  });
  await completeUpload(request.upload_id);
}
