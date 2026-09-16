export type UploadItemStatus = "queued" | "processing" | "uploading" | "completed" | "failed";

export type UploadQueueItem = {
  id: string;
  file: File;
  status: UploadItemStatus;
  progress: number | null;
  error?: string;
};

export function createUploadQueueItems(files: File[], idFactory = () => crypto.randomUUID()): UploadQueueItem[] {
  return files.map((file) => ({ id: idFactory(), file, status: "queued", progress: null }));
}

export function updateUploadQueueItem(
  items: UploadQueueItem[],
  id: string,
  update: Partial<Pick<UploadQueueItem, "status" | "progress" | "error">>,
): UploadQueueItem[] {
  return items.map((item) => item.id === id ? { ...item, ...update } : item);
}

export function formatUploadSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** True when every item has reached a terminal state (completed or failed). */
export function queueSettled(items: UploadQueueItem[]): boolean {
  return items.length > 0 && !items.some((item) => item.status === "queued" || item.status === "processing" || item.status === "uploading");
}

/** Live percentage of bytes transferred across the whole queue (0–100). */
export function queueProgress(items: UploadQueueItem[]): number {
  if (items.length === 0) return 0;
  let sent = 0;
  let total = 0;
  for (const item of items) {
    total += item.file.size;
    if (item.status === "completed") {
      sent += item.file.size;
    } else if (item.progress !== null) {
      sent += Math.round((item.progress / 100) * item.file.size);
    }
  }
  if (total === 0) return items.every((item) => item.status === "completed") ? 100 : 0;
  return Math.min(100, Math.max(0, Math.round((sent / total) * 100)));
}
