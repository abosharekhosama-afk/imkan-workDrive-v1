"use client";

import { useLocale } from "./locale-provider";
import { filesFromDrop, uploadFileToFolder } from "../lib/api/upload-file";
import { ApiError } from "../lib/api/client";
import { createFolder } from "../lib/api/folders";
import type { ChangeEvent, DragEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createUploadQueueItems, updateUploadQueueItem, type UploadQueueItem } from "./upload-queue-logic";
import { UploadProgressToast } from "./upload-progress-toast";
import { setUploadProgressItems, patchUploadProgressItem } from "./upload-progress-store";
import { Modal } from "./modal";
import { ImkanOptionPicker, toImkanPickerOptions } from "./imkan-option-picker";
import { getUploadDataTemplateMandate, type DataTemplate, type DataTemplateField } from "../lib/api/metadata";

export function UploadZone({ folderId, onUploaded, triggerOnly = false }: { folderId: string | null; onUploaded: () => void; triggerOnly?: boolean }) {
  const { label, locale } = useLocale();
  const ar = locale === "ar";
  const [active, setActive] = useState(false);
  const [items, setItems] = useState<UploadQueueItem[]>([]);
  const itemsRef = useRef<UploadQueueItem[]>([]);
  const publish = useCallback((next: UploadQueueItem[]) => {
    itemsRef.current = next;
    setItems(next);
    setUploadProgressItems(next);
  }, []);
  const patchItem = useCallback((id: string, update: Partial<Pick<UploadQueueItem, "status" | "progress" | "error">>) => {
    const current = itemsRef.current.find((item) => item.id === id);
    if (!current || current.status === "completed") return;
    if (current.status === "failed" && update.status !== "processing" && update.status !== "queued") return;
    publish(updateUploadQueueItem(itemsRef.current, id, update));
  }, [publish]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const mandateResolver = useRef<((value: { templateId: string; customFields: Record<string, unknown> } | null) => void) | null>(null);
  const [templatePrompt, setTemplatePrompt] = useState<{ fileName: string; template: DataTemplate; values: Record<string, unknown> } | null>(null);

  // Top-bar Quick Action button delegates to this zone's real file input so
  // drag-and-drop, progress and toasts all live in one pipeline.
  useEffect(() => {
    const trigger = (event: Event) => {
      const requestedFolderId = (event as CustomEvent<{ folderId?: string | null }>).detail?.folderId;
      // The toolbar is the source of truth for the current folder. Ignore
      // stale events targeted at another folder instead of uploading into the
      // wrong location.
      if (requestedFolderId !== undefined && requestedFolderId !== folderId) return;
      inputRef.current?.click();
    };
    const triggerFolder = (event: Event) => {
      const requestedFolderId = (event as CustomEvent<{ folderId?: string | null }>).detail?.folderId;
      if (requestedFolderId !== undefined && requestedFolderId !== folderId) return;
      folderInputRef.current?.click();
    };
    window.addEventListener("workdrive:trigger-upload", trigger);
    window.addEventListener("workdrive:trigger-upload-folder", triggerFolder);
    return () => { window.removeEventListener("workdrive:trigger-upload", trigger); window.removeEventListener("workdrive:trigger-upload-folder", triggerFolder); };
  }, [folderId]);

  const askForTemplateFields = useCallback(async (fileName: string) => {
    const mandate = await getUploadDataTemplateMandate(folderId);
    if (!mandate.enabled || !mandate.template) return undefined;
    const values: Record<string, unknown> = {};
    for (const field of (mandate.template.fields ?? mandate.template.schema ?? [])) {
      if (field.type === "boolean") values[field.key] = false;
    }
    setTemplatePrompt({ fileName, template: mandate.template, values });
    return await new Promise<{ templateId: string; customFields: Record<string, unknown> } | null>((resolve) => { mandateResolver.current = resolve; });
  }, [folderId]);

  const refreshAfterUpload = useCallback(() => {
    window.dispatchEvent(new Event("workdrive:content-changed"));
    void Promise.resolve(onUploaded()).catch(() => undefined);
  }, [onUploaded]);
  const upload = useCallback(async (item: UploadQueueItem) => {
    patchItem(item.id, { status: "processing", progress: 0, error: undefined });
    let fields: { templateId: string; customFields: Record<string, unknown> } | null | undefined;
    try {
      fields = await askForTemplateFields(item.file.name);
    } catch {
      fields = undefined;
    }
    if (fields === null) {
      publish(itemsRef.current.filter((row) => row.id !== item.id));
      return;
    }
    try {
      await uploadFileToFolder(folderId, item.file, (progress) => patchItem(item.id, { status: "uploading", progress }), fields?.customFields, fields?.templateId);
      patchItem(item.id, { status: "completed", progress: 100, error: undefined });
      refreshAfterUpload();
    } catch (error) {
      const alreadyDone = error instanceof ApiError && (error.status === 409 || /already processed|already complete/i.test(error.message));
      if (alreadyDone) {
        patchItem(item.id, { status: "completed", progress: 100, error: undefined });
        refreshAfterUpload();
      } else {
        patchItem(item.id, { status: "failed", error: label("upload.failed") });
      }
    }
  }, [askForTemplateFields, folderId, label, patchItem, publish, refreshAfterUpload]);

  const enqueue = useCallback((files: File[]) => {
    const added = createUploadQueueItems(files);
    publish([...itemsRef.current, ...added]);
    void added.reduce((chain, item) => chain.then(() => upload(item)), Promise.resolve());
  }, [publish, upload]);

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
    const queued = createUploadQueueItems(files);
    publish([...itemsRef.current, ...queued]);
    for (let i = 0; i < queued.length; i++) {
      const item = queued[i];
      patchItem(item.id, { status: "processing", progress: 0 });
      try {
        const relative = (files[i] as File & { webkitRelativePath?: string }).webkitRelativePath ?? files[i].name;
        const parts = relative.split("/").filter(Boolean);
        const target = await ensureFolder(parts.length > 1 ? parts.slice(0, -1).join("/") : "");
        await uploadFileToFolder(target ?? folderId, item.file, (progress) => patchItem(item.id, { status: "uploading", progress }));
        patchItem(item.id, { status: "completed", progress: 100, error: undefined });
        refreshAfterUpload();
      } catch (error) {
        const alreadyDone = error instanceof ApiError && (error.status === 409 || /already processed|already complete/i.test(error.message));
        if (alreadyDone) {
          patchItem(item.id, { status: "completed", progress: 100, error: undefined });
          refreshAfterUpload();
        } else {
          patchItem(item.id, { status: "failed", error: label("upload.failed") });
        }
      }
    }
  }
  function onChange(event: ChangeEvent<HTMLInputElement>) { enqueue(Array.from(event.target.files ?? [])); event.target.value = ""; }
  function onDrop(event: DragEvent<HTMLLabelElement>) { event.preventDefault(); setActive(false); enqueue(filesFromDrop(event.dataTransfer)); }
  function retry(item: UploadQueueItem) { void upload(item); }
  function remove(id: string) { publish(itemsRef.current.filter((item) => item.id !== id)); }
  useEffect(() => {
    const onRetry = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      const item = itemsRef.current.find((row) => row.id === id);
      if (item) void upload({ ...item, status: "queued", error: undefined, progress: 0 });
    };
    window.addEventListener("workdrive:retry-upload", onRetry);
    return () => window.removeEventListener("workdrive:retry-upload", onRetry);
  }, [upload]);

  const resolveTemplatePrompt = (accepted: boolean) => {
    const resolver = mandateResolver.current;
    mandateResolver.current = null;
    const current = templatePrompt;
    setTemplatePrompt(null);
    if (!resolver || !current) return;
    resolver(accepted ? { templateId: current.template.id, customFields: current.values } : null);
  };

  const setTemplateValue = (field: DataTemplateField, value: unknown) => {
    setTemplatePrompt((current) => current ? { ...current, values: { ...current.values, [field.key]: value } } : current);
  };

  return <>
  {templatePrompt && <Modal title={`${ar ? "خصائص القالب" : "Template properties"} — ${templatePrompt.template.name}`} onClose={() => resolveTemplatePrompt(false)} footer={<><button type="button" className="imkan-btn" onClick={() => resolveTemplatePrompt(false)}>{ar ? "إلغاء" : "Cancel"}</button><button type="button" className="imkan-btn primary" onClick={() => resolveTemplatePrompt(true)}>{ar ? "متابعة الرفع" : "Continue upload"}</button></>}>
    <div className="space-y-3">
      <div className="text-xs text-slate-500">{ar ? `يجب استكمال خصائص ${templatePrompt.fileName} قبل رفعه.` : `Complete the required properties for ${templatePrompt.fileName} before upload.`}</div>
      {(templatePrompt.template.fields ?? templatePrompt.template.schema ?? []).map((field) => {
        const value = templatePrompt.values[field.key];
        return <label key={field.key} className="block">
          <span className="mb-1 block text-xs font-medium">{field.label}{field.required ? " *" : ""}</span>
          {field.type === "multiline" ? <textarea className="imkan-input w-full min-h-20" value={String(value ?? "")} onChange={(e) => setTemplateValue(field, e.target.value)} /> :
           field.type === "boolean" ? <input type="checkbox" checked={value === true} onChange={(e) => setTemplateValue(field, e.target.checked)} /> :
           field.type === "select" || field.type === "radio" ? <ImkanOptionPicker value={String(value ?? "")} onChange={(next) => setTemplateValue(field, next)} options={toImkanPickerOptions(field.options ?? [])} ariaLabel={field.label} fullWidth allowEmpty emptyLabel={ar ? "اختر" : "Select"} placeholder={ar ? "اختر" : "Select"} /> :
           <input className="imkan-input w-full" type={field.type === "number" ? "number" : field.type === "email" ? "email" : field.type === "date" ? "date" : field.type === "datetime" ? "datetime-local" : "text"} value={String(value ?? "")} onChange={(e) => setTemplateValue(field, field.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)} /> }
        </label>;
      })}
    </div>
  </Modal>}
  <div className={triggerOnly ? "sr-only" : "zoho-upload-zone"}>
    {triggerOnly ? null : <label className={`zoho-dashed-drop${active ? " active" : ""}`}
      onDragOver={(event) => { event.preventDefault(); setActive(true); }} onDragLeave={() => setActive(false)} onDrop={(event) => onDrop(event)}>
      {active ? label("files.drop") : label("files.upload")}
      <input ref={inputRef} type="file" multiple className="sr-only" aria-label={label("files.upload")} onChange={(event) => onChange(event)} />
      <input ref={folderInputRef} type="file" multiple {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)} className="sr-only" aria-label={label("menu.uploadFolder")} onChange={(event) => void onFolderChange(event)} />
    </label>}
    {triggerOnly ? <><input ref={inputRef} type="file" multiple className="sr-only" aria-label={label("files.upload")} onChange={(event) => onChange(event)} /><input ref={folderInputRef} type="file" multiple {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)} className="sr-only" aria-label={label("menu.uploadFolder")} onChange={(event) => void onFolderChange(event)} /></> : null}
    {triggerOnly ? null : <UploadProgressToast
      items={items}
      onClearCompleted={() => publish(itemsRef.current.filter((item) => item.status !== "completed"))}
      onRetry={retry}
      onRemove={remove}
    />}
  </div>
  </>;
}
