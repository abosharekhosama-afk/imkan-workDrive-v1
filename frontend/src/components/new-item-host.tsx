"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "./locale-provider";
import { Modal } from "./modal";
import { ImkanOptionPicker } from "./imkan-option-picker";
import { uploadFileToFolder } from "../lib/api/upload-file";
import { getUploadDataTemplateMandate, type DataTemplate } from "../lib/api/metadata";
import { createTeamFolder } from "../lib/api/team-folders";
import { createOfficeDocument, type OfficeType } from "../lib/api/office";
import { getTemplate, listTemplates, listTemplateCategories, useTemplate, type TemplateLibrary, type TemplatePreview, type TemplateRecord } from "../lib/api/templates";
import { TemplatePreview as TemplatePreviewPane } from "./templates/template-preview";

export type NewItemKind = "doc" | "sheet" | "slide" | "link" | "code";
type Detail = { kind: NewItemKind; folderId: string | null };

type PickerDetail = { folderId: string | null };

const DEFINITIONS: Record<NewItemKind, { extension: string; mime: string; defaultName: string; content: string }> = {
  doc: { extension: "html", mime: "text/html", defaultName: "Untitled document", content: "<!doctype html><html><head><meta charset=\"utf-8\"><title>Untitled document</title></head><body><h1>Untitled document</h1><p>Start writing here.</p></body></html>" },
  sheet: { extension: "csv", mime: "text/csv", defaultName: "Untitled spreadsheet", content: "Column A,Column B,Column C\n,,\n,,\n" },
  slide: { extension: "html", mime: "text/html", defaultName: "Untitled presentation", content: "<!doctype html><html><head><meta charset=\"utf-8\"><title>Untitled presentation</title></head><body><section><h1>Untitled presentation</h1><p>Start your presentation here.</p></section></body></html>" },
  code: { extension: "js", mime: "text/javascript", defaultName: "untitled", content: "// IMKAN WorkDrive code snippet\n\nfunction main() {\n  return true;\n}\n" },
  link: { extension: "url", mime: "application/internet-shortcut", defaultName: "Internet shortcut", content: "[InternetShortcut]\nURL=https://\n" },
};
const LABELS: Record<NewItemKind, { ar: string; en: string }> = {
  doc: { ar: "مستند جديد", en: "New document" }, sheet: { ar: "جدول بيانات جديد", en: "New spreadsheet" }, slide: { ar: "عرض تقديمي جديد", en: "New presentation" }, link: { ar: "رابط جديد", en: "New link" }, code: { ar: "مقطع برمجي جديد", en: "New code snippet" },
};
const TYPE_LABELS: Record<TemplateRecord["type"], { ar: string; en: string }> = {
  DOCUMENT: { ar: "مستند", en: "Document" }, SPREADSHEET: { ar: "جدول", en: "Spreadsheet" }, PRESENTATION: { ar: "عرض", en: "Presentation" },
};

