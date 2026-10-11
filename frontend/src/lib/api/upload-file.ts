import {
  cleanupExpiredResumableUploads,
  completeResumableUpload,
  completeUpload,
  getResumableUpload,
  requestUpload,
  sha256Hex,
  startResumableUpload,
} from "./files";
import { associateFileDataTemplate } from "./metadata";
import { getAccessToken, getApiBaseUrl } from "./client";
import { filesFromDrop } from "./drop-files";
import { resolveMimeType } from "./mime";
import { emitGlobalToast } from "../global-toast";

export { filesFromDrop };

const RESUMABLE_THRESHOLD = 32 * 1024 * 1024;
const RESUMABLE_PART_SIZE = 16 * 1024 * 1024;
const RESUME_STORAGE_PREFIX = "workdrive_resumable_upload:";
const PART_ATTEMPTS = 5;
const SMALL_ATTEMPTS = 4;

export function isBrowserOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

/** Resolves when the browser reports network is back (or immediately if already online). */
export function waitForOnline(timeoutMs = 0): Promise<void> {
  if (isBrowserOnline()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onOnline = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      window.removeEventListener("online", onOnline);
      if (timer) clearTimeout(timer);
    };
    window.addEventListener("online", onOnline);
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        cleanup();
        reject(new Error("NETWORK_TIMEOUT"));
      }, timeoutMs);
    }
  });
}

export function isNetworkError(error: unknown): boolean {
  if (!error) return false;
  if (typeof error === "object" && error !== null && "name" in error && (error as { name?: string }).name === "NetworkError") return true;
  const msg = error instanceof Error ? error.message : String(error);
  return /network|failed to fetch|upload failed|load failed|NETWORK|offline|ECONN|ETIMEDOUT|abort/i.test(msg);
}

