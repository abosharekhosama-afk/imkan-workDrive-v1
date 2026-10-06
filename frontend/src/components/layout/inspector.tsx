"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "../locale-provider";
import { FileTypeIcon, fileIconKind } from "../file-icon";
import { formatDateLocalized } from "../../lib/localized";
import { listAudit, formatAuditAction, type AuditRecord } from "../../lib/api/audit";
import { listSharedByMe } from "../../lib/api/shared";
import { formatInspectorShareSummary, sharesForResource } from "../../lib/share-resource-logic";
import { useShell, type InspectorTab } from "./shell-context";
import { Icons } from "./icons";
import { openWip } from "../wip-modal";
import { associateFileDataTemplate, associateFolderDataTemplate, disassociateFileDataTemplate, disassociateFolderDataTemplate, listDataTemplates, listFileDataTemplateBindings, listFolderDataTemplateBindings, type DataTemplate, type DataTemplateBinding } from "../../lib/api/metadata";
import { getFileDetails, getFileDlp } from "../../lib/api/files";
import { getFileActivities, type FileActivityRecord } from "../../lib/api/preview";
import { formatBytes } from "../../lib/api/quota";
import { getFolder } from "../../lib/api/folders";
import { ImkanOptionPicker, toImkanPickerOptions } from "../imkan-option-picker";

function descKey(id: string) { return `wd.desc.${id}`; }

