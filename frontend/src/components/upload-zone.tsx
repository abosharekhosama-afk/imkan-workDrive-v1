"use client";

import { useLocale } from "./locale-provider";
import { filesFromDrop, uploadFileToFolder } from "../lib/api/upload-file";
import type { ChangeEvent, DragEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createUploadQueueItems, updateUploadQueueItem, type UploadQueueItem } from "./upload-queue-logic";
import { UploadProgressToast } from "./upload-progress-toast";

export function UploadZone({ folderId, onUploaded }: { folderId: string | null; onUploaded: () => void }) {
  const { label } = useLocale();
  const [active, setActive] = useState(false);
  const [items, setItems] = useState<UploadQueueItem[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Top-bar Quick Action button delegates to this zone's real file input so
  // drag-and-drop, progress and toasts all live in one pipeline.
  useEffect(() => {
    const trigger = () => inputRef.current?.click();
    window.addEventListener("workdrive:trigger-upload", trigger);
    return () => window.removeEventListener("workdrive:trigger-upload", trigger);
  }, []);

  const upload = useCallback(async (item: UploadQueueItem) => {
    setItems((current) => updateUploadQueueItem(current, item.id, { status: "processing", progress: null, error: undefined }));
    try {
      await uploadFileToFolder(folderId, item.file, (progress) => setItems((current) => updateUploadQueueItem(current, item.id, { progress })));
      setItems((current) => updateUploadQueueItem(current, item.id, { status: "completed", progress: 100 }));
      onUploaded();
    } catch {
      setItems((current) => updateUploadQueueItem(current, item.id, { status: "failed", error: label("upload.failed") }));
    }
  }, [folderId, label, onUploaded]);

  const enqueue = useCallback((files: File[]) => {
    const added = createUploadQueueItems(files);
    setItems((current) => [...current, ...added]);
    void added.reduce((chain, item) => chain.then(() => upload(item)), Promise.resolve());
  }, [upload]);

  function onChange(event: ChangeEvent<HTMLInputElement>) { enqueue(Array.from(event.target.files ?? [])); event.target.value = ""; }
  function onDrop(event: DragEvent<HTMLLabelElement>) { event.preventDefault(); setActive(false); enqueue(filesFromDrop(event.dataTransfer)); }
  function retry(item: UploadQueueItem) { void upload(item); }
  function remove(id: string) { setItems((current) => current.filter((item) => item.id !== id)); }

  return <div className="zoho-upload-zone">
    <label className={`zoho-dashed-drop${active ? " active" : ""}`}
      onDragOver={(event) => { event.preventDefault(); setActive(true); }} onDragLeave={() => setActive(false)} onDrop={(event) => onDrop(event)}>
      {active ? label("files.drop") : label("files.upload")}
      <input ref={inputRef} type="file" multiple className="sr-only" aria-label={label("files.upload")} onChange={(event) => onChange(event)} />
    </label>
    <UploadProgressToast
      items={items}
      onClearCompleted={() => setItems((current) => current.filter((item) => item.status !== "completed"))}
      onRetry={retry}
      onRemove={remove}
    />
  </div>;
}