async function sha256HexBytes(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function uploadResumablePart(
  sessionId: string,
  partNumber: number,
  file: File,
  start: number,
  end: number,
  _mimeType: string,
): Promise<void> {
  const chunk = file.slice(start, end);
  const buffer = await chunk.arrayBuffer();
  // Integrity: checksum of the exact bytes we send — server rejects mismatch.
  const checksum = await sha256HexBytes(buffer);
  const token = await getAccessToken();
  if (!token) throw new Error("UNAUTHENTICATED");
  const form = new FormData();
  form.append("chunk", new File([buffer], `part-${partNumber}.bin`, { type: "application/octet-stream" }));

  let lastError: unknown = null;
  for (let attempt = 0; attempt < PART_ATTEMPTS; attempt += 1) {
    if (!isBrowserOnline()) {
      await waitForOnline();
    }
    try {
      const response = await fetch(`${getApiBaseUrl()}/files/upload-sessions/${sessionId}/parts/${partNumber}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "X-Part-SHA256": checksum },
        body: form,
      });
      if (!response.ok) {
        // 409 / already stored part is fine to treat as success if body indicates so
        if (response.status === 409) return;
        throw new Error(`Upload part failed: ${response.status}`);
      }
      return;
    } catch (error) {
      lastError = error;
      if (attempt < PART_ATTEMPTS - 1) {
        if (!isBrowserOnline()) await waitForOnline();
        await delay(Math.min(8000, 400 * 2 ** attempt));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Upload part failed");
}

async function uploadLargeFile(
  folderId: string | null,
  file: File,
  mimeType: string,
  sha256: string,
  customFields: Record<string, unknown> | undefined,
  templateId: string | undefined,
  onProgress?: (progress: number) => void,
): Promise<void> {
  if (typeof window === "undefined") throw new Error("Resumable uploads require a browser");
  const storageKey = `${RESUME_STORAGE_PREFIX}${folderId ?? "root"}:${sha256}`;
  let sessionId: string | null = window.localStorage.getItem(storageKey);
  let state = sessionId ? await getResumableUpload(sessionId).catch(() => null) : null;
  if (state?.status === "COMPLETE") {
    window.localStorage.removeItem(storageKey);
    onProgress?.(100);
    return;
  }

  if (
    !state ||
    state.status !== "PENDING" ||
    state.expected_sha256.toLowerCase() !== sha256.toLowerCase() ||
    Number(state.expected_size) !== file.size
  ) {
    if (sessionId) window.localStorage.removeItem(storageKey);
    sessionId = null;
    state = null;
    await cleanupExpiredResumableUploads().catch(() => undefined);
    const started = await startResumableUpload({
      name: file.name,
      folder_id: folderId,
      size: file.size,
      mime_type: mimeType,
      sha256,
      part_size: RESUMABLE_PART_SIZE,
    });
    sessionId = started.session_id;
    window.localStorage.setItem(storageKey, sessionId);
    state = await getResumableUpload(sessionId);
  }

  const received = new Set(state.received_parts.map((part) => part.part_number));
  let uploadedBytes = state.received_parts.reduce((sum, part) => sum + part.size, 0);
  onProgress?.(Math.min(99, Math.round((uploadedBytes / file.size) * 100)));

  for (let partNumber = 1; partNumber <= state.total_parts; partNumber += 1) {
    if (received.has(partNumber)) continue;
    if (!isBrowserOnline()) await waitForOnline();
    const start = (partNumber - 1) * state.part_size;
    const end = Math.min(file.size, start + state.part_size);
    await uploadResumablePart(sessionId!, partNumber, file, start, end, mimeType);
    uploadedBytes += end - start;
    onProgress?.(Math.min(99, Math.round((uploadedBytes / file.size) * 100)));
  }

  // Final integrity gate: server recomputes/compares expected SHA-256 before marking complete.
  if (templateId) await associateFileDataTemplate(state.file_id, templateId, customFields ?? {});
  await completeResumableUpload(sessionId!);
  window.localStorage.removeItem(storageKey);
  onProgress?.(100);
}

async function uploadSmallFile(
  folderId: string | null,
  file: File,
  mimeType: string,
  sha256: string,
  customFields: Record<string, unknown> | undefined,
  templateId: string | undefined,
  onProgress?: (progress: number) => void,
): Promise<void> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < SMALL_ATTEMPTS; attempt += 1) {
    if (!isBrowserOnline()) await waitForOnline();
    try {
      const request = await requestUpload({
        name: file.name,
        folder_id: folderId,
        size: file.size,
        mime_type: mimeType,
        sha256,
      });
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", request.upload_url);
        xhr.setRequestHeader("Content-Type", mimeType);
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
        };
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`));
        xhr.onerror = () => reject(new Error("NETWORK_UPLOAD_FAILED"));
        xhr.onabort = () => reject(new Error("NETWORK_UPLOAD_FAILED"));
        xhr.send(file);
      });
      if (templateId) await associateFileDataTemplate(request.file_id, templateId, customFields ?? {});
      await completeUpload(request.upload_id);
      onProgress?.(100);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < SMALL_ATTEMPTS - 1) {
        if (!isBrowserOnline() || isNetworkError(error)) {
          await waitForOnline();
          await delay(Math.min(5000, 300 * 2 ** attempt));
          continue;
        }
        // Non-network error — don't keep retrying forever
        if (!isNetworkError(error)) throw error;
        await delay(Math.min(5000, 300 * 2 ** attempt));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Upload failed");
}

export async function uploadFileToFolder(
  folderId: string | null,
  file: File,
  onProgress?: (progress: number) => void,
  customFields?: Record<string, unknown>,
  templateId?: string,
): Promise<void> {
  // Full-file hash anchors integrity for both small and large paths.
  const sha256 = await sha256Hex(file);
  const mimeType = resolveMimeType(file.type || "", file.name);

  if (file.size >= RESUMABLE_THRESHOLD) {
    await uploadLargeFile(folderId, file, mimeType, sha256, customFields, templateId, onProgress);
  } else {
    await uploadSmallFile(folderId, file, mimeType, sha256, customFields, templateId, onProgress);
  }
  emitGlobalToast({ message: "File uploaded", messageAr: "تم رفع الملف" });
}