export function InspectorDock() {
  const { label } = useLocale();
  const router = useRouter();
  const { inspectorOpen, setInspectorOpen, inspectorTab, setInspectorTab, setMobileInspectorOpen } = useShell();
  const items: Array<{ tab: InspectorTab; icon: keyof typeof Icons; tipKey: "nav.openDetails" | "nav.dataTemplates" | "nav.zia"; textKey: "inspector.details" | "inspector.dataTemplates" | "inspector.zia" }> = [
    { tab: "details", icon: "info", tipKey: "nav.openDetails", textKey: "inspector.details" },
    { tab: "dataTemplates", icon: "layout", tipKey: "nav.dataTemplates", textKey: "inspector.dataTemplates" },
    { tab: "activity", icon: "spark", tipKey: "nav.zia", textKey: "inspector.zia" },
  ];
  return (
    <div className="wd-rail flex shrink-0 flex-col items-center gap-1 border-s border-[color:var(--wd-line)] bg-white" role="toolbar" aria-label={label("inspector.details")}>
      {items.map((i, idx) => {
        const pressed = inspectorOpen && i.tipKey !== "nav.zia" && i.tab === inspectorTab;
        return (
          <button key={`${i.tipKey}-${idx}`} type="button" title={label(i.tipKey)} aria-label={label(i.tipKey)} aria-pressed={pressed}
            onClick={() => {
              if (i.tipKey === "nav.dataTemplates") { setInspectorTab("dataTemplates"); setInspectorOpen(true); setMobileInspectorOpen(true); return; }
              if (i.tipKey === "nav.zia") { openWip(label("zia.comingSoon")); return; }
              setInspectorTab(i.tab); setInspectorOpen(true); setMobileInspectorOpen(true);
            }}
            className={`flex min-h-[65px] w-full flex-col items-center justify-center gap-1 rounded-[16px] px-[7px] py-[7px] text-[13px] transition-colors duration-150 ease-in-out ${pressed ? "bg-[#F0F4FF] text-[#254993]" : "text-[#212121] hover:bg-[#F3F5F7]"}`}>
            {(() => { const I = Icons[i.icon]; return <I size={18} />; })()}
            <span className="text-center text-[11px] leading-4">{label(i.textKey)}</span>
          </button>
        );
      })}
    </div>
  );
}
export function InspectorPanel({ onVersionHistory }: { onVersionHistory?: (fileId: string) => void }) {
  const { label, locale } = useLocale();
  const { inspectorOpen, setInspectorOpen, inspectorTab, setInspectorTab, selected, mobileInspectorOpen, setMobileInspectorOpen } = useShell();
  const [logs, setLogs] = useState<AuditRecord[]>([]);
  const [dataTemplates, setDataTemplates] = useState<DataTemplate[]>([]);
  const [bindings, setBindings] = useState<DataTemplateBinding[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({});
  const [templateBusy, setTemplateBusy] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [desc, setDesc] = useState("");
  const [descDraft, setDescDraft] = useState("");
  const [resourceShares, setResourceShares] = useState<Awaited<ReturnType<typeof listSharedByMe>>>([]);
  const [facts, setFacts] = useState<{ id: string; location: string | null; labels: string[]; createdAt: string | null; updatedAt: string | null; size: number | null; mimeType: string | null; ownerName: string | null; containsFolders?: number | null; containsFiles?: number | null; description?: string | null } | null>(null);
  const [fileActivities, setFileActivities] = useState<FileActivityRecord[]>([]);
  const [primarySlot, setPrimarySlot] = useState<"details" | "dataTemplates">(inspectorTab === "dataTemplates" ? "dataTemplates" : "details");
  const resourceId = selected ? (selected.kind === "FILE" ? selected.file.id : selected.folder.id) : null;
  const resourceType = selected ? (selected.kind === "FILE" ? "FILE" as const : "FOLDER" as const) : null;
  useEffect(() => {
    if (!inspectorOpen || inspectorTab !== "activity") return;
    listAudit().then(setLogs).catch(() => setLogs([]));
  }, [inspectorOpen, inspectorTab]);
  useEffect(() => {
    if (!inspectorOpen || inspectorTab !== "dataTemplates" || !selected) return;
    const id = selected.kind === "FILE" ? selected.file.id : selected.folder.id;
    Promise.all([listDataTemplates(false), selected.kind === "FILE" ? listFileDataTemplateBindings(id) : listFolderDataTemplateBindings(id)])
      .then(([templates, rows]) => { setDataTemplates(templates); setBindings(rows); setTemplateId(""); setFieldValues({}); })
      .catch(() => { setDataTemplates([]); setBindings([]); });
  }, [inspectorOpen, inspectorTab, selected]);
  useEffect(() => {
    if (!resourceId || !resourceType) { setResourceShares([]); return; }
    listSharedByMe()
      .then((rows) => setResourceShares(sharesForResource(rows, resourceType, resourceId)))
      .catch(() => setResourceShares([]));
  }, [resourceId, resourceType]);
  useEffect(() => {
    if (inspectorTab === "details" || inspectorTab === "dataTemplates") setPrimarySlot(inspectorTab);
  }, [inspectorTab]);
  useEffect(() => {
    if (!selected || !resourceId) { setFacts(null); return; }
    let cancel = false;
    const id = resourceId;
    if (selected.kind === "FILE") {
      const file = selected.file;
      Promise.all([getFileDetails(id).catch(() => null), getFileDlp(id).catch(() => null)]).then(([details, dlp]) => {
        if (cancel) return;
        const names = [...(details?.tags ?? []).map((tag) => tag.name), ...(dlp?.labels ?? []).map((item) => item.name)].filter(Boolean);
        setFacts({ id, location: details?.location?.name ?? null, labels: [...new Set(names)], createdAt: details?.createdAt ?? file.createdAt ?? null, updatedAt: details?.updatedAt ?? file.updatedAt ?? null, size: details?.size ?? file.size ?? null, mimeType: details?.mimeType ?? file.mimeType ?? null, ownerName: details?.owner?.name ?? file.ownerName ?? null });
        getFileActivities(id, 100).then(setFileActivities).catch(() => setFileActivities([]));
      });
    } else {
      const folder = selected.folder;
      const parentId = folder.parentId ?? null;
      Promise.all([
        parentId ? getFolder(parentId).then((row) => row.name).catch(() => null) : Promise.resolve(null),
        listFolderDataTemplateBindings(id).catch(() => [] as DataTemplateBinding[]),
      ]).then(([location, rows]) => {
        if (cancel) return;
        setFacts({ id, location, labels: rows.map((row) => row.template?.name).filter((name): name is string => Boolean(name)), createdAt: (folder as { createdAt?: string }).createdAt ?? folder.updatedAt ?? null, updatedAt: folder.updatedAt ?? null, size: (folder as { size?: number }).size ?? null, mimeType: null, ownerName: folder.ownerName ?? null, containsFolders: (folder as { folderCount?: number }).folderCount ?? null, containsFiles: (folder as { fileCount?: number }).fileCount ?? folder.itemCount ?? null });
        setFileActivities([]);
      });
    }
    return () => { cancel = true; };
  }, [resourceId, selected]);
  useEffect(() => {
    if (!resourceId) { setDesc(""); setEditingDesc(false); return; }
    try { const v = localStorage.getItem(descKey(resourceId)) ?? ""; setDesc(v); setDescDraft(v); } catch { setDesc(""); setDescDraft(""); }
    setEditingDesc(false);
  }, [resourceId]);
  const shareSummary = useMemo(
    () => formatInspectorShareSummary(resourceShares, locale, label("inspector.sharedWithPrivate")),
    [resourceShares, locale, label],
  );
  if (!inspectorOpen) return null;
  const name = selected ? (selected.kind === "FILE" ? selected.file.name : selected.folder.name) : null;
  const kind = selected ? fileIconKind(selected.kind === "FILE" ? "file" : "folder", selected.kind === "FILE" ? selected.file.mimeType : null, name ?? "") : "file";
  const closeAll = () => { setInspectorOpen(false); setMobileInspectorOpen(false); };
  const permalinkPath = !resourceId ? "" : selected?.kind === "FILE" ? `/files?file=${resourceId}` : `/files/${resourceId}`;
  const permalink = permalinkPath && typeof window !== "undefined" ? `${window.location.origin}${permalinkPath}` : permalinkPath;
  const ownerName = selected ? (selected.kind === "FILE" ? selected.file.ownerName : selected.folder.ownerName) : null;
  const fact = facts && facts.id === resourceId ? facts : null;
  const createdAt = fact?.createdAt ?? (selected?.kind === "FILE" ? selected.file.createdAt ?? selected.file.updatedAt : selected?.folder.updatedAt);
  const updatedAt = fact?.updatedAt ?? (selected?.kind === "FILE" ? selected.file.updatedAt : selected?.folder.updatedAt);
  const locationName = fact ? (fact.location || label("files.rootFolder")) : label("files.rootFolder");
  const labelText = fact && fact.labels.length > 0 ? fact.labels.join(", ") : label("inspector.addLabels");
  const modifiedBy = ownerName
    ? label("files.modifiedByLine").replace("{date}", formatDateLocalized(updatedAt, locale)).replace("{name}", ownerName)
    : formatDateLocalized(updatedAt, locale);
  const copyPermalink = async () => {
    if (!permalink) return;
    try { await navigator.clipboard.writeText(permalink); } catch { /* clipboard unavailable */ }
  };
  const openShare = () => {
    if (!resourceId || !resourceType) return;
    window.dispatchEvent(new CustomEvent("workdrive:open-share", { detail: { type: resourceType, id: resourceId } }));
  };
  const saveDesc = () => {
    if (!resourceId) return;
    try { localStorage.setItem(descKey(resourceId), desc); } catch { /* noop */ }
    setEditingDesc(false);
  };
  const inner = (
    <>
      <div className="wd-zoho-details-titlebar">
        <h2>{label(inspectorTab === "dataTemplates" ? "inspector.dataTemplates" : inspectorTab === "activity" ? "inspector.activity" : "inspector.details")}</h2>
        <button type="button" onClick={closeAll} className="wd-icon-btn" aria-label={label("nav.closePanel")}>
          <Icons.x size={15} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {selected === null || name === null ? (
          <div className="wd-zoho-empty">
            {inspectorTab === "dataTemplates" ? (
              <>
                <div className="wd-zoho-empty-illu" aria-hidden="true">
                  <span className="wd-zoho-empty-card wd-zoho-empty-card-a" />
                  <span className="wd-zoho-empty-card wd-zoho-empty-card-b" />
                  <span className="wd-zoho-empty-hand">👆</span>
                </div>
                <p>{locale === "ar" ? "يرجى تحديد ملف أو مجلد لعرض قوالب البيانات والحقول المخصصة المرتبطة به." : "Please select a file/folder to view associated data templates and custom fields."}</p>
              </>
            ) : (
              <>
                <div className="wd-zoho-empty-illu" aria-hidden="true">
                  <span className="wd-zoho-empty-card wd-zoho-empty-card-a" />
                  <span className="wd-zoho-empty-card wd-zoho-empty-card-b" />
                  <span className="wd-zoho-empty-hand">👆</span>
                </div>
                <p>{locale === "ar" ? "يرجى تحديد ملف أو مجلد لعرض التفاصيل." : "Please select a file or folder to view details."}</p>
              </>
            )}
          </div>
        ) : inspectorTab === "details" ? (
          <div className="wd-zoho-details">
            <div className="wd-zoho-details-head">
              <FileTypeIcon kind={kind} size={18} />
              <span className="wd-zoho-details-name" title={name}>{name}</span>
              <button type="button" className="wd-zoho-details-rename" aria-label={locale === "ar" ? "إعادة تسمية" : "Rename"} onClick={() => { setDescDraft(desc); setEditingDesc(true); }}><Icons.pencil size={14} /></button>
            </div>

            {editingDesc ? (
              <div className="wd-zoho-desc-box">
                <textarea
                  value={descDraft}
                  maxLength={2000}
                  onChange={(e) => setDescDraft(e.target.value.slice(0, 2000))}
                  className="wd-zoho-desc-textarea"
                  autoFocus
                  placeholder={locale === "ar" ? "إضافة وصف (بحد أقصى 2000 حرف)" : "Add description (Max. 2000 characters)"}
                  rows={4}
                />
                <div className="wd-zoho-desc-actions">
                  <button type="button" className="wd-zoho-desc-cancel" onClick={() => { setEditingDesc(false); setDescDraft(desc); }}>{locale === "ar" ? "إلغاء" : "Cancel"}</button>
                  <button type="button" className="wd-zoho-desc-save" onClick={() => {
                    const next = descDraft.slice(0, 2000);
                    setDesc(next);
                    if (resourceId) { try { localStorage.setItem(descKey(resourceId), next); } catch { /* ignore */ } }
                    setEditingDesc(false);
                  }}>{locale === "ar" ? "حفظ" : "Save"}</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => {
                const fileId = selected.file.id;
                setInspectorOpen(false);
                setMobileInspectorOpen(false);
                // Always open the full details management page on the Versions tab
                router.push(`/files/details/${encodeURIComponent(fileId)}?tab=versions`);
              }} className="wd-zoho-details-versions"><Icons.history size={15} /> <span>{locale === "ar" ? "عرض كل الإصدارات" : "View all versions"}</span></button>
            ) : null}

            <div className="wd-zoho-details-meta">
              <div><span>{locale === "ar" ? "النوع" : "Type"}</span><strong>{selected.kind === "FILE" ? (selected.file.fileType || fact?.mimeType || selected.file.mimeType || "File") : (locale === "ar" ? "مجلد" : "Folder")}</strong></div>
              <div><span>{locale === "ar" ? "وقت الإنشاء" : "Time Created"}</span><strong>{formatDateLocalized(createdAt, locale)}</strong></div>
              <div><span>{locale === "ar" ? "عدّله" : "Modified by"}</span><strong>{modifiedBy}</strong></div>
              {selected.kind === "FOLDER" ? (
                <div><span>{locale === "ar" ? "يحتوي" : "Contains"}</span><strong>{
                  (() => {
                    const folders = fact?.containsFolders;
                    const files = fact?.containsFiles;
                    if (folders == null && files == null) return "—";
                    const parts = [];
                    if (folders != null) parts.push(`${folders} ${locale === "ar" ? "مجلدات" : "folders"}`);
                    if (files != null) parts.push(`${files} ${locale === "ar" ? "ملفات" : "files"}`);
                    return parts.join(locale === "ar" ? " ، " : ", ");
                  })()
                }</strong></div>
              ) : null}
              <div><span>{locale === "ar" ? "الحجم" : "Size"}</span><strong>{selected.kind === "FILE" ? formatBytes(fact?.size ?? selected.file.size ?? 0) : (fact?.size != null ? formatBytes(fact.size) : "—")}</strong></div>
              <div><span>{locale === "ar" ? "المساحة المستخدمة" : "Storage Used"}</span><strong>{
                selected.kind === "FILE"
                  ? ((fact?.size ?? selected.file.size ?? 0) > 0 ? formatBytes(fact?.size ?? selected.file.size ?? 0) : (locale === "ar" ? "التخزين مجاني لملفات التنسيق الأصلي." : "Storage is free for files in native format."))
                  : (fact?.size != null ? formatBytes(fact.size) : "—")
              }</strong></div>
            </div>
          </div>
        ) : inspectorTab === "dataTemplates" ? (
          <div className="flex flex-col gap-4">
            <div className="rounded-[12px] border border-[#EDEDED] bg-[#F8FAFC] p-3"><div className="text-[12px] font-semibold">{label("inspector.dataTemplates")}</div><div className="mt-1 text-[10px] text-[#666]">{locale === "ar" ? "اربط خصائص مخصصة بهذا العنصر لتصنيفه والعثور عليه في البحث." : "Associate custom properties with this item for classification and search."}</div></div>
            {bindings.map((binding) => <div key={binding.id} className="rounded-[12px] border border-[#EDEDED] p-3"><div className="flex items-center justify-between gap-2"><div className="min-w-0"><b className="block truncate text-[12px]">{binding.template.name}</b><span className="text-[10px] text-[#777]">{Object.keys(binding.customFields || {}).length} {locale === "ar" ? "قيم" : "values"}</span></div><div className="flex items-center gap-2"><button disabled={templateBusy} onClick={() => { setTemplateId(binding.templateId); setFieldValues({ ...(binding.customFields || {}) }); }} className="text-[10px] text-[var(--wd-primary)]">{locale === "ar" ? "تعديل" : "Edit"}</button><button disabled={templateBusy} onClick={async () => { setTemplateBusy(true); try { if (selected.kind === "FILE") await disassociateFileDataTemplate(selected.file.id, binding.templateId); else await disassociateFolderDataTemplate(selected.folder.id, binding.templateId); setBindings((x) => x.filter((b) => b.id !== binding.id)); } finally { setTemplateBusy(false); } }} className="text-[10px] text-red-600">{locale === "ar" ? "إزالة" : "Remove"}</button></div></div><div className="mt-2 grid gap-1">{(binding.template.fields || binding.template.schema || []).map((field) => <div key={field.key} className="flex justify-between gap-2 text-[10px]"><span className="text-[#666]">{field.label}</span><span className="truncate">{String((binding.customFields || {})[field.key] ?? "—")}</span></div>)}</div></div>)}
            <div className="rounded-[12px] border border-[#EDEDED] p-3"><div className="mb-2 text-[11px] font-semibold">{locale === "ar" ? "إضافة قالب بيانات" : "Associate Data Template"}</div><ImkanOptionPicker value={templateId} onChange={(next) => { setTemplateId(next); setFieldValues({}); }} options={dataTemplates.filter((t) => !bindings.some((b) => b.templateId === t.id) || t.id === templateId).map((t) => ({ value: t.id, label: t.name }))} ariaLabel={locale === "ar" ? "اختر قالبًا" : "Select a template"} appearance="audit" fullWidth allowEmpty emptyLabel={locale === "ar" ? "اختر قالبًا" : "Select a template"} placeholder={locale === "ar" ? "اختر قالبًا" : "Select a template"} />{templateId ? <div className="mt-3 space-y-2">{(dataTemplates.find((t) => t.id === templateId)?.fields || dataTemplates.find((t) => t.id === templateId)?.schema || []).map((field) => <label key={field.key} className="block"><span className="mb-1 block text-[10px] text-[#666]">{field.label}{field.required ? " *" : ""}</span>{field.type === "boolean" ? <input type="checkbox" checked={Boolean(fieldValues[field.key])} onChange={(e) => setFieldValues((v) => ({ ...v, [field.key]: e.target.checked }))} /> : field.type === "select" || field.type === "radio" ? <ImkanOptionPicker value={String(fieldValues[field.key] ?? "")} onChange={(next) => setFieldValues((v) => ({ ...v, [field.key]: next }))} options={toImkanPickerOptions(field.options || [])} ariaLabel={field.label} fullWidth allowEmpty emptyLabel="—" /> : <input type={field.type === "number" ? "number" : field.type === "email" ? "email" : field.type === "date" ? "date" : field.type === "datetime" ? "datetime-local" : "text"} value={String(fieldValues[field.key] ?? "")} onChange={(e) => setFieldValues((v) => ({ ...v, [field.key]: field.type === "number" ? Number(e.target.value) : e.target.value }))} className="h-8 w-full rounded-md border border-slate-200 px-2 text-[10px]" />}</label>)}<button disabled={templateBusy} onClick={async () => { if (!templateId || !selected) return; setTemplateBusy(true); try { const row = selected.kind === "FILE" ? await associateFileDataTemplate(selected.file.id, templateId, fieldValues) : await associateFolderDataTemplate(selected.folder.id, templateId, fieldValues); setBindings((x) => x.some((b) => b.id === row.id) ? x.map((b) => b.id === row.id ? row : b) : [...x, row]); setTemplateId(""); setFieldValues({}); } finally { setTemplateBusy(false); } }} className="mt-2 h-9 w-full rounded-lg bg-[var(--wd-primary)] text-[11px] font-semibold text-white disabled:opacity-50">{locale === "ar" ? "ربط القالب" : "Associate"}</button></div> : null}</div>
          </div>
        ) : (
          <ol className="flex flex-col gap-2">
            {logs.slice(0, 30).map((r) => (
              <li key={r.id} className="rounded-[12px] border border-[#EDEDED] p-2 text-[12.5px]">
                <div className="truncate">{formatAuditAction(r, label as (k: string) => string)}</div>
                <div className="mt-0.5 text-[11.5px] text-[#4F4F4F]">{formatDateLocalized(r.createdAt, locale)}</div>
              </li>
            ))}
            {logs.length === 0 ? <li className="text-[13px] text-[#4F4F4F]">{label("audit.empty")}</li> : null}
          </ol>
        )}
      </div>
    </>
  );
  return (
    <>
      <aside data-overlay-bound="sidebar" className="wd-drawer hidden shrink-0 flex-col border-s border-[#EDEDED] bg-white lg:flex" aria-label={label("inspector.details")}>
        {inner}
      </aside>
      {mobileInspectorOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={label("inspector.details")}>
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileInspectorOpen(false)} aria-hidden="true" />
          <div className="wd-drawer absolute bottom-0 end-0 top-0 flex max-w-[88vw] flex-col bg-white shadow-[0_6px_24px_rgba(0,0,0,0.1)]">
            {inner}
          </div>
        </div>
      ) : null}
    </>
  );
}
