'use client';

import { useEffect, useState } from 'react';
import { UploadProgressToast } from './upload-progress-toast';
import {
  clearCompletedUploadProgress,
  getUploadProgressItems,
  patchUploadProgressItem,
  setUploadProgressItems,
  subscribeUploadProgress,
} from './upload-progress-store';
import type { UploadQueueItem } from './upload-queue-logic';

/** Mount once (files layout / root) so upload progress is always visible. */
export function GlobalUploadProgressHost() {
  const [items, setItems] = useState<UploadQueueItem[]>([]);

  useEffect(() => subscribeUploadProgress(setItems), []);

  if (!items.length) return null;

  return (
    <UploadProgressToast
      items={items}
      onClearCompleted={clearCompletedUploadProgress}
      onRetry={(item) => {
        patchUploadProgressItem(item.id, { status: 'queued', error: undefined, progress: 0 } as Partial<UploadQueueItem>);
      }}
      onRemove={(id) => {
        setUploadProgressItems(getUploadProgressItems().filter((x) => x.id !== id));
      }}
    />
  );
}