export function NewItemHost() {
  const { locale } = useLocale();
  const router = useRouter();
  const ar = locale === "ar";
  const [detail, setDetail] = useState<Detail | null>(null);
  const [picker, setPicker] = useState<PickerDetail | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dataTemplateMandate, setDataTemplateMandate] = useState<DataTemplate | null>(null);
  const [dataTemplateFields, setDataTemplateFields] = useState<Record<string, unknown>>({});
  const [dataTemplatePromptOpen, setDataTemplatePromptOpen] = useState(false);
  const [dataTemplatePromptResolver, setDataTemplatePromptResolver] = useState<((value: { templateId: string; customFields: Record<string, unknown> } | null) => void) | null>(null);
  const [teamFolderOpen, setTeamFolderOpen] = useState(false);
  const [teamFolderName, setTeamFolderName] = useState("");
  const [teamFolderBusy, setTeamFolderBusy] = useState(false);
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [templateLibrary, setTemplateLibrary] = useState<TemplateLibrary>("PERSONAL");
  const [templateQuery, setTemplateQuery] = useState("");
  const [templateType, setTemplateType] = useState<TemplateRecord["type"] | "">("");
  const [templateCategoryId, setTemplateCategoryId] = useState("");
  const [templateCategories, setTemplateCategories] = useState<{ id: string; name: string; position: number }[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateRecord | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [pickerLoading, setPickerLoading] = useState(false);
  const [preview, setPreview] = useState<TemplatePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    const onTeamFolder = () => { setTeamFolderOpen(true); setTeamFolderName(""); setError(""); };
    const onTemplatePicker = (event: Event) => {
      const value = (event as CustomEvent<Partial<PickerDetail>>).detail;
      setPicker({ folderId: value?.folderId ?? null }); setTemplateQuery(""); setTemplateType(""); setTemplateCategoryId(""); setSelectedTemplate(null); setPreview(null); setTemplateName(""); setError("");
    };
    const onNewFile = (event: Event) => {
      const value = (event as CustomEvent<{ kind: NewItemKind; folderId: string | null }>).detail;
      if (!value?.kind) return;
      if (value.kind === "doc" || value.kind === "sheet" || value.kind === "slide") {
        void createOfficeItem(value.kind, value.folderId ?? null);
        return;
      }
      setDetail({ kind: value.kind, folderId: value.folderId ?? null });
      setName(DEFINITIONS[value.kind].defaultName);
      setError("");
    };
    window.addEventListener("workdrive:new-team-folder", onTeamFolder);
    window.addEventListener("workdrive:template-picker", onTemplatePicker);
    window.addEventListener("workdrive:new-file", onNewFile);
    return () => {
      window.removeEventListener("workdrive:new-team-folder", onTeamFolder);
      window.removeEventListener("workdrive:template-picker", onTemplatePicker);
      window.removeEventListener("workdrive:new-file", onNewFile);
    };
  }, []);

  const createOfficeItem = async (kind: "doc" | "sheet" | "slide", folderId: string | null) => {
    const typeMap: Record<typeof kind, OfficeType> = { doc: "WRITER", sheet: "SHEET", slide: "SHOW" };
    const kindMap: Record<typeof kind, string> = { doc: "writer", sheet: "sheet", slide: "show" };
    const type = typeMap[kind];
    setBusy(true);
    setError("");
    try {
      const fields = await requestCreateDataTemplate(folderId);
      if (!fields) return;
      const result = await createOfficeDocument({ name: DEFINITIONS[kind].defaultName, type, folderId });
      window.dispatchEvent(new Event("workdrive:content-changed"));
      // Open in Univer (primary editor). IMKAN Office remains on /office/writer|sheet|show.
      router.push(`/office/univer/${encodeURIComponent(result.fileId)}?kind=${kindMap[kind]}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : (ar ? "تعذر إنشاء المستند." : "Unable to create the document."));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!picker) return;
    let cancelled = false;
    setPickerLoading(true);
    listTemplates({ library: templateLibrary, q: templateQuery.trim() || undefined, type: templateType || undefined, categoryId: templateCategoryId || undefined, sort: "updated" })
      .then((items) => { if (!cancelled) setTemplates(items); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : (ar ? "تعذر تحميل القوالب." : "Unable to load templates.")); })
      .finally(() => { if (!cancelled) setPickerLoading(false); });
    return () => { cancelled = true; };
  }, [picker, templateLibrary, templateQuery, templateType, templateCategoryId, ar]);

  useEffect(() => {
    if (!picker) return;
    let cancelled = false;
    listTemplateCategories(templateLibrary)
      .then((items) => { if (!cancelled) setTemplateCategories(items); })
      .catch(() => { if (!cancelled) setTemplateCategories([]); });
    return () => { cancelled = true; };
  }, [picker, templateLibrary]);

  const filteredTemplates = useMemo(() => templates.slice(0, 30), [templates]);

  const createTeamFolderFromToolbar = async () => {
    const cleanName = teamFolderName.trim(); if (!cleanName) return;
    setTeamFolderBusy(true); setError("");
    try { await createTeamFolder(cleanName); window.dispatchEvent(new Event("workdrive:team-folders-changed")); setTeamFolderOpen(false); setTeamFolderName(""); }
    catch (e) { setError(e instanceof Error ? e.message : (ar ? "تعذر إنشاء مجلد الفريق." : "Unable to create the team folder.")); }
    finally { setTeamFolderBusy(false); }
  };

  const requestCreateDataTemplate = async (targetFolderId: string | null) => {
    const result = await getUploadDataTemplateMandate(targetFolderId);
    if (!result.enabled || !result.template) return { templateId: undefined as string | undefined, customFields: undefined as Record<string, unknown> | undefined };
    const values: Record<string, unknown> = {};
    for (const field of (result.template.fields ?? result.template.schema ?? [])) if (field.type === "boolean") values[field.key] = false;
    setDataTemplateMandate(result.template);
    setDataTemplateFields(values);
    setDataTemplatePromptOpen(true);
    return await new Promise<{ templateId: string; customFields: Record<string, unknown> } | null>((resolve) => setDataTemplatePromptResolver(() => resolve));
  };

  const resolveCreateDataTemplate = (value: { templateId: string; customFields: Record<string, unknown> } | null) => {
    const resolve = dataTemplatePromptResolver;
    setDataTemplatePromptResolver(null);
    setDataTemplatePromptOpen(false);
    if (!resolve) return;
    resolve(value);
  };

  const create = async () => {
    if (!detail) return;
    const cleanName = name.trim(); if (!cleanName) return;
    setBusy(true); setError("");
    try {
      const definition = DEFINITIONS[detail.kind];
      const base = cleanName.replace(/\.(html|csv|js|url)$/i, "");
      const fields = await requestCreateDataTemplate(detail.folderId);
      if (!fields) return;
      await uploadFileToFolder(detail.folderId, new File([definition.content], `${base}.${definition.extension}`, { type: definition.mime }), undefined, fields.customFields, fields.templateId);
      window.dispatchEvent(new Event("workdrive:content-changed")); setDetail(null);
    } catch (e) { setError(e instanceof Error ? e.message : (ar ? "تعذر إنشاء الملف." : "Unable to create the file.")); }
    finally { setBusy(false); }
  };

  const selectTemplate = async (template: TemplateRecord) => {
    setSelectedTemplate(template);
    setTemplateName(template.name);
    setPreview(null);
    setPreviewLoading(true);
    setError("");
    try {
      const detail = await getTemplate(template.id);
      setPreview(detail);
    } catch (e) {
      setError(e instanceof Error ? e.message : (ar ? "تعذر تحميل معاينة القالب." : "Unable to load template preview."));
    } finally {
      setPreviewLoading(false);
    }
  };

  const useSelectedTemplate = async () => {
    if (!selectedTemplate || !templateName.trim() || !picker) return;
    setBusy(true); setError("");
    try {
      const fields = await requestCreateDataTemplate(picker.folderId);
      if (!fields) return;
      const created = await useTemplate(selectedTemplate.id, { name: templateName.trim(), folderId: picker.folderId });
      if (fields.templateId) {
        const { associateFileDataTemplate } = await import("../lib/api/metadata");
        await associateFileDataTemplate(created.file_id, fields.templateId, fields.customFields);
      }
      setPicker(null); setSelectedTemplate(null); setPreview(null); setTemplateName(""); window.dispatchEvent(new Event("workdrive:content-changed"));
      window.dispatchEvent(new CustomEvent("workdrive:template-created", { detail: created }));
    } catch (e) { setError(e instanceof Error ? e.message : (ar ? "تعذر إنشاء الملف من القالب." : "Unable to create the file from template.")); }
    finally { setBusy(false); }
  };

  const dataTemplatePrompt = dataTemplatePromptOpen && dataTemplateMandate ? (
    <Modal title={`${ar ? "خصائص Data Template المطلوبة" : "Required Data Template properties"} — ${dataTemplateMandate.name}`} onClose={() => resolveCreateDataTemplate(null)} footer={<><button type="button" className="imkan-button-secondary" onClick={() => resolveCreateDataTemplate(null)}>{ar ? "إلغاء" : "Cancel"}</button><button type="button" className="imkan-button" onClick={() => { const missing=(dataTemplateMandate.fields ?? dataTemplateMandate.schema ?? []).filter((f)=>f.required && (dataTemplateFields[f.key] === undefined || dataTemplateFields[f.key] === null || String(dataTemplateFields[f.key]).trim()==="")); if(missing.length){setError((ar?"الحقول المطلوبة: ":"Required fields: ")+missing.map((f)=>f.label).join(", ")); return;} resolveCreateDataTemplate({templateId:dataTemplateMandate.id,customFields:dataTemplateFields}); }}>{ar ? "متابعة" : "Continue"}</button></>}>
      <div className="space-y-3">
        <p className="text-[11px] text-slate-500">{ar ? "يجب استكمال الخصائص قبل إنشاء العنصر في هذا المجلد." : "Complete these properties before creating the item in this folder."}</p>
        {(dataTemplateMandate.fields ?? dataTemplateMandate.schema ?? []).map((field) => <label key={field.key} className="block text-[11px] text-slate-600">{field.label}{field.required ? " *" : ""}{field.type === "boolean" ? <input type="checkbox" checked={Boolean(dataTemplateFields[field.key])} onChange={(e)=>setDataTemplateFields(v=>({...v,[field.key]:e.target.checked}))} className="ms-2" /> : field.type === "select" || field.type === "radio" ? <ImkanOptionPicker fullWidth allowEmpty emptyLabel="—" value={String(dataTemplateFields[field.key] ?? "")} onChange={(value) => setDataTemplateFields((current) => ({ ...current, [field.key]: value }))} ariaLabel={field.label} options={(field.options ?? []).map((option) => ({ value: option, label: option }))} /> : <input type={field.type === "number" ? "number" : field.type === "email" ? "email" : field.type === "date" ? "date" : field.type === "datetime" ? "datetime-local" : "text"} value={String(dataTemplateFields[field.key] ?? "")} onChange={(e)=>setDataTemplateFields(v=>({...v,[field.key]:field.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value}))} className="mt-1 w-full rounded border border-slate-200 px-2 py-2 text-[11px]" />}</label>)}
      </div>
    </Modal>
  ) : null;

  if (!detail && !teamFolderOpen && !picker && !dataTemplatePromptOpen) return null;
  if (dataTemplatePromptOpen && !detail && !teamFolderOpen && !picker) return dataTemplatePrompt;
  if (!detail && !teamFolderOpen && picker) {
    return <>{dataTemplatePrompt}<Modal title={ar ? "إنشاء من قالب" : "Create from template"} onClose={() => !busy && setPicker(null)}>
      <div className="w-[min(860px,calc(100vw-40px))] max-w-full space-y-3">
        <div className="flex flex-wrap gap-1 border-b border-slate-100">
          {(["PERSONAL", "ORGANIZATION", "PUBLIC"] as TemplateLibrary[]).map((lib) => <button key={lib} type="button" onClick={() => { setTemplateLibrary(lib); setTemplateCategoryId(""); setSelectedTemplate(null); setPreview(null); }} className={`border-b-2 px-3 py-2 text-[12px] font-medium ${templateLibrary === lib ? "border-[var(--wd-primary)] text-[var(--wd-primary)]" : "border-transparent text-slate-500"}`}>{lib === "PERSONAL" ? (ar ? "قوالبي" : "My templates") : lib === "ORGANIZATION" ? (ar ? "المؤسسة" : "Organization") : (ar ? "عام" : "Public")}</button>)}
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">{ar ? `سيتم إنشاء الملف داخل المجلد الحالي${picker.folderId ? " المحدد" : ""}.` : `The new file will be created in the current${picker.folderId ? " selected" : ""} folder.`}</div>
        <div className="flex flex-wrap gap-2">
          <input value={templateQuery} onChange={(e) => setTemplateQuery(e.target.value)} placeholder={ar ? "ابحث في القوالب…" : "Search templates…"} className="imkan-input min-w-[220px] flex-1" />
          <ImkanOptionPicker
            value={templateType}
            onChange={setTemplateType}
            ariaLabel={ar ? "نوع القالب" : "Template type"}
            allowEmpty
            emptyLabel={ar ? "كل الأنواع" : "All types"}
            placeholder={ar ? "كل الأنواع" : "All types"}
            options={([
              { value: "DOCUMENT" as const, label: ar ? "مستند" : "Document" },
              { value: "SPREADSHEET" as const, label: ar ? "جدول" : "Spreadsheet" },
              { value: "PRESENTATION" as const, label: ar ? "عرض" : "Presentation" },
            ])}
          />
          <ImkanOptionPicker
            value={templateCategoryId}
            onChange={setTemplateCategoryId}
            ariaLabel={ar ? "تصنيف القالب" : "Template category"}
            allowEmpty
            emptyLabel={ar ? "كل التصنيفات" : "All categories"}
            placeholder={ar ? "كل التصنيفات" : "All categories"}
            options={templateCategories.map((category) => ({ value: category.id, label: category.name }))}
          />
        </div>
        {selectedTemplate ? <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2">
              <div className="min-w-0"><div className="truncate text-[13px] font-semibold text-slate-900">{selectedTemplate.name}</div><div className="text-[10px] text-slate-500">{ar ? TYPE_LABELS[selectedTemplate.type].ar : TYPE_LABELS[selectedTemplate.type].en} · v{selectedTemplate.version}</div></div>
              <button type="button" onClick={() => { setSelectedTemplate(null); setPreview(null); }} className="text-[11px] text-slate-500 hover:text-slate-800">{ar ? "تغيير" : "Change"}</button>
            </div>
            <div className="h-[300px] bg-white">
              {previewLoading ? <div className="flex h-full items-center justify-center text-[11px] text-slate-500">{ar ? "جارٍ تحميل المعاينة…" : "Loading preview…"}</div> : preview?.preview_url ? <TemplatePreviewPane url={preview.preview_url} name={preview.name} mimeType={preview.mimeType} extension={preview.extension} className="h-full" /> : <div className="flex h-full items-center justify-center px-6 text-center text-[11px] text-slate-500">{ar ? "لا تتوفر معاينة لهذا النوع، لكن يمكنك استخدام القالب لإنشاء نسخة جديدة." : "Preview is unavailable for this type, but you can still use the template to create a new file."}</div>}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="mb-3"><div className="text-[12px] font-semibold text-slate-900">{ar ? "تفاصيل القالب" : "Template details"}</div><div className="mt-1 text-[10px] leading-5 text-slate-500">{preview?.description || (ar ? "سيتم إنشاء نسخة مستقلة من أحدث إصدار في المجلد الحالي." : "A separate copy of the latest version will be created in the current folder.")}</div></div>
            <div className="space-y-2 text-[10px] text-slate-500"><div className="flex justify-between gap-2"><span>{ar ? "النوع" : "Type"}</span><span className="font-medium text-slate-700">{ar ? TYPE_LABELS[selectedTemplate.type].ar : TYPE_LABELS[selectedTemplate.type].en}</span></div><div className="flex justify-between gap-2"><span>{ar ? "الإصدار" : "Version"}</span><span className="font-medium text-slate-700">v{selectedTemplate.version}</span></div><div className="flex justify-between gap-2"><span>{ar ? "الحجم" : "Size"}</span><span className="font-medium text-slate-700">{Math.max(1, Math.round(selectedTemplate.size / 1024))} KB</span></div>{selectedTemplate.category ? <div className="flex justify-between gap-2"><span>{ar ? "التصنيف" : "Category"}</span><span className="font-medium text-slate-700">{selectedTemplate.category.name}</span></div> : null}</div>
            <label className="mt-4 flex flex-col gap-1 text-[10px] font-medium text-slate-600">{ar ? "اسم الملف الجديد" : "New file name"}<input autoFocus value={templateName} onChange={(e) => setTemplateName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void useSelectedTemplate(); }} className="imkan-input" placeholder={ar ? "اسم الملف" : "File name"} disabled={busy} /></label>
            <button type="button" className="imkan-button mt-2 w-full" disabled={busy || !templateName.trim()} onClick={() => void useSelectedTemplate()}>{busy ? (ar ? "جارٍ الإنشاء…" : "Creating…") : (ar ? "استخدام القالب" : "Use template")}</button>
          </div>
        </div> : <div className="max-h-[390px] overflow-y-auto rounded-xl border border-slate-200">
          {pickerLoading ? <div className="p-8 text-center text-[12px] text-slate-500">{ar ? "جارٍ تحميل القوالب…" : "Loading templates…"}</div> : filteredTemplates.length === 0 ? <div className="p-8 text-center text-[12px] text-slate-500">{ar ? "لا توجد قوالب في هذه المكتبة." : "No templates in this library."}</div> : <div className="grid grid-cols-1 gap-2 p-2 sm:grid-cols-2">{filteredTemplates.map((template) => <button key={template.id} type="button" onClick={() => void selectTemplate(template)} className="flex items-center gap-3 rounded-lg border border-transparent p-3 text-left hover:border-slate-200 hover:bg-slate-50"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[var(--wd-primary)]">{template.type === "DOCUMENT" ? "▤" : template.type === "SPREADSHEET" ? "▦" : "▧"}</span><span className="min-w-0 flex-1"><span className="block truncate text-[12.5px] font-semibold text-slate-800">{template.name}</span><span className="block text-[10.5px] text-slate-500">{ar ? TYPE_LABELS[template.type].ar : TYPE_LABELS[template.type].en}{template.category ? ` · ${template.category.name}` : ""}</span></span><span className="text-[10px] text-slate-400">›</span></button>)}</div>}
        </div>}
        {error ? <div className="rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-700">{error}</div> : null}
        <div className="flex justify-end border-t border-slate-100 pt-3"><button type="button" className="imkan-button-secondary" disabled={busy} onClick={() => setPicker(null)}>{ar ? "إلغاء" : "Cancel"}</button></div>
      </div>
    </Modal></>
  }
  if (!detail && teamFolderOpen) return <Modal title={ar ? "إنشاء مجلد فريق" : "New team folder"} onClose={() => !teamFolderBusy && setTeamFolderOpen(false)}><div className="space-y-4"><label className="flex flex-col gap-1.5 text-[11px] font-medium text-slate-600">{ar ? "اسم مجلد الفريق" : "Team folder name"}<input autoFocus value={teamFolderName} onChange={(e) => setTeamFolderName(e.target.value)} className="imkan-input w-full" disabled={teamFolderBusy} /></label>{error ? <div className="rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-700">{error}</div> : null}<div className="flex justify-end gap-2 border-t border-slate-100 pt-3"><button type="button" className="wd-pill wd-pill-record" onClick={() => setTeamFolderOpen(false)}>{ar ? "إلغاء" : "Cancel"}</button><button type="button" className="wd-pill wd-pill-new" disabled={teamFolderBusy || !teamFolderName.trim()} onClick={() => void createTeamFolderFromToolbar()}>{teamFolderBusy ? (ar ? "جارٍ الإنشاء…" : "Creating…") : (ar ? "إنشاء" : "Create")}</button></div></div></Modal>;
  const definition = DEFINITIONS[detail!.kind];
  const title = LABELS[detail!.kind][ar ? "ar" : "en"];
  return <>{dataTemplatePrompt}<Modal title={title} onClose={() => !busy && setDetail(null)}><div className="space-y-3"><label className="flex flex-col gap-1 text-[11px] text-slate-500">{ar ? "اسم الملف" : "File name"}<input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="imkan-input" disabled={busy} /></label><p className="text-[11px] leading-5 text-slate-500">{ar ? "سيتم إنشاء ملف حقيقي في المجلد الحالي." : "A real file will be created in the current folder."}</p>{error ? <div className="rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-700">{error}</div> : null}<div className="flex justify-end gap-2 border-t border-slate-100 pt-3"><button type="button" className="imkan-button-secondary" onClick={() => setDetail(null)}>{ar ? "إلغاء" : "Cancel"}</button><button type="button" className="imkan-button" disabled={busy || !name.trim()} onClick={() => void create()}>{busy ? (ar ? "جارٍ الإنشاء…" : "Creating…") : (ar ? "إنشاء" : "Create")}</button></div></div></Modal></>;
}
