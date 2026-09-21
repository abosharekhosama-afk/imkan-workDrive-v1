"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLocale } from "@/components/locale-provider";
import { TemplateVariablesPanel } from "@/components/templates/template-variables-panel";
import {
  getTemplate,
  getTemplateBuilder,
  listTemplateVariables,
  publishTemplateBuilder,
  saveTemplateBuilder,
  listTemplateAutomationRuns,
  certifyTemplate,
  runTemplateAutomation,
  validateTemplateAutomation,
  type TemplateAutomationRun,
  type TemplateCertification,
  type TemplateBuilderState,
  type TemplateVariable,
} from "@/lib/api/templates";

const text = (ar: boolean, en: string, value: string) => ar ? value : en;

export default function TemplateStudioPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const templateId = params.id;
  const [template, setTemplate] = useState<Awaited<ReturnType<typeof getTemplate>> | null>(null);
  const [builder, setBuilder] = useState<TemplateBuilderState | null>(null);
  const [variables, setVariables] = useState<TemplateVariable[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [variablesOpen, setVariablesOpen] = useState(false);
  const [automationRuns, setAutomationRuns] = useState<TemplateAutomationRun[]>([]);
  const [certification, setCertification] = useState<TemplateCertification | null>(null);
  const [certifying, setCertifying] = useState(false);
  const [automationOpen, setAutomationOpen] = useState(false);
  const [automationName, setAutomationName] = useState("");
  const [automationValues, setAutomationValues] = useState<Record<string, string>>({});
  const [automationPdf, setAutomationPdf] = useState(false);
  const [automationBusy, setAutomationBusy] = useState(false);
  const [automationError, setAutomationError] = useState("");
  const [automationMessage, setAutomationMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [t, b, v, runs] = await Promise.all([getTemplate(templateId), getTemplateBuilder(templateId), listTemplateVariables(templateId), listTemplateAutomationRuns(templateId)]);
      setTemplate(t); setBuilder(b); setVariables(v); setAutomationRuns(runs);
      setAutomationValues(Object.fromEntries(v.map((x) => [x.name, x.defaultValue ?? ""])));
    } catch (e) {
      setError(e instanceof Error ? e.message : text(ar, "Unable to load Template Studio.", "تعذر تحميل استوديو القوالب."));
    } finally { setLoading(false); }
  }, [templateId, ar]);

  useEffect(() => { void load(); }, [load]);

  const generateDocument = async () => {
    setAutomationBusy(true); setAutomationError(""); setAutomationMessage("");
    try {
      const check = await validateTemplateAutomation(templateId, automationValues);
      if (!check.valid) throw new Error(check.errors[0]?.message || text(ar, "Validation failed.", "فشل التحقق."));
      const result = await runTemplateAutomation(templateId, { name: automationName.trim() || `${template.name} generated`, values: automationValues, generatePdf: automationPdf });
      setAutomationMessage(text(ar, `Generated ${result.name}.`, `تم إنشاء ${result.name}.`));
      setAutomationOpen(false);
      setAutomationRuns(await listTemplateAutomationRuns(templateId));
    } catch (e) { setAutomationError(e instanceof Error ? e.message : text(ar, "Unable to generate document.", "تعذر إنشاء المستند.")); }
    finally { setAutomationBusy(false); }
  };

  const publish = async () => {
    if (!builder?.canPublish) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await saveTemplateBuilder(templateId, builder.draft);
      const next = await publishTemplateBuilder(templateId);
      setBuilder(next);
      setMessage(text(ar, "Template definition published.", "تم نشر تعريف القالب."));
    } catch (e) {
      setError(e instanceof Error ? e.message : text(ar, "Unable to publish template.", "تعذر نشر القالب."));
    } finally { setBusy(false); }
  };

  const runCertification = async () => {
    setCertifying(true); setError("");
    try { setCertification(await certifyTemplate(templateId)); }
    catch (e) { setError(e instanceof Error ? e.message : text(ar, "Certification failed.", "فشل اعتماد القالب.")); }
    finally { setCertifying(false); }
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">{text(ar, "Loading Template Studio…", "جارٍ تحميل استوديو القوالب…")}</div>;
  if (!template) return <div className="flex min-h-screen items-center justify-center p-6"><div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error || text(ar, "Template not found.", "القالب غير موجود.")}</div></div>;

  const draft = builder?.draft;
  const published = builder?.published;
  const dirty = JSON.stringify(draft) !== JSON.stringify(published);
  const totalFields = draft?.fields.length ?? 0;
  const requiredFields = draft?.fields.filter(f => f.required).length ?? 0;
  const totalRules = draft?.rules.length ?? 0;

  return <div className="min-h-screen bg-slate-50 text-slate-900" dir={ar ? "rtl" : "ltr"}>
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1500px] items-center gap-3 px-4 py-3">
        <button type="button" onClick={() => router.push("/files/templates")} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">← {text(ar, "Templates", "القوالب")}</button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{template.name}</div>
          <div className="text-[10px] text-slate-500">{text(ar, "Template Studio", "استوديو القوالب")} · {template.type} · v{template.version}</div>
        </div>
        {message && <span className="hidden rounded-lg bg-emerald-50 px-3 py-2 text-[10px] text-emerald-700 md:block">{message}</span>}
        {error && <span className="hidden max-w-[320px] truncate rounded-lg bg-red-50 px-3 py-2 text-[10px] text-red-600 md:block">{error}</span>}
        <button type="button" onClick={() => router.push(`/files/templates/builder/${templateId}`)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">{text(ar, "Open Builder", "فتح المنشئ")}</button>
        <button type="button" onClick={() => setAutomationOpen(true)} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white">{text(ar, "Generate", "إنشاء مستند")}</button>
        <button type="button" disabled={busy || !builder?.canPublish || !dirty} onClick={() => void publish()} className="rounded-lg bg-[var(--wd-primary)] px-3 py-2 text-xs font-medium text-white disabled:opacity-50">{text(ar, "Publish", "نشر")}</button>
      </div>
    </header>

    <main className="mx-auto max-w-[1500px] space-y-4 p-4">
      <section className="grid gap-4 lg:grid-cols-[1.25fr_.75fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-4">
            <div><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{text(ar, "Overview", "نظرة عامة")}</div><h1 className="mt-1 text-xl font-semibold">{template.name}</h1><p className="mt-2 max-w-2xl text-xs leading-5 text-slate-500">{template.description || text(ar, "Central workspace for variables, structure, branding, preview and publishing.", "مساحة موحدة لإدارة المتغيرات والبنية والهوية والمعاينة والنشر.")}</p></div>
            <div className={`rounded-full px-3 py-1.5 text-[10px] font-semibold ${builder?.publishedAt ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{builder?.publishedAt ? text(ar, "Published", "منشور") : text(ar, "Draft", "مسودة")}</div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[[text(ar,"Variables","المتغيرات"), variables.length], [text(ar,"Fields","الحقول"), totalFields], [text(ar,"Required","إلزامية"), requiredFields], [text(ar,"Rules","القواعد"), totalRules]].map(([label,value]) => <div key={String(label)} className="rounded-xl bg-slate-50 p-4"><div className="text-[10px] text-slate-500">{label}</div><div className="mt-1 text-lg font-semibold">{value}</div></div>)}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{text(ar, "Publishing", "النشر")}</div>
          <div className="mt-3 space-y-3 text-xs">
            <div className="flex items-center justify-between"><span className="text-slate-500">{text(ar,"Builder status","حالة المنشئ")}</span><strong>{dirty ? text(ar,"Draft changes","تغييرات مسودة") : text(ar,"Synchronized","متزامن")}</strong></div>
            <div className="flex items-center justify-between"><span className="text-slate-500">{text(ar,"Last published","آخر نشر")}</span><strong>{builder?.publishedAt ? new Date(builder.publishedAt).toLocaleString() : "—"}</strong></div>
            <div className="flex items-center justify-between"><span className="text-slate-500">{text(ar,"Published by","نشر بواسطة")}</span><strong>{builder?.publishedBy?.name || builder?.publishedBy?.email || "—"}</strong></div>
          </div>
          <div className="mt-5 rounded-xl border border-slate-200 p-3 text-[10px] leading-4 text-slate-500">{text(ar, "Publishing makes the current structured definition the active Template Studio definition. The source file/version remains preserved by the existing template version lifecycle.", "النشر يجعل التعريف المنظم الحالي هو تعريف القالب النشط في الاستوديو، مع بقاء ملف المصدر وإصداراته محفوظة ضمن دورة إصدارات القوالب الحالية.")}</div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <button type="button" onClick={() => setVariablesOpen(true)} className="rounded-2xl border border-slate-200 bg-white p-5 text-left transition hover:border-slate-300 hover:shadow-sm">
          <div className="text-2xl">⌘</div><h2 className="mt-3 text-sm font-semibold">{text(ar, "Variables", "المتغيرات")}</h2><p className="mt-1 text-[11px] leading-5 text-slate-500">{text(ar, "Manage reusable fields, types, defaults, required state and choices.", "إدارة الحقول القابلة لإعادة الاستخدام والأنواع والقيم الافتراضية والإلزام والخيارات.")}</p><div className="mt-4 text-[10px] font-semibold text-[var(--wd-primary)]">{variables.length} {text(ar,"variables","متغير")}</div>
        </button>
        <button type="button" onClick={() => router.push(`/files/templates/builder/${templateId}`)} className="rounded-2xl border border-slate-200 bg-white p-5 text-left transition hover:border-slate-300 hover:shadow-sm">
          <div className="text-2xl">▦</div><h2 className="mt-3 text-sm font-semibold">{text(ar, "Structure & Rules", "البنية والقواعد")}</h2><p className="mt-1 text-[11px] leading-5 text-slate-500">{text(ar, "Configure fields, sections, tables, images, branding, headers, footers and conditional rules.", "اضبط الحقول والأقسام والجداول والصور والهوية والرأس والتذييل والقواعد الشرطية.")}</p><div className="mt-4 text-[10px] font-semibold text-[var(--wd-primary)]">{totalFields} {text(ar,"fields","حقول")} · {totalRules} {text(ar,"rules","قواعد")}</div>
        </button>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="text-2xl">◫</div><h2 className="mt-3 text-sm font-semibold">{text(ar, "Live Preview", "المعاينة الحية")}</h2><p className="mt-1 text-[11px] leading-5 text-slate-500">{text(ar, "Open the template preview using the current source version and inspect the structured definition from the Builder.", "افتح معاينة القالب باستخدام الإصدار الحالي للمصدر وراجع التعريف المنظم من المنشئ.")}</p><button type="button" onClick={() => window.open(template.preview_url, "_blank", "noopener,noreferrer")} className="mt-4 rounded-lg border border-slate-200 px-3 py-2 text-[10px]">{text(ar, "Open source preview", "فتح معاينة المصدر")}</button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">{text(ar, "Template Definition", "تعريف القالب")}</h2><p className="mt-1 text-[10px] text-slate-500">{text(ar, "A compact view of the current Builder definition.", "عرض مختصر لتعريف المنشئ الحالي.")}</p></div><button type="button" onClick={() => router.push(`/files/templates/builder/${templateId}`)} className="rounded-lg border border-slate-200 px-3 py-2 text-[10px]">{text(ar, "Edit definition", "تعديل التعريف")}</button></div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {[[text(ar,"Sections","الأقسام"),draft?.sections.length||0],[text(ar,"Tables","الجداول"),draft?.tables.length||0],[text(ar,"Images","الصور"),draft?.images.length||0],[text(ar,"Rules","القواعد"),draft?.rules.length||0]].map(([label,value])=><div key={String(label)} className="rounded-xl border border-slate-100 bg-slate-50 p-3"><div className="text-[10px] text-slate-500">{label}</div><div className="mt-1 text-sm font-semibold">{value}</div></div>)}
        </div>
      </section>
    </main>

    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <div><h2 className="text-sm font-semibold">{text(ar, "Template Certification", "اعتماد القالب")}</h2><p className="mt-1 text-[10px] text-slate-500">{text(ar, "Validate the template lifecycle and native Office round-trip without creating production files.", "تحقق من دورة حياة القالب وتوافق Office دون إنشاء ملفات إنتاجية.")}</p></div>
        <button type="button" onClick={() => void runCertification()} disabled={certifying} className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] disabled:opacity-50">{certifying ? text(ar, "Certifying…", "جارٍ الاعتماد…") : text(ar, "Run Certification", "تشغيل الاعتماد")}</button>
      </div>
      {certification && <div className="mt-4 space-y-3">
        <div className={`rounded-xl p-3 text-[10px] ${certification.status === "FAILED" ? "bg-red-50 text-red-700" : certification.status === "CERTIFIED" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
          <strong>{certification.status}</strong> · v{certification.templateVersion} · {certification.nativeOfficeType || certification.extension.toUpperCase()} · {certification.placeholderCount} {text(ar, "placeholders", "عناصر نائبة")}
        </div>
        <div className="grid gap-2 md:grid-cols-2">{certification.checks.map(check => <div key={check.key} className="rounded-xl border border-slate-100 p-3 text-[10px]"><div className="font-semibold">{check.status} · {check.key}</div><div className="mt-1 text-slate-500">{check.message}</div></div>)}</div>
      </div>}
    </section>

    {automationOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"><div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-xl" dir={ar ? "rtl" : "ltr"}><div className="flex items-center justify-between"><h2 className="text-base font-semibold">{text(ar, "Generate from Template", "إنشاء من القالب")}</h2><button type="button" onClick={() => setAutomationOpen(false)} className="text-slate-400">✕</button></div><input value={automationName} onChange={e => setAutomationName(e.target.value)} placeholder={text(ar,"Document name","اسم المستند")} className="mt-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"/><div className="mt-4 grid gap-3 sm:grid-cols-2 max-h-[45vh] overflow-auto">{variables.map(v => <label key={v.id} className="text-[10px] text-slate-500"><span className="mb-1 block font-medium text-slate-700">{v.label}{v.required ? " *" : ""}</span><input value={automationValues[v.name] ?? ""} onChange={e => setAutomationValues(prev => ({...prev,[v.name]:e.target.value}))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" placeholder={v.defaultValue ?? v.name}/></label>)}</div><label className="mt-4 flex items-center gap-2 text-[10px] text-slate-600"><input type="checkbox" checked={automationPdf} onChange={e => setAutomationPdf(e.target.checked)}/>{text(ar,"Also generate PDF","إنشاء PDF أيضًا")}</label><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setAutomationOpen(false)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">{text(ar,"Cancel","إلغاء")}</button><button type="button" disabled={automationBusy} onClick={() => void generateDocument()} className="rounded-lg bg-[var(--wd-primary)] px-3 py-2 text-xs font-medium text-white disabled:opacity-50">{automationBusy ? text(ar,"Generating…","جارٍ الإنشاء…") : text(ar,"Generate","إنشاء")}</button></div></div></div>}
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">{text(ar, "Document Automation", "أتمتة المستندات")}</h2><p className="mt-1 text-[11px] text-slate-500">{text(ar, "Validate variables, generate a document from the active template version and review previous runs.", "تحقق من المتغيرات وأنشئ مستندًا من إصدار القالب النشط وراجع عمليات الإنشاء السابقة.")}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] text-slate-600">{automationRuns.length} {text(ar,"runs","عمليات")}</span></div>
      {automationMessage && <div className="mt-3 rounded-lg bg-emerald-50 p-3 text-[10px] text-emerald-700">{automationMessage}</div>}
      {automationError && <div className="mt-3 rounded-lg bg-red-50 p-3 text-[10px] text-red-700">{automationError}</div>}
      <div className="mt-4 divide-y divide-slate-100">{automationRuns.slice(0,5).map((run) => <div key={run.id} className="flex items-center gap-3 py-3 text-[10px]"><span className={`rounded-full px-2 py-1 ${run.status === 'SUCCEEDED' ? 'bg-emerald-50 text-emerald-700' : run.status === 'FAILED' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{run.status}</span><span className="min-w-0 flex-1 truncate font-medium">{run.name}</span><span className="text-slate-400">{new Date(run.createdAt).toLocaleString()}</span></div>)}</div>
    </section>

    {variablesOpen && <TemplateVariablesPanel templateId={templateId} ar={ar} canManage={Boolean(template.permissions.canManage)} onClose={() => { setVariablesOpen(false); void load(); }} />}
  </div>;
}
