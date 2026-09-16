"use client";

import { useEffect, useState } from "react";
import { useLocale } from "./locale-provider";
import { Modal } from "./modal";
import { uploadFileToFolder } from "../lib/api/upload-file";

export type NewItemKind = "doc" | "sheet" | "slide" | "link" | "code";

type Detail = { kind: NewItemKind; folderId: string | null };

const DEFINITIONS: Record<NewItemKind, { extension: string; mime: string; defaultName: string; content: string }> = {
  doc: {
    extension: "html",
    mime: "text/html",
    defaultName: "Untitled document",
    content: "<!doctype html><html><head><meta charset=\"utf-8\"><title>Untitled document</title></head><body><h1>Untitled document</h1><p>Start writing here.</p></body></html>",
  },
  sheet: {
    extension: "csv",
    mime: "text/csv",
    defaultName: "Untitled spreadsheet",
    content: "Column A,Column B,Column C\n,,\n,,\n",
  },
  slide: {
    extension: "html",
    mime: "text/html",
    defaultName: "Untitled presentation",
    content: "<!doctype html><html><head><meta charset=\"utf-8\"><title>Untitled presentation</title></head><body><section><h1>Untitled presentation</h1><p>Start your presentation here.</p></section></body></html>",
  },
  code: {
    extension: "js",
    mime: "text/javascript",
    defaultName: "untitled",
    content: "// IMKAN WorkDrive code snippet\n\nfunction main() {\n  return true;\n}\n",
  },
  link: {
    extension: "url",
    mime: "application/internet-shortcut",
    defaultName: "Internet shortcut",
    content: "[InternetShortcut]\nURL=https://\n",
  },
};

const LABELS: Record<NewItemKind, { ar: string; en: string }> = {
  doc: { ar: "مستند جديد", en: "New document" },
  sheet: { ar: "جدول بيانات جديد", en: "New spreadsheet" },
  slide: { ar: "عرض تقديمي جديد", en: "New presentation" },
  link: { ar: "رابط جديد", en: "New link" },
  code: { ar: "مقطع برمجي جديد", en: "New code snippet" },
};

export function NewItemHost() {
  const { locale } = useLocale();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const handler = (event: Event) => {
      const value = (event as CustomEvent<Partial<Detail>>).detail;
      if (!value || !value.kind || !DEFINITIONS[value.kind]) return;
      setDetail({ kind: value.kind, folderId: value.folderId ?? null });
      setName(DEFINITIONS[value.kind].defaultName);
      setError("");
    };
    window.addEventListener("workdrive:new-file", handler);
    return () => window.removeEventListener("workdrive:new-file", handler);
  }, []);

  if (!detail) return null;
  const definition = DEFINITIONS[detail.kind];
  const title = LABELS[detail.kind][locale === "ar" ? "ar" : "en"];

  const create = async () => {
    const cleanName = name.trim();
    if (!cleanName) return;
    setBusy(true);
    setError("");
    try {
      const base = cleanName.replace(/\.(html|csv|js|url)$/i, "");
      const file = new File([definition.content], `${base}.${definition.extension}`, { type: definition.mime });
      await uploadFileToFolder(detail.folderId, file);
      window.dispatchEvent(new Event("workdrive:content-changed"));
      setDetail(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : (locale === "ar" ? "تعذر إنشاء الملف." : "Unable to create the file."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={title} onClose={() => !busy && setDetail(null)}>
      <div className="space-y-3">
        <label className="flex flex-col gap-1 text-[11px] text-slate-500">
          {locale === "ar" ? "اسم الملف" : "File name"}
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void create(); }} className="imkan-input" disabled={busy} />
        </label>
        <p className="text-[11px] leading-5 text-slate-500">
          {locale === "ar" ? "سيتم إنشاء ملف حقيقي في المجلد الحالي باستخدام مسار التخزين الموجود." : "A real file will be created in the current folder using the existing storage upload path."}
        </p>
        {error ? <div className="rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-700">{error}</div> : null}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <button type="button" className="imkan-button-secondary" disabled={busy} onClick={() => setDetail(null)}>{locale === "ar" ? "إلغاء" : "Cancel"}</button>
          <button type="button" className="imkan-button" disabled={busy || !name.trim()} onClick={() => void create()}>{busy ? (locale === "ar" ? "جارٍ الإنشاء…" : "Creating…") : (locale === "ar" ? "إنشاء" : "Create")}</button>
        </div>
      </div>
    </Modal>
  );
}
