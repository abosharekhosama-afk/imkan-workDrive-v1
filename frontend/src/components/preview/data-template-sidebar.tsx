"use client";

import { useEffect, useState } from "react";
import { useLocale } from "../locale-provider";
import { ImkanOptionPicker } from "../imkan-option-picker";
import { associateFileDataTemplate, listDataTemplates, listFileDataTemplateBindings, type DataTemplateBinding, type DataTemplate } from "../../lib/api/metadata";

export function DataTemplateSidebar({ open, fileId, onClose }: { open: boolean; fileId: string; onClose?: () => void }) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [rows, setRows] = useState<DataTemplateBinding[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<DataTemplate[]>([]);
  const [picked, setPicked] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setRows(null);
    setError(null);
    setPicked("");
    void Promise.all([listFileDataTemplateBindings(fileId), listDataTemplates(false)])
      .then(([value, allTemplates]) => { if (live) { setRows(value); setTemplates(allTemplates); } })
      .catch((cause) => { if (live) setError(cause instanceof Error ? cause.message : (ar ? "تعذر تحميل قالب البيانات." : "Unable to load data templates.")); });
    return () => { live = false; };
  }, [open, fileId, ar]);

  async function associate(templateId: string) {
    if (!templateId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await associateFileDataTemplate(fileId, templateId, {});
      setPicked("");
      setRows(await listFileDataTemplateBindings(fileId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (ar ? "تعذر ربط القالب." : "Unable to associate the template."));
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;
  const available = templates.filter((template) => template.active && !rows?.some((binding) => binding.templateId === template.id));

  return (
    <aside className="zoho-preview-panel zoho-data-template-panel" dir={ar ? "rtl" : "ltr"} aria-label={ar ? "قوالب البيانات" : "Data Templates"}>
      <header className="zoho-preview-panel-head">
        <div>
          <h2>{ar ? "قوالب البيانات" : "Data Templates"}</h2>
          <p>{ar ? "الخصائص والقيم المرتبطة بهذا الملف." : "Properties and values associated with this file."}</p>
        </div>
        {onClose ? <button type="button" className="zoho-panel-close" onClick={onClose} aria-label={ar ? "إغلاق" : "Close"}>×</button> : null}
      </header>
      <div className="zoho-data-template-actionbar">
        <ImkanOptionPicker
          appearance="audit"
          fullWidth
          allowEmpty
          disabled={busy}
          value={picked}
          onChange={(next) => { setPicked(next); void associate(next); }}
          options={available.map((template) => ({ value: template.id, label: template.name }))}
          ariaLabel={ar ? "ربط قالب" : "Associate"}
          placeholder={ar ? "اختر قالبًا" : "Select a template"}
          emptyLabel={ar ? "اختر قالبًا" : "Select a template"}
        />
      </div>
      <div className="zoho-preview-panel-body">
        {rows === null && !error ? <div className="zoho-panel-loading"><span className="zoho-viewer-spinner" /></div> : null}
        {error ? <div className="zoho-panel-error">{error}</div> : null}
        {rows?.length === 0 ? (
          <div className="zoho-panel-empty">
            <div className="zoho-panel-empty-icon">▣</div>
            <strong>{ar ? "لا توجد قوالب مرتبطة" : "No data templates"}</strong>
            <span>{ar ? "اختر قالبًا من القائمة أعلاه." : "Choose a template from the list above."}</span>
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
    </aside>
  );
}
