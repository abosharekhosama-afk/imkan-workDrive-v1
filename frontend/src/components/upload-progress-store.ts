import type { UploadQueueItem } from './upload-queue-logic';

type Listener = (items: UploadQueueItem[]) => void;

let items: UploadQueueItem[] = [];
const listeners = new Set<Listener>();

export function getUploadProgressItems(): UploadQueueItem[] {
  return items;
}

export function setUploadProgressItems(next: UploadQueueItem[]) {
  items = next;
  listeners.forEach((l) => l(items));
}

export function patchUploadProgressItem(id: string, patch: Partial<UploadQueueItem>) {
  items = items.map((it) => (it.id === id ? { ...it, ...patch } : it));
  listeners.forEach((l) => l(items));
}

export function clearCompletedUploadProgress() {
  items = items.filter((it) => it.status !== 'completed');
  listeners.forEach((l) => l(items));
}

export function subscribeUploadProgress(listener: Listener): () => void {
  listeners.add(listener);
  listener(items);
  return () => listeners.delete(listener);
}
