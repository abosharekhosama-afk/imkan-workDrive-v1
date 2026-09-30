"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "./modal";
import { useLocale } from "./locale-provider";
import { ImkanOptionPicker, toImkanPickerOptions } from "./imkan-option-picker";
import { associateFileDataTemplate, associateFolderDataTemplate, type DataTemplate } from "../lib/api/metadata";
import { resolveDataTemplateSchema } from "../lib/data-template-logic";
import type { ResourceType } from "../lib/api/types";

export type DataTemplateTarget = { type: ResourceType; id: string; name: string };

export function DataTemplateAssociationModal({ targets, dataTemplates, onClose, onChanged }: { targets: DataTemplateTarget[]; dataTemplates: DataTemplate[]; onClose: () => void; onChanged?: () => void }) {
  const { locale } = useLocale();
  const [templateId, setTemplateId] = useState("");
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const template = useMemo(() => dataTemplates.find((t) => t.id === templateId) ?? null, [dataTemplates, templateId]);

  useEffect(() => { setTemplateId(""); setValues({}); setError(null); }, [targets.map((t) => `${t.type}:${t.id}`).join("|")]);

  const fields = resolveDataTemplateSchema(template);
  const missing = fields.filter((field) => field.required && (values[field.key] === undefined || values[field.key] === null || String(values[field.key]).trim() === ""));

  async function associate() {
    if (!templateId || missing.length) return;
    setBusy(true); setError(null);
    try {
      await Promise.all(targets.map((target) => target.type === "FILE"
        ? associateFileDataTemplate(target.id, templateId, values)
        : associateFolderDataTemplate(target.id, templateId, values)));
      onChanged?.();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (locale === "ar" ? "تعذر ربط قالب البيانات" : "Could not associate the data template"));
    } finally { setBusy(false); }
  }

  return (
    <Modal title={locale === "ar" ? "ربط قالب البيانات" : "Associate Data Template"} onClose={onClose} className="w-full max-w-[620px]" footer={<div className="flex w-full justify-end gap-2"><button type="button" onClick={onClose} disabled={busy} className="imkan-button-secondary">{locale === "ar" ? "إلغاء" : "Cancel"}</button><button type="button" onClick={() => void associate()} disabled={busy || !templateId || missing.length > 0} className="imkan-button">{busy ? (locale === "ar" ? "جارٍ الربط…" : "Associating…") : (locale === "ar" ? "ربط" : "Associate")}</button></div>}>
      <div className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="text-[12px] font-semibold text-slate-800">{locale === "ar" ? `سيتم تطبيق القالب على ${targets.length} عنصر` : `Apply the template to ${targets.length} selected item${targets.length === 1 ? "" : "s"}`}</div><div className="mt-1 text-[10px] text-slate-500">{targets.map((t) => t.name).join(", ")}</div></div>
        <label className="block"><span className="mb-1 block text-[11px] font-medium text-slate-700">{locale === "ar" ? "قالب البيانات" : "Data Template"}</span><ImkanOptionPicker value={templateId} onChange={(next) => { setTemplateId(next); setValues({}); setError(null); }} options={dataTemplates.filter((t) => t.active).map((t) => ({ value: t.id, label: t.name }))} ariaLabel={locale === "ar" ? "قالب البيانات" : "Data Template"} appearance="audit" fullWidth allowEmpty emptyLabel={locale === "ar" ? "اختر قالبًا" : "Select a template"} placeholder={locale === "ar" ? "اختر قالبًا" : "Select a template"} /></label>
        {template ? <div className="space-y-3 rounded-lg border border-slate-200 p-3"><div className="text-[11px] font-semibold text-slate-800">{locale === "ar" ? "الخصائص" : "Properties"}</div>{fields.map((field) => <label key={field.key} className="block"><span className="mb-1 block text-[10px] text-slate-600">{field.label}{field.required ? " *" : ""}</span>{field.type === "boolean" ? <input type="checkbox" checked={Boolean(values[field.key])} onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.checked }))} /> : field.type === "select" || field.type === "radio" ? <ImkanOptionPicker value={String(values[field.key] ?? "")} onChange={(next) => setValues((v) => ({ ...v, [field.key]: next }))} options={toImkanPickerOptions(field.options || [])} ariaLabel={field.label} fullWidth allowEmpty emptyLabel="—" /> : <input type={field.type === "number" ? "number" : field.type === "email" ? "email" : field.type === "date" ? "date" : field.type === "datetime" ? "datetime-local" : "text"} value={String(values[field.key] ?? "")} onChange={(e) => setValues((v) => ({ ...v, [field.key]: field.type === "number" ? Number(e.target.value) : e.target.value }))} className="h-9 w-full rounded-md border border-slate-200 px-2 text-[11px]" />}</label>)}</div> : null}
        {missing.length ? <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">{locale === "ar" ? `الحقول المطلوبة: ${missing.map((f) => f.label).join(", ")}` : `Required fields: ${missing.map((f) => f.label).join(", ")}`}</div> : null}
        {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">{error}</div> : null}
      </div>
    </Modal>
  );
}
