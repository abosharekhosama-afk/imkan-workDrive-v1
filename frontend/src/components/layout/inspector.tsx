"use client";
import { useEffect, useState } from "react";
import { useLocale } from "../locale-provider";
import { FileTypeIcon, fileIconKind } from "../file-icon";
import { formatDateLocalized } from "../../lib/localized";
import { listAudit, formatAuditAction, type AuditRecord } from "../../lib/api/audit";
import { useShell, type InspectorTab } from "./shell-context";
import { Icons } from "./icons";
import { openWip } from "../wip-modal";
import { associateFileDataTemplate, associateFolderDataTemplate, disassociateFileDataTemplate, disassociateFolderDataTemplate, listDataTemplates, listFileDataTemplateBindings, listFolderDataTemplateBindings, type DataTemplate, type DataTemplateBinding } from "../../lib/api/metadata";

function descKey(id: string) { return `wd.desc.${id}`; }

export function InspectorDock() {
  const { label } = useLocale();
  const { inspectorOpen, setInspectorOpen, inspectorTab, setInspectorTab, setMobileInspectorOpen } = useShell();
  const items: Array<{ tab: InspectorTab; icon: keyof typeof Icons; tipKey: "nav.openDetails" | "nav.dataTemplates" | "nav.zia"; textKey: "inspector.details" | "inspector.dataTemplates" | "inspector.zia" }> = [
    { tab: "details", icon: "info", tipKey: "nav.openDetails", textKey: "inspector.details" },
    { tab: "dataTemplates", icon: "layout", tipKey: "nav.dataTemplates", textKey: "inspector.dataTemplates" },
    { tab: "activity", icon: "spark", tipKey: "nav.zia", textKey: "inspector.zia" },
  ];
  return (
    <div className="wd-rail flex shrink-0 flex-col items-center gap-1 border-s border-[color:var(--wd-line)] bg-white" role="toolbar" aria-label={label("inspector.details")}>
      {items.map((i, idx) => {
        const pressed = i.tipKey === "nav.openDetails" && i.tab === inspectorTab && inspectorOpen;
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
  const resourceId = selected ? (selected.kind === "FILE" ? selected.file.id : selected.folder.id) : null;
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
    if (!resourceId) { setDesc(""); setEditingDesc(false); return; }
    try { setDesc(localStorage.getItem(descKey(resourceId)) ?? ""); } catch { setDesc(""); }
    setEditingDesc(false);
  }, [resourceId]);
  if (!inspectorOpen) return null;
  const name = selected ? (selected.kind === "FILE" ? selected.file.name : selected.folder.name) : null;
  const kind = selected ? fileIconKind(selected.kind === "FILE" ? "file" : "folder", selected.kind === "FILE" ? selected.file.mimeType : null, name ?? "") : "file";
  const closeAll = () => { setInspectorOpen(false); setMobileInspectorOpen(false); };
  const permalink = resourceId && typeof window !== "undefined" ? `${window.location.origin}/files/${resourceId}` : "";
  const copyPermalink = async () => {
    if (!permalink) return;
    try { await navigator.clipboard.writeText(permalink); } catch { /* clipboard unavailable */ }
  };
  const saveDesc = () => {
    if (!resourceId) return;
    try { localStorage.setItem(descKey(resourceId), desc); } catch { /* noop */ }
    setEditingDesc(false);
  };
  const inner = (
    <>
      <div className="flex items-center border-b border-[#EDEDED]">
        {(["details", "dataTemplates", "activity"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setInspectorTab(t)} aria-selected={inspectorTab === t} role="tab"
            className={`flex-1 px-3 py-2.5 text-[13px] font-medium transition-colors duration-150 ease-in-out ${inspectorTab === t ? "border-b-2 border-[var(--wd-primary)] text-[var(--wd-primary)]" : "text-[#4F4F4F] hover:text-[#212121]"}`}>
            {label(t === "details" ? "inspector.details" : t === "dataTemplates" ? "inspector.dataTemplates" : "inspector.activity")}
          </button>
        ))}
        <button type="button" onClick={closeAll} className="wd-icon-btn" aria-label={label("nav.closePanel")}>
          <Icons.x size={15} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {selected === null || name === null ? (
          <p className="text-[13px] text-[#4F4F4F]">{label("inspector.empty")}</p>
        ) : inspectorTab === "details" ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2.5 rounded-[12px] bg-[#F7F8FA] p-3">
              <FileTypeIcon kind={kind} size={34} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-medium" title={name}>{name}</div>
                {editingDesc ? (
                  <div className="mt-1 flex items-center gap-1">
                    <input value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={saveDesc}
                      onKeyDown={(e) => { if (e.key === "Enter") saveDesc(); if (e.key === "Escape") setEditingDesc(false); }}
                      className="wd-search min-w-0 flex-1" autoFocus aria-label={label("inspector.addDescription")} />
                  </div>
                ) : (
                  <button type="button" onClick={() => setEditingDesc(true)} className="mt-0.5 inline-flex items-center gap-1 text-[12px] text-[#4F4F4F] hover:text-[#212121]">
                    <Icons.pencil size={12} /> {desc || label("inspector.addDescription")}
                  </button>
                )}
              </div>
            </div>
            <dl className="flex flex-col gap-2 text-[13px]">
              <div className="flex justify-between gap-2"><dt className="text-[#4F4F4F]">{label("inspector.createdBy")}</dt><dd className="truncate">{(selected.kind === "FILE" ? selected.file.ownerName : selected.folder.ownerName) ?? "—"}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-[#4F4F4F]">{label("inspector.sharedWith")}</dt><dd className="truncate text-[12px]">{label("inspector.sharedWithPrivate")}</dd></div>
              <div className="flex justify-between gap-2">
                <dt className="text-[#4F4F4F]">{label("inspector.permalink")}</dt>
                <dd className="min-w-0 truncate">
                  <button type="button" onClick={() => void copyPermalink()} className="inline-flex max-w-full items-center gap-1 truncate text-[var(--wd-primary)] hover:underline" title={permalink}>
                    <Icons.link size={12} /> <span className="truncate">{permalink || "—"}</span>
                  </button>
                </dd>
              </div>
              <div className="flex justify-between gap-2"><dt className="text-[#4F4F4F]">{label("inspector.location")}</dt><dd className="truncate text-[#4F4F4F]">—</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-[#4F4F4F]">{label("inspector.addLabels")}</dt><dd className="truncate text-[#4F4F4F]">—</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-[#4F4F4F]">{label("inspector.type")}</dt><dd className="truncate">{selected.kind === "FILE" ? selected.file.mimeType ?? "—" : label("files.type.folder")}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-[#4F4F4F]">{label("inspector.timeCreated")}</dt><dd className="truncate">{formatDateLocalized(selected.kind === "FILE" ? selected.file.updatedAt : selected.folder.updatedAt, locale)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-[#4F4F4F]">{label("inspector.modifiedBy")}</dt><dd className="truncate text-[#4F4F4F]">—</dd></div>
            </dl>
            {selected.kind === "FILE" ? (
              <button type="button" onClick={() => {
                if (onVersionHistory) onVersionHistory(selected.file.id);
                window.dispatchEvent(new CustomEvent("workdrive:version-history", { detail: { fileId: selected.file.id } }));
              }} className="inline-flex items-center justify-between rounded-[16px] border border-[#EDEDED] px-3 py-1.5 text-[13px] hover:bg-[#F3F5F7]">
                {label("inspector.versionHistory")} <Icons.chevR size={13} />
              </button>
            ) : null}
          </div>
        ) : inspectorTab === "dataTemplates" ? (
          <div className="flex flex-col gap-4">
            <div className="rounded-[12px] border border-[#EDEDED] bg-[#F8FAFC] p-3"><div className="text-[12px] font-semibold">{label("inspector.dataTemplates")}</div><div className="mt-1 text-[10px] text-[#666]">{locale === "ar" ? "اربط خصائص مخصصة بهذا العنصر لتصنيفه والعثور عليه في البحث." : "Associate custom properties with this item for classification and search."}</div></div>
            {bindings.map((binding) => <div key={binding.id} className="rounded-[12px] border border-[#EDEDED] p-3"><div className="flex items-center justify-between gap-2"><div className="min-w-0"><b className="block truncate text-[12px]">{binding.template.name}</b><span className="text-[10px] text-[#777]">{Object.keys(binding.customFields || {}).length} {locale === "ar" ? "قيم" : "values"}</span></div><div className="flex items-center gap-2"><button disabled={templateBusy} onClick={() => { setTemplateId(binding.templateId); setFieldValues({ ...(binding.customFields || {}) }); }} className="text-[10px] text-[var(--wd-primary)]">{locale === "ar" ? "تعديل" : "Edit"}</button><button disabled={templateBusy} onClick={async () => { setTemplateBusy(true); try { if (selected.kind === "FILE") await disassociateFileDataTemplate(selected.file.id, binding.templateId); else await disassociateFolderDataTemplate(selected.folder.id, binding.templateId); setBindings((x) => x.filter((b) => b.id !== binding.id)); } finally { setTemplateBusy(false); } }} className="text-[10px] text-red-600">{locale === "ar" ? "إزالة" : "Remove"}</button></div></div><div className="mt-2 grid gap-1">{(binding.template.fields || binding.template.schema || []).map((field) => <div key={field.key} className="flex justify-between gap-2 text-[10px]"><span className="text-[#666]">{field.label}</span><span className="truncate">{String((binding.customFields || {})[field.key] ?? "—")}</span></div>)}</div></div>)}
            <div className="rounded-[12px] border border-[#EDEDED] p-3"><div className="mb-2 text-[11px] font-semibold">{locale === "ar" ? "إضافة قالب بيانات" : "Associate Data Template"}</div><select value={templateId} onChange={(e) => { setTemplateId(e.target.value); setFieldValues({}); }} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-[10px]"><option value="">{locale === "ar" ? "اختر قالبًا" : "Select a template"}</option>{dataTemplates.filter((t) => !bindings.some((b) => b.templateId === t.id) || t.id === templateId).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>{templateId ? <div className="mt-3 space-y-2">{(dataTemplates.find((t) => t.id === templateId)?.fields || dataTemplates.find((t) => t.id === templateId)?.schema || []).map((field) => <label key={field.key} className="block"><span className="mb-1 block text-[10px] text-[#666]">{field.label}{field.required ? " *" : ""}</span>{field.type === "boolean" ? <input type="checkbox" checked={Boolean(fieldValues[field.key])} onChange={(e) => setFieldValues((v) => ({ ...v, [field.key]: e.target.checked }))} /> : field.type === "select" || field.type === "radio" ? <select value={String(fieldValues[field.key] ?? "")} onChange={(e) => setFieldValues((v) => ({ ...v, [field.key]: e.target.value }))} className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[10px]"><option value="">—</option>{(field.options || []).map((o) => <option key={o}>{o}</option>)}</select> : <input type={field.type === "number" ? "number" : field.type === "email" ? "email" : field.type === "date" ? "date" : field.type === "datetime" ? "datetime-local" : "text"} value={String(fieldValues[field.key] ?? "")} onChange={(e) => setFieldValues((v) => ({ ...v, [field.key]: field.type === "number" ? Number(e.target.value) : e.target.value }))} className="h-8 w-full rounded-md border border-slate-200 px-2 text-[10px]" />}</label>)}<button disabled={templateBusy} onClick={async () => { if (!templateId || !selected) return; setTemplateBusy(true); try { const row = selected.kind === "FILE" ? await associateFileDataTemplate(selected.file.id, templateId, fieldValues) : await associateFolderDataTemplate(selected.folder.id, templateId, fieldValues); setBindings((x) => x.some((b) => b.id === row.id) ? x.map((b) => b.id === row.id ? row : b) : [...x, row]); setTemplateId(""); setFieldValues({}); } finally { setTemplateBusy(false); } }} className="mt-2 h-9 w-full rounded-lg bg-[var(--wd-primary)] text-[11px] font-semibold text-white disabled:opacity-50">{locale === "ar" ? "ربط القالب" : "Associate"}</button></div> : null}</div>
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
      <aside className="wd-drawer hidden shrink-0 flex-col border-s border-[#EDEDED] bg-white lg:flex" aria-label={label("inspector.details")}>
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
