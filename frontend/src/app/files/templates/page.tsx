"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SecondarySidebar } from "@/components/layout/secondary-sidebar";
import { Icons } from "@/components/layout/icons";
import { useLocale } from "@/components/locale-provider";
import { TemplatePreview } from "@/components/templates/template-preview";
import { TemplateVariablesPanel } from "@/components/templates/template-variables-panel";
import {
  listTemplates,
  getTemplate,
  getTemplateCapabilities,
  useTemplate,
  listTemplateCategories,
  saveFileAsTemplate,
  createTemplateFromBlank,
  createTemplateCategory,
  updateTemplate,
  updateTemplateFromFile,
  duplicateTemplate,
  deleteTemplate,
  listTemplateVersions,
  useTemplateVersion,
  listTemplateTrash,
  restoreTemplate,
  permanentlyDeleteTemplate,
  type TemplateCategory,
  type TemplateLibrary,
  type TemplateRecord,
  type TemplateType,
} from "@/lib/api/templates";
import { searchNames } from "@/lib/api/search";

const tabs: { id: TemplateLibrary; en: string; ar: string }[] = [
  { id: "PERSONAL", en: "My Templates", ar: "قوالبي" },
  { id: "ORGANIZATION", en: "Organization", ar: "قوالب المؤسسة" },
  { id: "PUBLIC", en: "Public", ar: "العامة" },
];

const typeLabels: Record<TemplateType, [string, string]> = {
  DOCUMENT: ["Document", "مستند"],
  SPREADSHEET: ["Spreadsheet", "جدول بيانات"],
  PRESENTATION: ["Presentation", "عرض تقديمي"],
};

function text(ar: boolean, en: string, value: string) { return ar ? value : en; }

