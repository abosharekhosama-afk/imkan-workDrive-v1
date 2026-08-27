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
