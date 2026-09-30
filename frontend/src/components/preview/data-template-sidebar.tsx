"use client";

import { useEffect, useState } from "react";
import { useLocale } from "../locale-provider";
import { listDataTemplates, listFileDataTemplateBindings, type DataTemplateBinding, type DataTemplate } from "../../lib/api/metadata";
import { DataTemplateAssociationModal } from "../data-template-association-modal";

export function DataTemplateSidebar({ open, fileId, onClose }: { open: boolean; fileId: string; onClose?: () => void }) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [rows, setRows] = useState<DataTemplateBinding[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<DataTemplate[]>([]);
  const [associateOpen, setAssociateOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setRows(null);
    setError(null);
    void Promise.all([listFileDataTemplateBindings(fileId), listDataTemplates(false)])
      .then(([value, allTemplates]) => { if (live) { setRows(value); setTemplates(allTemplates); } })
      .catch((cause) => { if (live) setError(cause instanceof Error ? cause.message : (ar ? "تعذر تحميل قالب البيانات." : "Unable to load data templates.")); });
    return () => { live = false; };
  }, [open, fileId, ar]);

  if (!open) return null;

  return (
    <aside className="zoho-preview-panel zoho-data-template-panel" dir={ar ? "rtl" : "ltr"} aria-label={ar ? "قوالب البيانات" : "Data Templates"}>
      <header className="zoho-preview-panel-head">
        <div>
          <h2>{ar ? "قوالب البيانات" : "Data Templates"}</h2>
          <p>{ar ? "الخصائص والقيم المرتبطة بهذا الملف." : "Properties and values associated with this file."}</p>
        </div>
        {onClose ? <button type="button" className="zoho-panel-close" onClick={onClose} aria-label={ar ? "إغلاق" : "Close"}>×</button> : null}
      </header>
      <div className="zoho-data-template-actionbar"><button type="button" className="zoho-data-template-associate" onClick={() => setAssociateOpen(true)}>＋ {ar ? "ربط قالب" : "Associate"}</button></div>
      <div className="zoho-preview-panel-body">
        {rows === null && !error ? <div className="zoho-panel-loading"><span className="zoho-viewer-spinner" /></div> : null}
        {error ? <div className="zoho-panel-error">{error}</div> : null}
        {rows?.length === 0 ? (
          <div className="zoho-panel-empty">
            <div className="zoho-panel-empty-icon">▣</div>
            <strong>{ar ? "لا توجد قوالب مرتبطة" : "No data templates"}</strong>
            <span>{ar ? "يمكن ربط قالب من قائمة تنظيم الملف." : "A template can be associated from the file organization actions."}</span>
          </div>
        ) : null}
        {rows?.map((binding) => {
          const fields = binding.template.fields ?? binding.template.schema ?? [];
          return (
            <section key={binding.id} className="zoho-template-card">
              <div className="zoho-template-card-head">
                <span className="zoho-template-icon">▤</span>
                <div className="min-w-0">
                  <strong title={binding.template.name}>{binding.template.name}</strong>
                  <span>{fields.length} {ar ? "حقول" : "fields"}</span>
                </div>
              </div>
              {fields.length ? (
                <dl className="zoho-template-fields">
                  {fields.map((field) => {
                    const value = binding.customFields?.[field.key];
                    const shown = value === undefined || value === null || value === "" ? "—" : typeof value === "boolean" ? (value ? (ar ? "نعم" : "Yes") : (ar ? "لا" : "No")) : String(value);
                    return <div key={field.key}><dt>{field.label}</dt><dd>{shown}</dd></div>;
                  })}
                </dl>
              ) : <p className="zoho-template-empty">{ar ? "هذا القالب يعمل كتصنيف فقط." : "This template currently acts as a classification only."}</p>}
            </section>
          );
        })}
      </div>
      {associateOpen ? <DataTemplateAssociationModal targets={[{ type: "FILE", id: fileId, name: ar ? "الملف الحالي" : "Current file" }]} dataTemplates={templates} onClose={() => setAssociateOpen(false)} onChanged={() => { setAssociateOpen(false); listFileDataTemplateBindings(fileId).then(setRows).catch(() => undefined); }} /> : null}
    </aside>
  );
}
