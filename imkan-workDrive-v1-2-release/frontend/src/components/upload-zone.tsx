"use client";

import { useLocale } from "./locale-provider";
import { filesFromDrop, uploadFileToFolder } from "../lib/api/upload-file";
import { createFolder } from "../lib/api/folders";
import type { ChangeEvent, DragEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createUploadQueueItems, updateUploadQueueItem, type UploadQueueItem } from "./upload-queue-logic";
import { UploadProgressToast } from "./upload-progress-toast";

export function UploadZone({ folderId, onUploaded, triggerOnly = false }: { folderId: string | null; onUploaded: () => void; triggerOnly?: boolean }) {
  const { label } = useLocale();
  const [active, setActive] = useState(false);
  const [items, setItems] = useState<UploadQueueItem[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  // Top-bar Quick Action button delegates to this zone's real file input so
  // drag-and-drop, progress and toasts all live in one pipeline.
  useEffect(() => {
    const trigger = () => inputRef.current?.click();
    const triggerFolder = () => folderInputRef.current?.click();
    window.addEventListener("workdrive:trigger-upload", trigger);
    window.addEventListener("workdrive:trigger-upload-folder", triggerFolder);
    return () => { window.removeEventListener("workdrive:trigger-upload", trigger); window.removeEventListener("workdrive:trigger-upload-folder", triggerFolder); };
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

  async function onFolderChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    const folderCache = new Map<string, string>();
    const ensureFolder = async (path: string) => {
      if (!path) return folderId;
      const cached = folderCache.get(path); if (cached) return cached;
      const parts = path.split("/").filter(Boolean);
      let parent = folderId; let built = "";
      for (const part of parts) {
        built = built ? `${built}/${part}` : part;
        const existing = folderCache.get(built);
        if (existing) { parent = existing; continue; }
        const created = await createFolder(part, parent ?? undefined);
        folderCache.set(built, created.id); parent = created.id;
      }
      return parent;
    };
    const items = createUploadQueueItems(files);
    setItems((current) => [...current, ...items]);
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      setItems((current) => updateUploadQueueItem(current, item.id, { status: "processing", progress: null }));
      try {
        const relative = (files[i] as File & { webkitRelativePath?: string }).webkitRelativePath ?? files[i].name;
        const parts = relative.split("/").filter(Boolean);
        const target = await ensureFolder(parts.length > 1 ? parts.slice(0, -1).join("/") : "");
        await uploadFileToFolder(target ?? folderId, item.file, (progress) => setItems((current) => updateUploadQueueItem(current, item.id, { progress })));
        setItems((current) => updateUploadQueueItem(current, item.id, { status: "completed", progress: 100 }));
        onUploaded();
      } catch {
        setItems((current) => updateUploadQueueItem(current, item.id, { status: "failed", error: label("upload.failed") }));
      }
    }
  }
  function onChange(event: ChangeEvent<HTMLInputElement>) { enqueue(Array.from(event.target.files ?? [])); event.target.value = ""; }
  function onDrop(event: DragEvent<HTMLLabelElement>) { event.preventDefault(); setActive(false); enqueue(filesFromDrop(event.dataTransfer)); }
  function retry(item: UploadQueueItem) { void upload(item); }
  function remove(id: string) { setItems((current) => current.filter((item) => item.id !== id)); }

  return <div className={triggerOnly ? "sr-only" : "zoho-upload-zone"}>
    {triggerOnly ? null : <label className={`zoho-dashed-drop${active ? " active" : ""}`}
      onDragOver={(event) => { event.preventDefault(); setActive(true); }} onDragLeave={() => setActive(false)} onDrop={(event) => onDrop(event)}>
      {active ? label("files.drop") : label("files.upload")}
      <input ref={inputRef} type="file" multiple className="sr-only" aria-label={label("files.upload")} onChange={(event) => onChange(event)} />
      <input ref={folderInputRef} type="file" multiple {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)} className="sr-only" aria-label={label("menu.uploadFolder")} onChange={(event) => void onFolderChange(event)} />
    </label>}
    {triggerOnly ? <><input ref={inputRef} type="file" multiple className="sr-only" aria-label={label("files.upload")} onChange={(event) => onChange(event)} /><input ref={folderInputRef} type="file" multiple {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)} className="sr-only" aria-label={label("menu.uploadFolder")} onChange={(event) => void onFolderChange(event)} /></> : null}
    <UploadProgressToast
      items={items}
      onClearCompleted={() => setItems((current) => current.filter((item) => item.status !== "completed"))}
      onRetry={retry}
      onRemove={remove}
    />
  </div>;
}
