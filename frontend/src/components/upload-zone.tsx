"use client";

import { useLocale } from "./locale-provider";
import { filesFromDrop, uploadFileToFolder } from "../lib/api/upload-file";
import type { ChangeEvent, DragEvent } from "react";
import { useCallback, useState } from "react";
import { Toast } from "./toast";
import { createUploadQueueItems, formatUploadSize, updateUploadQueueItem, type UploadQueueItem } from "./upload-queue-logic";

export function UploadZone({ folderId, onUploaded }: { folderId: string | null; onUploaded: () => void }) {
  const { label } = useLocale();
  const [active, setActive] = useState(false);
  const [items, setItems] = useState<UploadQueueItem[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const upload = useCallback(async (item: UploadQueueItem) => {
    setItems((current) => updateUploadQueueItem(current, item.id, { status: "processing", progress: null, error: undefined }));
    try {
      await uploadFileToFolder(folderId, item.file, (progress) => setItems((current) => updateUploadQueueItem(current, item.id, { progress })));
      setItems((current) => updateUploadQueueItem(current, item.id, { status: "completed", progress: 100 }));
      setToast(label("upload.completed"));
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

  function status(item: UploadQueueItem) {
    if (item.status === "processing") return label("upload.processing");
    if (item.status === "completed") return label("upload.completed");
    if (item.status === "failed") return item.error ?? label("upload.failed");
    return label("upload.queued");
  }

  async function onChange(event: ChangeEvent<HTMLInputElement>) { enqueue(Array.from(event.target.files ?? [])); event.target.value = ""; }
  async function onDrop(event: DragEvent<HTMLLabelElement>) { event.preventDefault(); setActive(false); enqueue(filesFromDrop(event.dataTransfer)); }
  function remove(id: string) { setItems((current) => current.filter((item) => item.id !== id)); }
  function retry(item: UploadQueueItem) { void upload(item); }

  return <div className="flex flex-col gap-2">
    <label className={`imkan-focusable inline-flex cursor-pointer items-center gap-2 border-dashed px-3 py-2 text-[length:var(--imkan-font-size-ui)] ${active ? "border-[color:var(--imkan-color-primary)] bg-[color:var(--imkan-color-surface)]" : "border-[color:var(--imkan-color-border)]"}`}
      onDragOver={(event) => { event.preventDefault(); setActive(true); }} onDragLeave={() => setActive(false)} onDrop={(event) => void onDrop(event)}>
      {active ? label("files.drop") : label("files.upload")}
      <input type="file" multiple className="sr-only" aria-label={label("files.upload")} onChange={(event) => void onChange(event)} />
    </label>
    {items.length > 0 ? <section className="imkan-panel min-w-64 p-3" aria-label={label("upload.queue")}>
      <div className="mb-2 flex items-center justify-between gap-2"><h2 className="imkan-heading">{label("upload.queue")}</h2><button type="button" className="imkan-button-secondary" onClick={() => setItems((current) => current.filter((item) => item.status !== "completed"))}>{label("upload.clearCompleted")}</button></div>
      <ul className="flex flex-col gap-2">{items.map((item) => <li key={item.id} className="imkan-divider flex-wrap items-center justify-between gap-2 pb-2"><div className="min-w-0 flex-1"><p className="truncate">{item.file.name}</p><p className="imkan-meta">{formatUploadSize(item.file.size)} · {status(item)}</p>{item.progress !== null ? <progress value={item.progress} max="100" className="mt-1 block inline-size-full" aria-label={`${item.file.name} ${item.progress}%`} /> : null}</div><div className="flex gap-2">{item.status === "failed" ? <button type="button" className="imkan-button-secondary" onClick={() => retry(item)}>{label("upload.retry")}</button> : null}{item.status !== "processing" ? <button type="button" className="imkan-button-secondary" onClick={() => remove(item.id)}>{label("upload.remove")}</button> : null}</div></li>)}</ul>
    </section> : null}
    {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
  </div>;
}