export default function TemplatesPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const router = useRouter();
  const params = useSearchParams();
  const folderId = params.get("folderId");
  const sourceFileId = params.get("sourceFileId");
  const sourceName = params.get("sourceName") || "";
  const [library, setLibrary] = useState<TemplateLibrary>((params.get("library") as TemplateLibrary) || "PERSONAL");
  const [type, setType] = useState<TemplateType | undefined>();
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"name" | "name_desc" | "updated" | "updated_asc">("updated");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [categories, setCategories] = useState<TemplateCategory[]>([]);
  const [libraryCapabilities, setLibraryCapabilities] = useState<import("@/lib/api/templates").TemplateLibraryCapabilities | null>(null);
  const [preview, setPreview] = useState<{ template: TemplateRecord; url: string } | null>(null);
  const [useTarget, setUseTarget] = useState<TemplateRecord | null>(null);
  const [contentEditTarget, setContentEditTarget] = useState<TemplateRecord | null>(null);
  const [variablesTarget, setVariablesTarget] = useState<TemplateRecord | null>(null);
  const [contentEditName, setContentEditName] = useState("");
  const [editTarget, setEditTarget] = useState<TemplateRecord | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategoryId, setEditCategoryId] = useState<string>("");
  const [versionTarget, setVersionTarget] = useState<TemplateRecord | null>(null);
  const [versionFileId, setVersionFileId] = useState("");
  const [versionName, setVersionName] = useState("");
  const [duplicateTarget, setDuplicateTarget] = useState<TemplateRecord | null>(null);
  const [duplicateName, setDuplicateName] = useState("");
  const [versionsTarget, setVersionsTarget] = useState<TemplateRecord | null>(null);
  const [versions, setVersions] = useState<import("@/lib/api/templates").TemplateVersion[]>([]);
  const [trashOpen, setTrashOpen] = useState(false);
  const [trash, setTrash] = useState<import("@/lib/api/templates").TrashedTemplate[]>([]);
  const [versionUse, setVersionUse] = useState<import("@/lib/api/templates").TemplateVersion | null>(null);
  const [versionUseName, setVersionUseName] = useState("");
  const [saveTargetOpen, setSaveTargetOpen] = useState(Boolean(sourceFileId));
  const [saveName, setSaveName] = useState(sourceName.replace(/\.[^.]+$/, "") || "");
  const [saveDescription, setSaveDescription] = useState("");
  const [saveCategoryId, setSaveCategoryId] = useState("");
  const [menuTemplateId, setMenuTemplateId] = useState<string | null>(null);
  const [categoryTarget, setCategoryTarget] = useState<TemplateRecord | null>(null);
  const [categoryTargetId, setCategoryTargetId] = useState("");
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [createTemplateOpen, setCreateTemplateOpen] = useState(false);
  const [createMode, setCreateMode] = useState<"blank" | "existing">("blank");
  const [createType, setCreateType] = useState<TemplateType>("DOCUMENT");
  const [createFileQuery, setCreateFileQuery] = useState("");
  const [createFileResults, setCreateFileResults] = useState<import("@/lib/api/types").FileRecord[]>([]);
  const [createFile, setCreateFile] = useState<import("@/lib/api/types").FileRecord | null>(null);
  const [createTemplateName, setCreateTemplateName] = useState("");
  const [createTemplateDescription, setCreateTemplateDescription] = useState("");
  const [createTemplateCategoryId, setCreateTemplateCategoryId] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const cacheRef = useRef(new Map<string, { items: TemplateRecord[]; categories: TemplateCategory[]; capabilities: import("@/lib/api/templates").TemplateLibraryCapabilities }>());

  const cacheKey = useMemo(() => JSON.stringify({ library, type: type ?? "", categoryId: categoryId ?? "", q: q.trim(), sort }), [library, type, categoryId, q, sort]);

  const load = useCallback(async (force = false) => {
    setError("");
    const cached = cacheRef.current.get(cacheKey);
    if (!force && cached) {
      setTemplates(cached.items);
      setCategories(cached.categories);
      setLibraryCapabilities(cached.capabilities);
      return;
    }
    setLoadingTemplates(true);
    try {
      const [items, cats, capabilities] = await Promise.all([
        listTemplates({ library, type, categoryId, q: q.trim(), sort }),
        listTemplateCategories(library),
        getTemplateCapabilities(library),
      ]);
      cacheRef.current.set(cacheKey, { items, categories: cats, capabilities });
      setTemplates(items);
      setCategories(cats);
      setLibraryCapabilities(capabilities);
    } catch (e) {
      setError(e instanceof Error ? e.message : text(ar, "Unable to load templates.", "تعذر تحميل القوالب."));
    } finally {
      setLoadingTemplates(false);
    }
  }, [library, type, categoryId, q, sort, ar, cacheKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, q.trim() ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [load, q]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuTemplateId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!createTemplateOpen || createFileQuery.trim().length < 2) {
      setCreateFileResults([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const result = await searchNames(createFileQuery.trim(), "files");
        if (!cancelled) setCreateFileResults(result.files || []);
      } catch {
        if (!cancelled) setCreateFileResults([]);
      }
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [createTemplateOpen, createFileQuery]);

  const openCreateTemplate = () => {
    if (library === "PUBLIC") return;
    setCreateTemplateOpen(true);
    setCreateMode("blank");
    setCreateType("DOCUMENT");
    setCreateFile(null);
    setCreateFileQuery("");
    setCreateFileResults([]);
    setCreateTemplateName("");
    setCreateTemplateDescription("");
    setCreateTemplateCategoryId("");
  };

  const createTemplate = async () => {
    if (!createTemplateName.trim()) return;
    setBusy(true); setError(""); setMessage("");
    try {
      if (createMode === "existing") {
        if (!createFile) { setError(text(ar, "Choose a source file first.", "اختر ملفًا مصدرًا أولًا.")); return; }
        await saveFileAsTemplate({ fileId: createFile.id, name: createTemplateName.trim(), description: createTemplateDescription.trim() || undefined, library, categoryId: createTemplateCategoryId || null });
        setCreateTemplateOpen(false);
        setMessage(text(ar, "Template created successfully.", "تم إنشاء القالب بنجاح."));
        cacheRef.current.clear(); await load(true);
      } else {
        const result = await createTemplateFromBlank({ name: createTemplateName.trim(), description: createTemplateDescription.trim() || undefined, type: createType, library, categoryId: createTemplateCategoryId || null });
        setCreateTemplateOpen(false);
        cacheRef.current.clear();
        router.push(`/files/editor/${result.file_id}?templateId=${encodeURIComponent(result.template.id)}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : text(ar, "Unable to create template.", "تعذر إنشاء القالب."));
    } finally { setBusy(false); }
  };

  const empty = useMemo(() => !loadingTemplates && templates.length === 0, [loadingTemplates, templates.length]);

  const previewTemplate = async (template: TemplateRecord) => {
    setError("");
    try {
      const detail = await getTemplate(template.id);
      setPreview({ template, url: detail.preview_url });
    } catch (e) {
      setError(e instanceof Error ? e.message : text(ar, "Preview unavailable.", "المعاينة غير متاحة."));
    }
  };

  const confirmUse = async () => {
    if (!useTarget || !newName.trim()) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const created = await useTemplate(useTarget.id, { name: newName.trim(), folderId });
      setUseTarget(null);
      setNewName("");
      setMessage(text(ar, `Created “${created.name}”.`, `تم إنشاء «${created.name}».`));
      window.setTimeout(() => router.push(`/files?query=${encodeURIComponent(created.name)}`), 350);
    } catch (e) {
      setError(e instanceof Error ? e.message : text(ar, "Unable to create file.", "تعذر إنشاء الملف."));
    } finally { setBusy(false); }
  };

  const openContentEditor = (template: TemplateRecord) => {
    if (!template.permissions.canEdit) return;
    setContentEditTarget(template);
    setContentEditName(`${template.name} - Draft`);
    setMenuTemplateId(null);
  };

  const confirmContentEditor = async () => {
    if (!contentEditTarget || !contentEditName.trim()) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const created = await useTemplate(contentEditTarget.id, { name: contentEditName.trim(), folderId });
      setContentEditTarget(null);
      setContentEditName("");
      const officeRoute = created.office?.type === 'SHEET' ? 'sheet' : created.office?.type === 'SHOW' ? 'show' : 'writer';
      router.push(created.office ? `/office/${officeRoute}/${created.file_id}?templateId=${encodeURIComponent(contentEditTarget.id)}` : `/files/editor/${created.file_id}?templateId=${encodeURIComponent(contentEditTarget.id)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : text(ar, "Unable to start template editor.", "تعذر بدء محرر القالب."));
    } finally { setBusy(false); }
  };

  const saveSourceAsTemplate = async () => {
    if (!sourceFileId || !saveName.trim()) return;
    setBusy(true); setError("");
    try {
      await saveFileAsTemplate({ fileId: sourceFileId, name: saveName.trim(), description: saveDescription.trim() || undefined, library, categoryId: saveCategoryId || null });
      setSaveTargetOpen(false);
      setSaveCategoryId("");
      router.replace("/files/templates");
      setMessage(text(ar, "Template saved successfully.", "تم حفظ القالب بنجاح."));
      cacheRef.current.clear(); await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : text(ar, "Unable to save template.", "تعذر حفظ القالب."));
    } finally { setBusy(false); }
  };

  const openEdit = (template: TemplateRecord) => {
    setEditTarget(template);
    setEditName(template.name);
    setEditDescription(template.description || "");
    setEditCategoryId(template.category?.id || "");
  };

  const saveEdit = async () => {
    if (!editTarget || !editName.trim()) return;
    setBusy(true); setError("");
    try {
      await updateTemplate(editTarget.id, { name: editName.trim(), description: editDescription.trim(), categoryId: editCategoryId || null });
      setEditTarget(null);
      setMessage(text(ar, "Template updated successfully.", "تم تحديث القالب بنجاح."));
      cacheRef.current.clear(); await load(true);
    } catch (e) { setError(e instanceof Error ? e.message : text(ar, "Unable to update template.", "تعذر تحديث القالب.")); }
    finally { setBusy(false); }
  };

  const saveNewVersion = async () => {
    if (!versionTarget || !versionFileId.trim() || !versionName.trim()) return;
    setBusy(true); setError("");
    try {
      await updateTemplateFromFile(versionTarget.id, { fileId: versionFileId.trim(), name: versionName.trim(), description: versionTarget.description || undefined, categoryId: versionTarget.category?.id || null });
      setVersionTarget(null); setVersionFileId(""); setVersionName("");
      setMessage(text(ar, "New template version created.", "تم إنشاء إصدار جديد للقالب."));
      cacheRef.current.clear(); await load(true);
    } catch (e) { setError(e instanceof Error ? e.message : text(ar, "Unable to create version.", "تعذر إنشاء الإصدار.")); }
    finally { setBusy(false); }
  };

  const doDuplicate = async () => {
    if (!duplicateTarget || !duplicateName.trim()) return;
    setBusy(true); setError("");
    try {
      await duplicateTemplate(duplicateTarget.id, duplicateName.trim());
      setDuplicateTarget(null); setDuplicateName("");
      setMessage(text(ar, "Template duplicated.", "تم نسخ القالب."));
      cacheRef.current.clear(); await load(true);
    } catch (e) { setError(e instanceof Error ? e.message : text(ar, "Unable to duplicate template.", "تعذر نسخ القالب.")); }
    finally { setBusy(false); }
  };

  const openVersions = async (template: TemplateRecord) => {
    setBusy(true); setError("");
    try {
      const items = await listTemplateVersions(template.id);
      setVersionsTarget(template); setVersions(items);
    } catch (e) { setError(e instanceof Error ? e.message : text(ar, "Unable to load version history.", "تعذر تحميل سجل الإصدارات.")); }
    finally { setBusy(false); }
  };

  const changeCategory = async () => {
    if (!categoryTarget) return;
    setBusy(true); setError("");
    try {
      await updateTemplate(categoryTarget.id, { categoryId: categoryTargetId || null });
      setCategoryTarget(null); setCategoryTargetId(""); setMenuTemplateId(null);
      setMessage(text(ar, "Category updated.", "تم تحديث التصنيف."));
      cacheRef.current.clear(); await load(true);
    } catch (e) { setError(e instanceof Error ? e.message : text(ar, "Unable to change category.", "تعذر تغيير التصنيف.")); }
    finally { setBusy(false); }
  };

  const doDelete = async (template: TemplateRecord) => {
    if (!template.permissions.canDelete) return;
    if (!window.confirm(text(ar, `Move “${template.name}” to template trash?`, `نقل «${template.name}» إلى سلة القوالب؟`))) return;
    setBusy(true); setError("");
    try {
      await deleteTemplate(template.id);
      setMessage(text(ar, "Template moved to trash.", "تم نقل القالب إلى السلة."));
      cacheRef.current.clear(); await load(true);
    } catch (e) { setError(e instanceof Error ? e.message : text(ar, "Unable to delete template.", "تعذر حذف القالب.")); }
    finally { setBusy(false); }
  };

  const openTrash = async () => {
    setBusy(true); setError("");
    try { setTrash(await listTemplateTrash()); setTrashOpen(true); }
    catch (e) { setError(e instanceof Error ? e.message : text(ar, "Unable to load template trash.", "تعذر تحميل سلة القوالب.")); }
    finally { setBusy(false); }
  };

  const restoreFromTrash = async (id: string) => {
    setBusy(true); setError("");
    try { await restoreTemplate(id); setTrash((items) => items.filter((item) => item.id !== id)); cacheRef.current.clear(); await load(true); setMessage(text(ar, "Template restored.", "تمت استعادة القالب.")); }
    catch (e) { setError(e instanceof Error ? e.message : text(ar, "Unable to restore template.", "تعذر استعادة القالب.")); }
    finally { setBusy(false); }
  };

  const purgeFromTrash = async (id: string) => {
    if (!window.confirm(text(ar, "Permanently delete this template and all its versions?", "حذف هذا القالب وجميع إصداراته نهائيًا؟"))) return;
    setBusy(true); setError("");
    try { await permanentlyDeleteTemplate(id); setTrash((items) => items.filter((item) => item.id !== id)); setMessage(text(ar, "Template permanently deleted.", "تم حذف القالب نهائيًا.")); }
    catch (e) { setError(e instanceof Error ? e.message : text(ar, "Unable to permanently delete template.", "تعذر الحذف النهائي للقالب.")); }
    finally { setBusy(false); }
  };

  const createFromVersion = async () => {
    if (!versionsTarget || !versionUse || !versionUseName.trim()) return;
    setBusy(true); setError("");
    try { const created = await useTemplateVersion(versionsTarget.id, versionUse.id, { name: versionUseName.trim(), folderId }); setVersionUse(null); setVersionsTarget(null); setMessage(text(ar, `Created “${created.name}”.`, `تم إنشاء «${created.name}».`)); router.push(`/files?query=${encodeURIComponent(created.name)}`); }
    catch (e) { setError(e instanceof Error ? e.message : text(ar, "Unable to create file from version.", "تعذر إنشاء الملف من الإصدار.")); }
    finally { setBusy(false); }
  };

  const addCategory = async () => {
    if (!newCategory.trim()) return;
    setBusy(true); setError("");
    try {
      const category = await createTemplateCategory(library, newCategory.trim());
      setCategories((items) => [...items, category].sort((a, b) => a.name.localeCompare(b.name)));
      setNewCategory("");
    } catch (e) {
      setError(e instanceof Error ? e.message : text(ar, "Unable to create category.", "تعذر إنشاء التصنيف."));
    } finally { setBusy(false); }
  };

  const thumbnailSlug = (name: string) => name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  return (
    <div className="flex min-h-0 flex-1">
      <SecondarySidebar section="templates" />
      <main className="min-w-0 flex-1 overflow-y-auto bg-white">
        <div className="border-b border-[color:var(--imkan-color-border)] px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-[18px] font-semibold text-slate-900">{text(ar, "Templates", "القوالب")}</h1>
              <p className="mt-1 text-[12.5px] text-slate-500">{text(ar, "Create files faster with reusable templates.", "أنشئ الملفات بسرعة باستخدام القوالب القابلة لإعادة الاستخدام.")}</p>
            </div>
            <div className="flex items-center gap-2">
            <button type="button" onClick={() => void openTrash()} className="rounded-lg border border-slate-200 px-3 py-2 text-[12.5px] font-medium text-slate-700 hover:bg-slate-50">{text(ar, "Template trash", "سلة القوالب")}</button>
            <button type="button" onClick={() => router.push(folderId ? `/files?folderId=${encodeURIComponent(folderId)}` : "/files")} className="rounded-lg border border-slate-200 px-3 py-2 text-[12.5px] font-medium text-slate-700 hover:bg-slate-50">
              {text(ar, "Back to files", "العودة إلى الملفات")}
            </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-1 border-b border-slate-100">
            {tabs.map((tab) => (
              <button key={tab.id} type="button" onClick={() => { setLibrary(tab.id); setCategoryId(undefined); }} className={`border-b-2 px-3 py-2 text-[12.5px] font-medium ${library === tab.id ? "border-[var(--wd-primary)] text-[var(--wd-primary)]" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
                {ar ? tab.ar : tab.en}
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <div className="flex min-w-[260px] flex-1 items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
              <Icons.search size={15} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={text(ar, "Search templates", "ابحث في القوالب")} className="min-w-0 flex-1 text-[13px] outline-none" />
            </div>
            <select value={type ?? ""} onChange={(e) => setType((e.target.value || undefined) as TemplateType | undefined)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] text-slate-600">
              <option value="">{text(ar, "All types", "كل الأنواع")}</option>
              <option value="DOCUMENT">{text(ar, "Documents", "مستندات")}</option>
              <option value="SPREADSHEET">{text(ar, "Spreadsheets", "جداول")}</option>
              <option value="PRESENTATION">{text(ar, "Presentations", "عروض تقديمية")}</option>
            </select>
            <select value={categoryId ?? ""} onChange={(e) => setCategoryId(e.target.value || undefined)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] text-slate-600">
              <option value="">{text(ar, "All categories", "كل التصنيفات")}</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as "name" | "name_desc" | "updated" | "updated_asc")} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] text-slate-600">
              <option value="updated">{text(ar, "Recently modified", "آخر تعديل")}</option>
              <option value="updated_asc">{text(ar, "Oldest modified", "أقدم تعديل")}</option>
              <option value="name">{text(ar, "Name (A–Z)", "الاسم (أ–ي)")}</option>
              <option value="name_desc">{text(ar, "Name (Z–A)", "الاسم (ي–أ)")}</option>
            </select>
            <div className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5">
              <button type="button" onClick={() => setLayout("grid")} aria-label={text(ar, "Grid view", "عرض شبكي")} className={`rounded-md p-1.5 ${layout === "grid" ? "bg-slate-100 text-slate-800" : "text-slate-400"}`}><Icons.grid size={15} /></button>
              <button type="button" onClick={() => setLayout("list")} aria-label={text(ar, "List view", "عرض قائمة")} className={`rounded-md p-1.5 ${layout === "list" ? "bg-slate-100 text-slate-800" : "text-slate-400"}`}><Icons.list size={15} /></button>
            </div>
          </div>

          {library !== "PUBLIC" && libraryCapabilities?.canCreate && <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={openCreateTemplate} disabled={busy} className="rounded-lg bg-[var(--wd-primary)] px-3 py-2 text-[12px] font-medium text-white shadow-sm disabled:opacity-50">
              + {text(ar, "Create template", "إنشاء قالب")}
            </button>
            {libraryCapabilities?.canCreateCategory && <div className="flex items-center gap-2">
            <input id="new-template-category" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder={text(ar, "New category", "تصنيف جديد")} className="w-44 rounded-lg border border-slate-200 px-3 py-2 text-[12px] outline-none focus:border-[var(--wd-primary)]" />
            <button type="button" disabled={busy || !newCategory.trim()} onClick={() => void addCategory()} className="rounded-lg border border-slate-200 px-3 py-2 text-[12px] font-medium text-slate-700 disabled:opacity-50">+ {text(ar, "Category", "تصنيف")}</button>
            </div>}
          </div>}
          {message && <div className="mt-3 rounded-lg bg-[#EEF4FF] px-3 py-2 text-[12px] text-[#1B66EA]">{message}</div>}
          {error && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</div>}
        </div>

        <div className="flex min-h-0 flex-col lg:flex-row">
            <aside className="w-full shrink-0 border-b border-slate-200 bg-white p-3 lg:w-56 lg:border-b-0 lg:border-r">
              <div className="flex items-center justify-between px-2 pb-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{text(ar, "Category", "التصنيف")}</div>
                {libraryCapabilities?.canCreateCategory && library !== "PUBLIC" && <button type="button" onClick={() => document.getElementById("new-template-category")?.focus()} className="rounded-md px-2 py-1 text-[15px] leading-none text-slate-500 hover:bg-slate-100" aria-label={text(ar, "Create category", "إنشاء تصنيف")}>+</button>}
              </div>
              <button type="button" onClick={() => setCategoryId(undefined)} className={`mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[12px] ${!categoryId ? "bg-[#EEF4FF] font-medium text-[var(--wd-primary)]" : "text-slate-600 hover:bg-slate-50"}`}>
                <span>{text(ar, "All", "الكل")}</span>
              </button>
              {library !== "PUBLIC" && categories.map((c) => (
                <button key={c.id} type="button" onClick={() => setCategoryId(c.id)} className={`mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[12px] ${categoryId === c.id ? "bg-[#EEF4FF] font-medium text-[var(--wd-primary)]" : "text-slate-600 hover:bg-slate-50"}`}>
                  <span className="truncate">{c.name}</span>
                </button>
              ))}
              {library === "PUBLIC" && <p className="px-2 pt-2 text-[11px] leading-5 text-slate-400">{text(ar, "Public templates are not organized with categories.", "القوالب العامة لا تُنظم بواسطة التصنيفات.")}</p>}
            </aside>
            {empty ? (
              <div className="flex min-h-[420px] flex-1 items-center justify-center p-8">
                <div className="max-w-sm text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#f6f8fb] text-slate-400"><Icons.layout size={28} /></div>
                  <h2 className="mt-4 text-[15px] font-semibold text-slate-800">{text(ar, "No templates yet", "لا توجد قوالب بعد")}</h2>
                  <p className="mt-1 text-[12px] leading-5 text-slate-500">{text(ar, library === "PUBLIC" ? "Public templates will appear here when available." : "Save a file as a template to populate this library.", library === "PUBLIC" ? "ستظهر القوالب العامة هنا عند توفرها." : "احفظ ملفًا كقالب لإضافة القوالب إلى هذه المكتبة.")}</p>
                </div>
              </div>
            ) : (
            <div className={layout === "grid" ? "grid flex-1 grid-cols-[repeat(auto-fill,minmax(245px,1fr))] gap-4 p-5" : "flex-1 space-y-2 p-5"}>
            {templates.map((template) => (
              <article key={template.id} className={layout === "grid" ? `relative overflow-visible rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-slate-300 hover:shadow-md ${menuTemplateId === template.id ? "z-[70]" : "z-0"}` : `relative flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-slate-300 ${menuTemplateId === template.id ? "z-[70]" : "z-0"}`}>
                <button type="button" onClick={() => void previewTemplate(template)} className={layout === "grid" ? "group relative flex h-36 w-full items-center justify-center overflow-hidden bg-[#f6f8fb] text-[var(--wd-primary)]" : "group flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#f6f8fb] text-[var(--wd-primary)]"}>
                  {layout === "grid" ? (
                    <img
                      src={`/templates/thumbnails/${thumbnailSlug(template.name)}.png`}
                      alt={template.name}
                      className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]"
                      onError={(event) => { event.currentTarget.style.display = "none"; }}
                    />
                  ) : (template.type === "DOCUMENT" ? <Icons.doc size={28} /> : template.type === "SPREADSHEET" ? <Icons.sheet size={28} /> : <Icons.slide size={28} />)}
                </button>
                <div className={layout === "grid" ? "p-4" : "min-w-0 flex-1"}>
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="truncate text-[14px] font-semibold text-slate-900">{template.name}</h2>
                    <div className="relative flex shrink-0 items-center gap-1">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{text(ar, typeLabels[template.type][0], typeLabels[template.type][1])}</span>
                      <button type="button" aria-label={text(ar, "More actions", "إجراءات إضافية")} onClick={() => setMenuTemplateId(menuTemplateId === template.id ? null : template.id)} className="rounded-md px-1.5 py-0.5 text-slate-500 hover:bg-slate-100">⋯</button>
                      {menuTemplateId === template.id && (
                        <div className={`absolute ${ar ? "left-0" : "right-0"} top-7 z-[100] w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl`}>
                          {template.permissions.canUse && <button type="button" onClick={() => { setUseTarget(template); setNewName(template.name); setMenuTemplateId(null); }} className="block w-full rounded-lg px-3 py-2 text-left text-[11.5px] text-slate-700 hover:bg-slate-50">{text(ar, "Use template", "استخدام القالب")}</button>}
                          {template.permissions.canEdit && <button type="button" onClick={() => openContentEditor(template)} className="block w-full rounded-lg px-3 py-2 text-left text-[11.5px] font-medium text-[var(--wd-primary)] hover:bg-slate-50">{text(ar, "Edit content", "تحرير المحتوى")}</button>}
                          {template.permissions.canEdit && <button type="button" onClick={() => { setMenuTemplateId(null); router.push(`/files/templates/studio/${template.id}`); }} className="block w-full rounded-lg px-3 py-2 text-left text-[11.5px] font-medium text-[var(--wd-primary)] hover:bg-slate-50">{text(ar, "Template Studio", "استوديو القوالب")}</button>}
                          {template.permissions.canEdit && <button type="button" onClick={() => { setMenuTemplateId(null); router.push(`/files/templates/builder/${template.id}`); }} className="block w-full rounded-lg px-3 py-2 text-left text-[11.5px] font-medium text-[var(--wd-primary)] hover:bg-slate-50">{text(ar, "Template Builder", "منشئ القالب")}</button>}
                          {template.permissions.canManage && <button type="button" onClick={() => { setVariablesTarget(template); setMenuTemplateId(null); }} className="block w-full rounded-lg px-3 py-2 text-left text-[11.5px] text-slate-700 hover:bg-slate-50">{text(ar, "Variables", "المتغيرات")}</button>}
                          {template.permissions.canEdit && <button type="button" onClick={() => { openEdit(template); setMenuTemplateId(null); }} className="block w-full rounded-lg px-3 py-2 text-left text-[11.5px] text-slate-700 hover:bg-slate-50">{text(ar, "Edit", "تعديل")}</button>}
                          {template.permissions.canEdit && <button type="button" onClick={() => { setCategoryTarget(template); setCategoryTargetId(template.category?.id || ""); setMenuTemplateId(null); }} className="block w-full rounded-lg px-3 py-2 text-left text-[11.5px] text-slate-700 hover:bg-slate-50">{text(ar, "Change category", "تغيير التصنيف")}</button>}
                          {template.permissions.canDuplicate && <button type="button" onClick={() => { setDuplicateTarget(template); setDuplicateName(`${template.name} Copy`); setMenuTemplateId(null); }} className="block w-full rounded-lg px-3 py-2 text-left text-[11.5px] text-slate-700 hover:bg-slate-50">{text(ar, "Duplicate", "نسخ")}</button>}
                          {template.permissions.canViewVersions && <button type="button" onClick={() => { void openVersions(template); setMenuTemplateId(null); }} className="block w-full rounded-lg px-3 py-2 text-left text-[11.5px] text-slate-700 hover:bg-slate-50">{text(ar, "Version history", "سجل الإصدارات")}</button>}
                          {template.permissions.canDelete && <button type="button" onClick={() => { void doDelete(template); setMenuTemplateId(null); }} className="block w-full rounded-lg px-3 py-2 text-left text-[11.5px] text-red-600 hover:bg-red-50">{text(ar, "Delete", "حذف")}</button>}
                        </div>
                      )}
                    </div>
                  </div>
                  <p className={`${layout === "grid" ? "mt-2 min-h-10" : "mt-1 max-w-2xl truncate"} text-[12px] leading-5 text-slate-500`}>{template.description || text(ar, "Reusable template", "قالب قابل لإعادة الاستخدام")}</p>
                  <div className="mt-2 flex items-center gap-2 text-[10.5px] text-slate-400">
                    {template.category?.name && <span>{template.category.name}</span>}
                    {template.owner?.name && <span>• {template.owner.name}</span>}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => { setUseTarget(template); setNewName(template.name); }} className="flex-1 rounded-lg bg-[var(--wd-primary)] px-3 py-2 text-[12px] font-medium text-white">{text(ar, "Use template", "استخدام القالب")}</button>
                    <button type="button" onClick={() => void previewTemplate(template)} className="rounded-lg border border-slate-200 px-3 py-2 text-[12px] text-slate-600">{text(ar, "Preview", "معاينة")}</button>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[10.5px] text-slate-400">
                    <span>{text(ar, `Version ${template.version}`, `الإصدار ${template.version}`)}</span>
                    <span>{new Date(template.updatedAt).toLocaleDateString(ar ? "ar" : "en")}</span>
                  </div>
                </div>
              </article>
            ))}
            </div>
            )}
          </div>
      </main>

      {preview && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setPreview(null)} />
          <div className="relative flex h-[min(760px,92vh)] w-[min(900px,95vw)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div><h2 className="text-[16px] font-semibold text-slate-900">{preview.template.name}</h2><p className="mt-1 text-[12px] text-slate-500">{preview.template.description}</p></div>
              <button type="button" onClick={() => setPreview(null)} className="rounded-lg px-2 py-1 hover:bg-slate-100">✕</button>
            </div>
            <TemplatePreview url={preview.url} name={preview.template.name} mimeType={preview.template.mimeType} extension={preview.template.extension} className="min-h-0 flex-1" />
          </div>
        </div>
      )}

      {createTemplateOpen && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => !busy && setCreateTemplateOpen(false)} />
          <div className="relative w-[min(620px,94vw)] max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[16px] font-semibold text-slate-900">{text(ar, "Create a template", "إنشاء قالب جديد")}</h2>
                <p className="mt-1 text-[12px] leading-5 text-slate-500">{text(ar, "Create a new office template in the browser, or turn an existing file into a reusable template.", "أنشئ قالب Office جديدًا من داخل المتصفح، أو حوّل ملفًا موجودًا إلى قالب قابل لإعادة الاستخدام.")}</p>
              </div>
              <button type="button" onClick={() => !busy && setCreateTemplateOpen(false)} className="rounded-lg px-2 py-1 hover:bg-slate-100">✕</button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
              <button type="button" onClick={() => setCreateMode("blank")} className={`rounded-lg px-3 py-2 text-[12px] font-medium ${createMode === "blank" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>{text(ar, "Start from scratch", "إنشاء من الصفر")}</button>
              <button type="button" onClick={() => setCreateMode("existing")} className={`rounded-lg px-3 py-2 text-[12px] font-medium ${createMode === "existing" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>{text(ar, "Use existing file", "استخدام ملف موجود")}</button>
            </div>

            {createMode === "blank" && (
              <>
                <div className="mt-5 text-[12px] font-medium text-slate-700">{text(ar, "Choose the office type", "اختر نوع القالب")}</div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(["DOCUMENT", "SPREADSHEET", "PRESENTATION"] as TemplateType[]).map((kind) => (
                    <button key={kind} type="button" onClick={() => setCreateType(kind)} className={`rounded-xl border p-3 text-left transition ${createType === kind ? "border-[var(--wd-primary)] bg-blue-50" : "border-slate-200 hover:border-slate-300"}`}>
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white shadow-sm">{kind === "DOCUMENT" ? <Icons.doc size={20} /> : kind === "SPREADSHEET" ? <Icons.sheet size={20} /> : <Icons.slide size={20} />}</div>
                      <div className="mt-2 text-[12px] font-semibold text-slate-800">{typeLabels[kind][ar ? 1 : 0]}</div>
                      <div className="mt-1 text-[10px] leading-4 text-slate-500">{kind === "DOCUMENT" ? text(ar, "Writer-style document", "مستند بأسلوب Writer") : kind === "SPREADSHEET" ? text(ar, "Sheet-style workbook", "جدول بأسلوب Sheet") : text(ar, "Show-style presentation", "عرض بأسلوب Show")}</div>
                    </button>
                  ))}
                </div>
                <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5 text-[11px] leading-5 text-blue-800">{text(ar, "After Create, IMKAN opens the online Office editor immediately. Design the template, then click Publish to template to save the next template version.", "بعد الإنشاء سيفتح IMKAN محرر Office داخل المتصفح مباشرة. صمّم القالب ثم اضغط «اعتماد التغييرات على القالب» لحفظ الإصدار الجديد.")}</div>
              </>
            )}

            {createMode === "existing" && (
              <>
                <label className="mt-5 block text-[12px] font-medium text-slate-700">{text(ar, "Source file", "الملف المصدر")}</label>
                <input autoFocus value={createFileQuery} onChange={(e) => { setCreateFileQuery(e.target.value); setCreateFile(null); }} placeholder={text(ar, "Search your files...", "ابحث في ملفاتك...")} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[13px] outline-none focus:border-[var(--wd-primary)]" />
                {createFile && <div className="mt-2 flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-3 py-2"><div className="min-w-0"><div className="truncate text-[12px] font-medium text-slate-800">{createFile.name}</div><div className="text-[10px] text-slate-500">{createFile.extension || createFile.mimeType || ""}</div></div><button type="button" onClick={() => setCreateFile(null)} className="text-[11px] text-slate-500">{text(ar, "Change", "تغيير")}</button></div>}
                {!createFile && createFileResults.length > 0 && <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-slate-200">{createFileResults.slice(0, 12).map((file) => <button key={file.id} type="button" onClick={() => { setCreateFile(file); setCreateFileQuery(file.name); setCreateType(file.extension?.toLowerCase() === "xlsx" ? "SPREADSHEET" : file.extension?.toLowerCase() === "pptx" ? "PRESENTATION" : "DOCUMENT"); setCreateTemplateName((current) => current || file.name.replace(/\.[^.]+$/, "")); }} className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-slate-50"><span className="truncate text-[12px] text-slate-700">{file.name}</span><span className="ml-3 shrink-0 text-[10px] text-slate-400">{file.extension || file.fileType || ""}</span></button>)}</div>}
                <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2.5 text-[11px] leading-5 text-amber-800">{text(ar, "The source file is copied into the template. Your original file is not modified.", "سيتم نسخ الملف المصدر إلى القالب ولن يتم تعديل ملفك الأصلي.")}</div>
              </>
            )}

            <label className="mt-4 block text-[12px] font-medium text-slate-700">{text(ar, "Template name", "اسم القالب")}</label>
            <input autoFocus={createMode === "blank"} value={createTemplateName} onChange={(e) => setCreateTemplateName(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[13px] outline-none focus:border-[var(--wd-primary)]" placeholder={text(ar, "e.g. Project Proposal", "مثال: مقترح مشروع")} />
            <label className="mt-4 block text-[12px] font-medium text-slate-700">{text(ar, "Description", "الوصف")}</label>
            <textarea value={createTemplateDescription} onChange={(e) => setCreateTemplateDescription(e.target.value)} rows={2} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[13px] outline-none focus:border-[var(--wd-primary)]" />
            <label className="mt-4 block text-[12px] font-medium text-slate-700">{text(ar, "Category", "التصنيف")}</label>
            <select value={createTemplateCategoryId} onChange={(e) => setCreateTemplateCategoryId(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[13px] outline-none">
              <option value="">{text(ar, "No category", "بدون تصنيف")}</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => !busy && setCreateTemplateOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-[12px] text-slate-600">{text(ar, "Cancel", "إلغاء")}</button>
              <button type="button" disabled={busy || !createTemplateName.trim() || (createMode === "existing" && !createFile)} onClick={() => void createTemplate()} className="rounded-lg bg-[var(--wd-primary)] px-4 py-2 text-[12px] font-medium text-white disabled:opacity-50">{busy ? text(ar, "Creating…", "جارٍ الإنشاء…") : text(ar, "Create and open editor", "إنشاء وفتح المحرر")}</button>
            </div>
          </div>
        </div>
      )}

      {saveTargetOpen && sourceFileId && (
        <div className="fixed inset-0 z-[135] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => !busy && setSaveTargetOpen(false)} />
          <div className="relative w-[min(500px,94vw)] rounded-2xl bg-white p-5 shadow-2xl">
            <h2 className="text-[16px] font-semibold text-slate-900">{text(ar, "Save file as template", "حفظ الملف كقالب")}</h2>
            <p className="mt-1 text-[12px] text-slate-500">{sourceName}</p>
            <label className="mt-5 block text-[12px] font-medium text-slate-700">{text(ar, "Template name", "اسم القالب")}</label>
            <input autoFocus value={saveName} onChange={(e) => setSaveName(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[13px] outline-none focus:border-[var(--wd-primary)]" />
            <label className="mt-4 block text-[12px] font-medium text-slate-700">{text(ar, "Description", "الوصف")}</label>
            <textarea value={saveDescription} onChange={(e) => setSaveDescription(e.target.value)} rows={3} className="mt-2 w-full resize-none rounded-lg border border-slate-200 px-3 py-2.5 text-[13px] outline-none focus:border-[var(--wd-primary)]" />
            <label className="mt-4 block text-[12px] font-medium text-slate-700">{text(ar, "Category", "التصنيف")}</label>
            <select value={saveCategoryId} onChange={(e) => setSaveCategoryId(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[13px]">
              <option value="">{text(ar, "No category", "بدون تصنيف")}</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={busy} onClick={() => { setSaveTargetOpen(false); router.replace("/files/templates"); }} className="rounded-lg border border-slate-200 px-4 py-2 text-[12px] text-slate-600">{text(ar, "Cancel", "إلغاء")}</button>
              <button type="button" disabled={busy || !saveName.trim()} onClick={() => void saveSourceAsTemplate()} className="rounded-lg bg-[var(--wd-primary)] px-4 py-2 text-[12px] font-medium text-white disabled:opacity-50">{busy ? text(ar, "Saving…", "جارٍ الحفظ…") : text(ar, "Save template", "حفظ القالب")}</button>
            </div>
          </div>
        </div>
      )}

      {editTarget && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => !busy && setEditTarget(null)} />
          <div className="relative w-[min(520px,94vw)] rounded-2xl bg-white p-5 shadow-2xl">
            <h2 className="text-[16px] font-semibold text-slate-900">{text(ar, "Edit template", "تعديل القالب")}</h2>
            <label className="mt-5 block text-[12px] font-medium text-slate-700">{text(ar, "Name", "الاسم")}</label>
            <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[13px] outline-none" />
            <label className="mt-4 block text-[12px] font-medium text-slate-700">{text(ar, "Description", "الوصف")}</label>
            <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={3} className="mt-2 w-full resize-none rounded-lg border border-slate-200 px-3 py-2.5 text-[13px] outline-none" />
            <label className="mt-4 block text-[12px] font-medium text-slate-700">{text(ar, "Category", "التصنيف")}</label>
            <select value={editCategoryId} onChange={(e) => setEditCategoryId(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[13px]">
              <option value="">{text(ar, "No category", "بدون تصنيف")}</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setEditTarget(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-[12px] text-slate-600">{text(ar, "Cancel", "إلغاء")}</button><button type="button" disabled={busy || !editName.trim()} onClick={() => void saveEdit()} className="rounded-lg bg-[var(--wd-primary)] px-4 py-2 text-[12px] font-medium text-white">{text(ar, "Save", "حفظ")}</button></div>
          </div>
        </div>
      )}

      {categoryTarget && (
        <div className="fixed inset-0 z-[142] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => !busy && setCategoryTarget(null)} />
          <div className="relative w-[min(460px,94vw)] rounded-2xl bg-white p-5 shadow-2xl">
            <h2 className="text-[16px] font-semibold text-slate-900">{text(ar, "Change category", "تغيير التصنيف")}</h2>
            <p className="mt-1 text-[12px] text-slate-500">{categoryTarget.name}</p>
            <label className="mt-5 block text-[12px] font-medium text-slate-700">{text(ar, "Category", "التصنيف")}</label>
            <select autoFocus value={categoryTargetId} onChange={(e) => setCategoryTargetId(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[13px]">
              <option value="">{text(ar, "All / No category", "الكل / بدون تصنيف")}</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setCategoryTarget(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-[12px] text-slate-600">{text(ar, "Cancel", "إلغاء")}</button><button type="button" disabled={busy} onClick={() => void changeCategory()} className="rounded-lg bg-[var(--wd-primary)] px-4 py-2 text-[12px] font-medium text-white">{text(ar, "Save", "حفظ")}</button></div>
          </div>
        </div>
      )}

      {versionTarget && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => !busy && setVersionTarget(null)} />
          <div className="relative w-[min(520px,94vw)] rounded-2xl bg-white p-5 shadow-2xl">
            <h2 className="text-[16px] font-semibold text-slate-900">{text(ar, "Create new template version", "إنشاء إصدار جديد للقالب")}</h2>
            <p className="mt-1 text-[12px] text-slate-500">{versionTarget.name}</p>
            <label className="mt-5 block text-[12px] font-medium text-slate-700">{text(ar, "Source file ID", "معرّف الملف المصدر")}</label>
            <input autoFocus value={versionFileId} onChange={(e) => setVersionFileId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[13px] outline-none" />
            <p className="mt-2 text-[11px] text-slate-400">{text(ar, "Use the ID of the updated file whose latest version should become the new template version.", "أدخل معرّف الملف المحدّث ليتم اعتماد أحدث إصدار منه كإصدار جديد للقالب.")}</p>
            <div className="mt-4 flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setVersionTarget(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-[12px] text-slate-600">{text(ar, "Cancel", "إلغاء")}</button><button type="button" disabled={busy || !versionFileId.trim()} onClick={() => void saveNewVersion()} className="rounded-lg bg-[var(--wd-primary)] px-4 py-2 text-[12px] font-medium text-white">{text(ar, "Create version", "إنشاء الإصدار")}</button></div>
          </div>
        </div>
      )}

      {duplicateTarget && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => !busy && setDuplicateTarget(null)} />
          <div className="relative w-[min(460px,94vw)] rounded-2xl bg-white p-5 shadow-2xl">
            <h2 className="text-[16px] font-semibold text-slate-900">{text(ar, "Duplicate template", "نسخ القالب")}</h2>
            <label className="mt-5 block text-[12px] font-medium text-slate-700">{text(ar, "New name", "الاسم الجديد")}</label>
            <input autoFocus value={duplicateName} onChange={(e) => setDuplicateName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void doDuplicate(); }} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[13px] outline-none" />
            <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setDuplicateTarget(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-[12px] text-slate-600">{text(ar, "Cancel", "إلغاء")}</button><button type="button" disabled={busy || !duplicateName.trim()} onClick={() => void doDuplicate()} className="rounded-lg bg-[var(--wd-primary)] px-4 py-2 text-[12px] font-medium text-white">{text(ar, "Duplicate", "نسخ")}</button></div>
          </div>
        </div>
      )}

      {versionsTarget && (
        <div className="fixed inset-0 z-[145] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => !busy && setVersionsTarget(null)} />
          <div className="relative w-[min(760px,95vw)] max-h-[88vh] overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="text-[16px] font-semibold text-slate-900">{text(ar, "Version history", "سجل الإصدارات")}</h2><p className="mt-1 text-[12px] text-slate-500">{versionsTarget.name}</p></div><button type="button" onClick={() => setVersionsTarget(null)} className="rounded-lg px-2 py-1 hover:bg-slate-100">✕</button></div>
            <div className="max-h-[70vh] overflow-y-auto p-4">{versions.length === 0 ? <p className="p-6 text-center text-[12px] text-slate-500">{text(ar, "No versions found.", "لا توجد إصدارات.")}</p> : <div className="space-y-2">{versions.map((v) => <div key={v.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-[12px] font-semibold text-slate-600">v{v.version}</div><div className="min-w-0 flex-1"><div className="text-[12.5px] font-semibold text-slate-800">{text(ar, `Version ${v.version}`, `الإصدار ${v.version}`)}</div><div className="mt-1 text-[10.5px] text-slate-500">{v.createdBy.name || v.createdBy.email} · {new Date(v.createdAt).toLocaleString()}</div></div><a href={v.preview_url} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-200 px-3 py-2 text-[11px] text-slate-600">{text(ar, "Preview", "معاينة")}</a><button type="button" onClick={() => { setVersionUse(v); setVersionUseName(versionsTarget.name); }} className="rounded-lg bg-[var(--wd-primary)] px-3 py-2 text-[11px] font-medium text-white">{text(ar, "Use", "استخدام")}</button></div>)}</div>}</div>
          </div>
        </div>
      )}

      {versionUse && versionsTarget && (
        <div className="fixed inset-0 z-[155] flex items-center justify-center p-4"><div className="absolute inset-0 bg-black/30" onClick={() => !busy && setVersionUse(null)} /><div className="relative w-[min(460px,94vw)] rounded-2xl bg-white p-5 shadow-2xl"><h2 className="text-[16px] font-semibold text-slate-900">{text(ar, "Create from version", "إنشاء من الإصدار")}</h2><p className="mt-1 text-[12px] text-slate-500">{versionsTarget.name} · v{versionUse.version}</p><input autoFocus value={versionUseName} onChange={(e) => setVersionUseName(e.target.value)} className="mt-5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[13px] outline-none" /><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setVersionUse(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-[12px]">{text(ar, "Cancel", "إلغاء")}</button><button type="button" disabled={busy || !versionUseName.trim()} onClick={() => void createFromVersion()} className="rounded-lg bg-[var(--wd-primary)] px-4 py-2 text-[12px] font-medium text-white">{text(ar, "Create", "إنشاء")}</button></div></div></div>
      )}

      {trashOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4"><div className="absolute inset-0 bg-black/30" onClick={() => !busy && setTrashOpen(false)} /><div className="relative w-[min(760px,95vw)] max-h-[88vh] overflow-hidden rounded-2xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="text-[16px] font-semibold text-slate-900">{text(ar, "Template trash", "سلة القوالب")}</h2><p className="mt-1 text-[12px] text-slate-500">{text(ar, "Restore templates or permanently delete them.", "استعد القوالب أو احذفها نهائيًا.")}</p></div><button type="button" onClick={() => setTrashOpen(false)} className="rounded-lg px-2 py-1 hover:bg-slate-100">✕</button></div><div className="max-h-[70vh] overflow-y-auto p-4">{trash.length === 0 ? <p className="p-8 text-center text-[12px] text-slate-500">{text(ar, "Template trash is empty.", "سلة القوالب فارغة.")}</p> : <div className="space-y-2">{trash.map((t) => <div key={t.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">{t.type === "DOCUMENT" ? <Icons.doc size={20} /> : t.type === "SPREADSHEET" ? <Icons.sheet size={20} /> : <Icons.slide size={20} />}</div><div className="min-w-0 flex-1"><div className="truncate text-[12.5px] font-semibold text-slate-800">{t.name}</div><div className="mt-1 text-[10.5px] text-slate-500">{t.library} · v{t.version}{t.deletedAt ? ` · ${new Date(t.deletedAt).toLocaleString()}` : ""}</div></div><button type="button" onClick={() => void restoreFromTrash(t.id)} className="rounded-lg border border-slate-200 px-3 py-2 text-[11px]">{text(ar, "Restore", "استعادة")}</button><button type="button" onClick={() => void purgeFromTrash(t.id)} className="rounded-lg border border-red-200 px-3 py-2 text-[11px] text-red-600">{text(ar, "Delete forever", "حذف نهائي")}</button></div>)}</div>}</div></div></div>
      )}

      {variablesTarget && (
        <TemplateVariablesPanel templateId={variablesTarget.id} ar={ar} canManage={variablesTarget.permissions.canManage} onClose={() => setVariablesTarget(null)} />
      )}

      {contentEditTarget && (
        <div className="fixed inset-0 z-[135] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => !busy && setContentEditTarget(null)} />
          <div className="relative w-[min(500px,94vw)] rounded-2xl bg-white p-5 shadow-2xl">
            <h2 className="text-[16px] font-semibold text-slate-900">{text(ar, "Edit template content", "تحرير محتوى القالب")}</h2>
            <p className="mt-2 text-[12px] leading-5 text-slate-500">{text(ar, "A working copy will be created and opened in the online office editor. After editing, use “Publish to template” to create the next template version.", "سيتم إنشاء نسخة عمل من القالب وفتحها في محرر Office داخل المتصفح. بعد تعديل المحتوى اضغط «اعتماد التغييرات على القالب» لإنشاء إصدار جديد للقالب.")}</p>
            <label className="mt-5 block text-[12px] font-medium text-slate-700">{text(ar, "Working file name", "اسم ملف العمل")}</label>
            <input autoFocus value={contentEditName} onChange={(e) => setContentEditName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void confirmContentEditor(); }} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[13px] outline-none focus:border-[var(--wd-primary)]" />
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={busy} onClick={() => setContentEditTarget(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-[12px] text-slate-600">{text(ar, "Cancel", "إلغاء")}</button>
              <button type="button" disabled={busy || !contentEditName.trim()} onClick={() => void confirmContentEditor()} className="rounded-lg bg-[var(--wd-primary)] px-4 py-2 text-[12px] font-medium text-white disabled:opacity-50">{busy ? text(ar, "Opening…", "جارٍ الفتح…") : text(ar, "Open editor", "فتح المحرر")}</button>
            </div>
          </div>
        </div>
      )}

      {useTarget && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => !busy && setUseTarget(null)} />
          <div className="relative w-[min(460px,94vw)] rounded-2xl bg-white p-5 shadow-2xl">
            <h2 className="text-[16px] font-semibold text-slate-900">{text(ar, "Create from template", "إنشاء من القالب")}</h2>
            <p className="mt-1 text-[12px] text-slate-500">{useTarget.name}</p>
            <label className="mt-5 block text-[12px] font-medium text-slate-700">{text(ar, "File name", "اسم الملف")}</label>
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void confirmUse(); }} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[13px] outline-none focus:border-[var(--wd-primary)]" />
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={busy} onClick={() => setUseTarget(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-[12px] text-slate-600">{text(ar, "Cancel", "إلغاء")}</button>
              <button type="button" disabled={busy || !newName.trim()} onClick={() => void confirmUse()} className="rounded-lg bg-[var(--wd-primary)] px-4 py-2 text-[12px] font-medium text-white disabled:opacity-50">{busy ? text(ar, "Creating…", "جارٍ الإنشاء…") : text(ar, "Create", "إنشاء")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
