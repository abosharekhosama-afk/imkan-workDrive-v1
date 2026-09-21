"use client";

import { useCallback, useEffect, useState } from "react";
import type React from "react";
import { useParams, useRouter } from "next/navigation";
import { useLocale } from "@/components/locale-provider";
import { getTemplate, getTemplateBuilder, listTemplateVariables, saveTemplateBuilder, publishTemplateBuilder, unpublishTemplateBuilder, type TemplateBuilderConfig, type TemplateBuilderState, type TemplateVariable } from "@/lib/api/templates";

const text = (ar: boolean, en: string, value: string) => ar ? value : en;
const id = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;

const blank = (): TemplateBuilderConfig => ({
  version: 1,
  fields: [], sections: [], tables: [], images: [], rules: [],
  branding: { companyName: "", logoFileId: "", primaryColor: "", secondaryColor: "", fontFamily: "" },
  header: { enabled: false, content: "", align: "left" },
  footer: { enabled: false, content: "", align: "left" },
  preview: { mode: "DESKTOP" },
});

export default function TemplateBuilderPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const templateId = params.id;
  const [template, setTemplate] = useState<Awaited<ReturnType<typeof getTemplate>> | null>(null);
  const [variables, setVariables] = useState<TemplateVariable[]>([]);
  const [state, setState] = useState<TemplateBuilderState | null>(null);
  const [config, setConfig] = useState<TemplateBuilderConfig>(blank());
  const [tab, setTab] = useState<"fields"|"sections"|"tables"|"images"|"branding"|"header"|"footer"|"rules"|"preview">("fields");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [t, b, v] = await Promise.all([getTemplate(templateId), getTemplateBuilder(templateId), listTemplateVariables(templateId)]);
      setTemplate(t); setState(b); setConfig(b.draft); setVariables(v);
    } catch (e) { setError(e instanceof Error ? e.message : text(ar, "Unable to load builder.", "تعذر تحميل منشئ القالب.")); }
    finally { setLoading(false); }
  }, [templateId, ar]);

  useEffect(() => { void load(); }, [load]);

  const patch = (fn: (draft: TemplateBuilderConfig) => void) => setConfig((current) => { const next = structuredClone(current); fn(next); return next; });
  const save = async () => {
    setBusy(true); setError(""); setMessage("");
    try { const next = await saveTemplateBuilder(templateId, config); setState(next); setConfig(next.draft); setMessage(text(ar, "Draft saved.", "تم حفظ المسودة.")); }
    catch (e) { setError(e instanceof Error ? e.message : text(ar, "Unable to save draft.", "تعذر حفظ المسودة.")); }
    finally { setBusy(false); }
  };
  const publish = async () => {
    setBusy(true); setError(""); setMessage("");
    try { await saveTemplateBuilder(templateId, config); const next = await publishTemplateBuilder(templateId); setState(next); setConfig(next.draft); setMessage(text(ar, "Builder published.", "تم نشر منشئ القالب.")); }
    catch (e) { setError(e instanceof Error ? e.message : text(ar, "Unable to publish builder.", "تعذر نشر منشئ القالب.")); }
    finally { setBusy(false); }
  };
  const unpublish = async () => {
    setBusy(true); setError("");
    try { const next = await unpublishTemplateBuilder(templateId); setState(next); setMessage(text(ar, "Published builder removed.", "تم إلغاء نشر المنشئ.")); }
    catch (e) { setError(e instanceof Error ? e.message : text(ar, "Unable to unpublish.", "تعذر إلغاء النشر.")); }
    finally { setBusy(false); }
  };

  const tabs = [
    ["fields", text(ar,"Fields","الحقول")], ["sections", text(ar,"Sections","الأقسام")], ["tables", text(ar,"Tables","الجداول")], ["images", text(ar,"Images","الصور")],
    ["branding", text(ar,"Branding","الهوية")], ["header", text(ar,"Header","الرأس")], ["footer", text(ar,"Footer","التذييل")], ["rules", text(ar,"Rules","القواعد")], ["preview", text(ar,"Preview","المعاينة")],
  ] as const;

  if (loading) return <div className="flex h-screen items-center justify-center text-sm text-slate-500">{text(ar,"Loading template builder…","جارٍ تحميل منشئ القالب…")}</div>;
  if (error && !template) return <div className="flex h-screen items-center justify-center p-6"><div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</div></div>;

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1500px] items-center gap-3 px-4 py-3">
        <button type="button" onClick={() => router.push("/files/templates")} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">← {text(ar,"Templates","القوالب")}</button>
        <button type="button" onClick={() => router.push(`/files/templates/studio/${templateId}`)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">{text(ar,"Studio","الاستوديو")}</button>
        <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{template?.name}</div><div className="text-[10px] text-slate-500">{text(ar,"Template Builder","منشئ القالب")} · {state?.publishedAt ? text(ar,"Published","منشور") : text(ar,"Draft","مسودة")}</div></div>
        {error && <span className="hidden max-w-[300px] truncate rounded-lg bg-red-50 px-3 py-2 text-[10px] text-red-600 md:block">{error}</span>}
        {message && <span className="hidden rounded-lg bg-emerald-50 px-3 py-2 text-[10px] text-emerald-700 md:block">{message}</span>}
        {state?.publishedAt && <button type="button" disabled={busy} onClick={() => void unpublish()} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">{text(ar,"Unpublish","إلغاء النشر")}</button>}
        <button type="button" disabled={busy || !state?.canEdit} onClick={() => void save()} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">{text(ar,"Save draft","حفظ المسودة")}</button>
        <button type="button" disabled={busy || !state?.canPublish} onClick={() => void publish()} className="rounded-lg bg-[var(--wd-primary)] px-3 py-2 text-xs font-medium text-white">{text(ar,"Publish","نشر")}</button>
      </div>
    </header>

    <div className="mx-auto grid max-w-[1500px] grid-cols-1 gap-4 p-4 lg:grid-cols-[190px_minmax(0,1fr)_330px]">
      <aside className="rounded-2xl border border-slate-200 bg-white p-2 lg:sticky lg:top-[78px] lg:h-[calc(100vh-94px)]">
        <div className="px-3 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{text(ar,"Builder","المنشئ")}</div>
        <div className="space-y-1">{tabs.map(([key,label]) => <button key={key} type="button" onClick={() => setTab(key as typeof tab)} className={`w-full rounded-xl px-3 py-2.5 text-left text-xs ${tab===key ? "bg-slate-100 font-semibold text-[var(--wd-primary)]" : "text-slate-600 hover:bg-slate-50"}`}>{label}</button>)}</div>
      </aside>

      <main className="min-h-[calc(100vh-94px)] rounded-2xl border border-slate-200 bg-white p-5">
        {tab === "fields" && <FieldsEditor ar={ar} config={config} variables={variables} patch={patch} />}
        {tab === "sections" && <SectionsEditor ar={ar} config={config} patch={patch} />}
        {tab === "tables" && <TablesEditor ar={ar} config={config} variables={variables} patch={patch} />}
        {tab === "images" && <ImagesEditor ar={ar} config={config} variables={variables} patch={patch} />}
        {tab === "branding" && <BrandingEditor ar={ar} config={config} patch={patch} />}
        {tab === "header" && <HeaderFooterEditor ar={ar} title={text(ar,"Header","الرأس")} value={config.header} patch={(v) => patch(d => { d.header = v; })} />}
        {tab === "footer" && <HeaderFooterEditor ar={ar} title={text(ar,"Footer","التذييل")} value={config.footer} patch={(v) => patch(d => { d.footer = v; })} />}
        {tab === "rules" && <RulesEditor ar={ar} config={config} variables={variables} patch={patch} />}
        {tab === "preview" && <PreviewCanvas ar={ar} config={config} variables={variables} templateName={template?.name || "Template"} />}
      </main>

      <aside className="hidden rounded-2xl border border-slate-200 bg-white p-4 lg:block lg:sticky lg:top-[78px] lg:h-[calc(100vh-94px)] lg:overflow-y-auto">
        <div className="text-sm font-semibold">{text(ar,"Builder summary","ملخص المنشئ")}</div>
        <div className="mt-3 grid grid-cols-2 gap-2">{[[config.fields.length,text(ar,"Fields","الحقول")],[config.sections.length,text(ar,"Sections","الأقسام")],[config.tables.length,text(ar,"Tables","الجداول")],[config.images.length,text(ar,"Images","الصور")],[config.rules.length,text(ar,"Rules","القواعد")],[variables.length,text(ar,"Variables","المتغيرات")]].map(([n,l])=><div key={String(l)} className="rounded-xl bg-slate-50 p-3"><div className="text-lg font-semibold">{n}</div><div className="text-[10px] text-slate-500">{l}</div></div>)}</div>
        <div className="mt-5 rounded-xl border border-slate-200 p-3 text-[11px] leading-5 text-slate-600">{text(ar,"The builder stores a structured template definition separately from the binary template version. Publishing records the current draft as the published definition.","يحفظ المنشئ تعريفًا منظمًا للقالب بشكل مستقل عن نسخة الملف الثنائية. النشر يعتمد المسودة الحالية كتعريف منشور.")}</div>
        <div className="mt-4 text-[10px] text-slate-400">{state?.publishedAt ? `${text(ar,"Published","منشور")}: ${new Date(state.publishedAt).toLocaleString(ar ? "ar" : "en")}` : text(ar,"Not published yet","لم يتم النشر بعد")}</div>
      </aside>
    </div>
  </div>;
}

function SectionTitle({ ar, title, description, action }: { ar:boolean; title:string; description:string; action?:React.ReactNode }) { return <div className="mb-5 flex items-start justify-between gap-3"><div><h1 className="text-lg font-semibold">{title}</h1><p className="mt-1 text-xs leading-5 text-slate-500">{description}</p></div>{action}</div>; }
const Btn = ({children,onClick}: {children:React.ReactNode;onClick:()=>void}) => <button type="button" onClick={onClick} className="rounded-lg bg-[var(--wd-primary)] px-3 py-2 text-[11px] font-medium text-white">{children}</button>;

function FieldsEditor({ar,config,variables,patch}:{ar:boolean;config:TemplateBuilderConfig;variables:TemplateVariable[];patch:(fn:(d:TemplateBuilderConfig)=>void)=>void}) {
  const add=()=>patch(d=>d.fields.push({id:id("field"),kind:"text",label:text(ar,"New field","حقل جديد"),variableId:variables[0]?.id||null,sectionId:d.sections[0]?.id||null,required:false,position:d.fields.length}));
  return <><SectionTitle ar={ar} title={text(ar,"Fields","الحقول")} description={text(ar,"Define the visual fields used by the template and bind them to Phase 33 variables.","عرّف الحقول المرئية للقالب واربطها بمتغيرات Phase 33.")} action={<Btn onClick={add}>{text(ar,"Add field","إضافة حقل")}</Btn>} />
    {config.fields.length===0?<Empty ar={ar} text={text(ar,"No fields yet.","لا توجد حقول بعد.")} />:<div className="space-y-3">{config.fields.map((f,i)=><div key={f.id} className="rounded-2xl border border-slate-200 p-4"><div className="grid gap-3 md:grid-cols-2"><label className="text-xs">{text(ar,"Label","العنوان")}<input value={String(f.label||"")} onChange={e=>patch(d=>{d.fields[i].label=e.target.value})} className="mt-1 w-full rounded-lg border px-3 py-2 text-xs" /></label><label className="text-xs">{text(ar,"Kind","النوع")}<select value={String(f.kind||"text")} onChange={e=>patch(d=>{d.fields[i].kind=e.target.value})} className="mt-1 w-full rounded-lg border px-3 py-2 text-xs"><option value="text">Text</option><option value="textarea">Long text</option><option value="number">Number</option><option value="date">Date</option><option value="checkbox">Checkbox</option><option value="image">Image</option><option value="signature">Signature</option></select></label><label className="text-xs">{text(ar,"Variable","المتغير")}<select value={String(f.variableId||"")} onChange={e=>patch(d=>{d.fields[i].variableId=e.target.value||null})} className="mt-1 w-full rounded-lg border px-3 py-2 text-xs"><option value="">{text(ar,"No binding","بدون ربط")}</option>{variables.map(v=><option key={v.id} value={v.id}>{v.label} · {`{{${v.name}}}`}</option>)}</select></label><label className="text-xs">{text(ar,"Section","القسم")}<select value={String(f.sectionId||"")} onChange={e=>patch(d=>{d.fields[i].sectionId=e.target.value||null})} className="mt-1 w-full rounded-lg border px-3 py-2 text-xs"><option value="">{text(ar,"Root","الجذر")}</option>{config.sections.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label></div><div className="mt-3 flex items-center justify-between"><label className="flex items-center gap-2 text-[11px]"><input type="checkbox" checked={Boolean(f.required)} onChange={e=>patch(d=>{d.fields[i].required=e.target.checked})}/>{text(ar,"Required","مطلوب")}</label><button type="button" onClick={()=>patch(d=>d.fields.splice(i,1))} className="rounded-lg border border-red-200 px-3 py-1.5 text-[10px] text-red-600">{text(ar,"Remove","حذف")}</button></div></div>)}</div>}
  </>;
}

function SectionsEditor({ar,config,patch}:{ar:boolean;config:TemplateBuilderConfig;patch:(fn:(d:TemplateBuilderConfig)=>void)=>void}) { return <><SectionTitle ar={ar} title={text(ar,"Sections","الأقسام")} description={text(ar,"Create reusable layout sections for grouping fields and content.","أنشئ أقسامًا لتجميع الحقول والمحتوى وتحديد تخطيطها.")} action={<Btn onClick={()=>patch(d=>d.sections.push({id:id("section"),name:text(ar,"New section","قسم جديد"),description:"",layout:"single",position:d.sections.length}))}>{text(ar,"Add section","إضافة قسم")}</Btn>} />{config.sections.length===0?<Empty ar={ar} text={text(ar,"No sections yet.","لا توجد أقسام بعد.")}/>:<div className="space-y-3">{config.sections.map((s,i)=><div key={s.id} className="rounded-2xl border p-4"><div className="grid gap-3 md:grid-cols-2"><label className="text-xs">{text(ar,"Name","الاسم")}<input value={String(s.name||"")} onChange={e=>patch(d=>{d.sections[i].name=e.target.value})} className="mt-1 w-full rounded-lg border px-3 py-2 text-xs"/></label><label className="text-xs">{text(ar,"Layout","التخطيط")}<select value={String(s.layout||"single")} onChange={e=>patch(d=>{d.sections[i].layout=e.target.value})} className="mt-1 w-full rounded-lg border px-3 py-2 text-xs"><option value="single">Single column</option><option value="two-column">Two columns</option><option value="three-column">Three columns</option></select></label></div><textarea value={String(s.description||"")} onChange={e=>patch(d=>{d.sections[i].description=e.target.value})} placeholder={text(ar,"Description","الوصف")} className="mt-3 w-full rounded-lg border px-3 py-2 text-xs"/><div className="mt-3 flex justify-end"><button type="button" onClick={()=>patch(d=>d.sections.splice(i,1))} className="rounded-lg border border-red-200 px-3 py-1.5 text-[10px] text-red-600">{text(ar,"Remove","حذف")}</button></div></div>)}</div>}</> }

function TablesEditor({ar,config,variables,patch}:{ar:boolean;config:TemplateBuilderConfig;variables:TemplateVariable[];patch:(fn:(d:TemplateBuilderConfig)=>void)=>void}) { const add=()=>patch(d=>d.tables.push({id:id("table"),name:text(ar,"New table","جدول جديد"),columns:[{id:id("column"),label:text(ar,"Column 1","العمود 1"),type:"TEXT",variableId:variables[0]?.id||null}],position:d.tables.length})); return <><SectionTitle ar={ar} title={text(ar,"Tables","الجداول")} description={text(ar,"Define repeatable table structures and optional variable bindings.","عرّف هياكل الجداول القابلة للتكرار واربط أعمدتها بالمتغيرات عند الحاجة.")} action={<Btn onClick={add}>{text(ar,"Add table","إضافة جدول")}</Btn>}/>{config.tables.length===0?<Empty ar={ar} text={text(ar,"No tables yet.","لا توجد جداول بعد.")}/>:<div className="space-y-4">{config.tables.map((t,i)=><div key={t.id} className="rounded-2xl border p-4"><div className="flex items-center gap-2"><input value={t.name} onChange={e=>patch(d=>{d.tables[i].name=e.target.value})} className="flex-1 rounded-lg border px-3 py-2 text-xs font-medium"/><button type="button" onClick={()=>patch(d=>d.tables.splice(i,1))} className="rounded-lg border border-red-200 px-3 py-2 text-[10px] text-red-600">{text(ar,"Remove","حذف")}</button></div><div className="mt-3 space-y-2">{t.columns.map((c,ci)=><div key={c.id} className="grid gap-2 md:grid-cols-[1fr_150px_1fr_auto]"><input value={c.label} onChange={e=>patch(d=>{d.tables[i].columns[ci].label=e.target.value})} className="rounded-lg border px-3 py-2 text-xs"/><select value={c.type||"TEXT"} onChange={e=>patch(d=>{d.tables[i].columns[ci].type=e.target.value})} className="rounded-lg border px-3 py-2 text-xs"><option>TEXT</option><option>NUMBER</option><option>DATE</option><option>CURRENCY</option></select><select value={c.variableId||""} onChange={e=>patch(d=>{d.tables[i].columns[ci].variableId=e.target.value||null})} className="rounded-lg border px-3 py-2 text-xs"><option value="">{text(ar,"No variable","بدون متغير")}</option>{variables.map(v=><option key={v.id} value={v.id}>{v.label}</option>)}</select><button type="button" onClick={()=>patch(d=>d.tables[i].columns.splice(ci,1))} className="rounded-lg border px-2 text-xs">×</button></div>)}<button type="button" onClick={()=>patch(d=>d.tables[i].columns.push({id:id("column"),label:text(ar,"New column","عمود جديد"),type:"TEXT",variableId:null}))} className="rounded-lg border px-3 py-2 text-[10px]">+ {text(ar,"Column","عمود")}</button></div></div>)}</div>}</> }

function ImagesEditor({ar,config,variables,patch}:{ar:boolean;config:TemplateBuilderConfig;variables:TemplateVariable[];patch:(fn:(d:TemplateBuilderConfig)=>void)=>void}) { return <><SectionTitle ar={ar} title={text(ar,"Images","الصور")} description={text(ar,"Add image blocks from a URL, WorkDrive file reference, or IMAGE variable.","أضف عناصر صور من رابط أو مرجع ملف في WorkDrive أو متغير من نوع IMAGE.")} action={<Btn onClick={()=>patch(d=>d.images.push({id:id("image"),name:text(ar,"New image","صورة جديدة"),sourceType:"URL",source:"",alt:"",position:d.images.length}))}>{text(ar,"Add image","إضافة صورة")}</Btn>}/>{config.images.length===0?<Empty ar={ar} text={text(ar,"No images yet.","لا توجد صور بعد.")}/>:<div className="space-y-3">{config.images.map((im,i)=><div key={im.id} className="rounded-2xl border p-4"><div className="grid gap-3 md:grid-cols-2"><input value={im.name} onChange={e=>patch(d=>{d.images[i].name=e.target.value})} className="rounded-lg border px-3 py-2 text-xs"/><select value={im.sourceType} onChange={e=>patch(d=>{d.images[i].sourceType=e.target.value})} className="rounded-lg border px-3 py-2 text-xs"><option>URL</option><option>FILE</option><option>VARIABLE</option></select><input value={im.source} onChange={e=>patch(d=>{d.images[i].source=e.target.value})} placeholder={im.sourceType==="VARIABLE"?text(ar,"Variable ID","معرف المتغير"):text(ar,"Source","المصدر")} className="rounded-lg border px-3 py-2 text-xs"/>{im.sourceType==="VARIABLE" && <select value={im.source} onChange={e=>patch(d=>{d.images[i].source=e.target.value})} className="rounded-lg border px-3 py-2 text-xs"><option value="">{text(ar,"Choose IMAGE variable","اختر متغير IMAGE")}</option>{variables.filter(v=>v.type==="IMAGE").map(v=><option key={v.id} value={v.id}>{v.label}</option>)}</select>}<input value={im.alt||""} onChange={e=>patch(d=>{d.images[i].alt=e.target.value})} placeholder="Alt" className="rounded-lg border px-3 py-2 text-xs"/></div><div className="mt-3 flex justify-end"><button type="button" onClick={()=>patch(d=>d.images.splice(i,1))} className="rounded-lg border border-red-200 px-3 py-1.5 text-[10px] text-red-600">{text(ar,"Remove","حذف")}</button></div></div>)}</div>}</> }

function BrandingEditor({ar,config,patch}:{ar:boolean;config:TemplateBuilderConfig;patch:(fn:(d:TemplateBuilderConfig)=>void)=>void}) { const b=config.branding; return <><SectionTitle ar={ar} title={text(ar,"Branding","الهوية") } description={text(ar,"Set the brand identity used by generated template layouts.","حدد الهوية البصرية التي يستخدمها تخطيط القالب.")}/><div className="grid gap-4 md:grid-cols-2">{[["companyName",text(ar,"Company name","اسم المؤسسة")],["logoFileId",text(ar,"Logo file ID","معرف ملف الشعار")],["primaryColor",text(ar,"Primary color","اللون الأساسي")],["secondaryColor",text(ar,"Secondary color","اللون الثانوي")],["fontFamily",text(ar,"Font family","الخط")]].map(([key,label])=><label key={key} className="text-xs">{label}<input value={String(b[key]||"")} onChange={e=>patch(d=>{d.branding[key]=e.target.value})} className="mt-1 w-full rounded-lg border px-3 py-2 text-xs"/></label>)}</div></> }

function HeaderFooterEditor({ar,title,value,patch}:{ar:boolean;title:string;value:{enabled:boolean;content:string;align:string;[key:string]:unknown};patch:(v:{enabled:boolean;content:string;align:string;[key:string]:unknown})=>void}) { return <><SectionTitle ar={ar} title={title} description={text(ar,"Configure reusable template header/footer content and alignment.","اضبط محتوى الرأس أو التذييل ومحاذاته.")}/><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={value.enabled} onChange={e=>patch({...value,enabled:e.target.checked})}/>{text(ar,"Enabled","مفعل")}</label><label className="mt-4 block text-xs">{text(ar,"Content","المحتوى")}<textarea value={value.content} onChange={e=>patch({...value,content:e.target.value})} className="mt-1 min-h-32 w-full rounded-lg border px-3 py-2 text-xs" placeholder="{{company_name}}"/></label><label className="mt-4 block text-xs">{text(ar,"Alignment","المحاذاة")}<select value={value.align} onChange={e=>patch({...value,align:e.target.value})} className="mt-1 w-full rounded-lg border px-3 py-2 text-xs"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label></> }

function RulesEditor({ar,config,variables,patch}:{ar:boolean;config:TemplateBuilderConfig;variables:TemplateVariable[];patch:(fn:(d:TemplateBuilderConfig)=>void)=>void}) { const add=()=>patch(d=>d.rules.push({id:id("rule"),name:text(ar,"New rule","قاعدة جديدة"),when:{variableId:variables[0]?.id||"",operator:"equals",value:""},action:{type:"SHOW_SECTION",targetId:d.sections[0]?.id||""}})); return <><SectionTitle ar={ar} title={text(ar,"Rules","القواعد")} description={text(ar,"Define conditional visibility and required-state rules for builder elements.","عرّف قواعد العرض الشرطي وحالات الإلزام لعناصر القالب.")} action={<Btn onClick={add}>{text(ar,"Add rule","إضافة قاعدة")}</Btn>}/>{config.rules.length===0?<Empty ar={ar} text={text(ar,"No rules yet.","لا توجد قواعد بعد.")}/>:<div className="space-y-3">{config.rules.map((r,i)=><div key={r.id} className="rounded-2xl border p-4"><input value={r.name} onChange={e=>patch(d=>{d.rules[i].name=e.target.value})} className="w-full rounded-lg border px-3 py-2 text-xs font-medium"/><div className="mt-3 grid gap-2 md:grid-cols-2"><select value={String(r.when.variableId||"")} onChange={e=>patch(d=>{d.rules[i].when.variableId=e.target.value})} className="rounded-lg border px-3 py-2 text-xs"><option value="">{text(ar,"Variable","المتغير")}</option>{variables.map(v=><option key={v.id} value={v.id}>{v.label}</option>)}</select><select value={String(r.when.operator||"equals")} onChange={e=>patch(d=>{d.rules[i].when.operator=e.target.value})} className="rounded-lg border px-3 py-2 text-xs"><option value="equals">Equals</option><option value="not_equals">Not equals</option><option value="contains">Contains</option><option value="is_empty">Is empty</option></select><input value={String(r.when.value||"")} onChange={e=>patch(d=>{d.rules[i].when.value=e.target.value})} placeholder={text(ar,"Condition value","قيمة الشرط")} className="rounded-lg border px-3 py-2 text-xs"/><select value={String(r.action.type||"SHOW_SECTION")} onChange={e=>patch(d=>{d.rules[i].action.type=e.target.value})} className="rounded-lg border px-3 py-2 text-xs"><option value="SHOW_SECTION">Show section</option><option value="HIDE_SECTION">Hide section</option><option value="REQUIRE_FIELD">Require field</option></select><select value={String(r.action.targetId||"")} onChange={e=>patch(d=>{d.rules[i].action.targetId=e.target.value})} className="rounded-lg border px-3 py-2 text-xs"><option value="">{text(ar,"Target","الهدف")}</option>{config.sections.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}{config.fields.map(f=><option key={f.id} value={f.id}>{String(f.label||f.id)}</option>)}</select></div><div className="mt-3 flex justify-end"><button type="button" onClick={()=>patch(d=>d.rules.splice(i,1))} className="rounded-lg border border-red-200 px-3 py-1.5 text-[10px] text-red-600">{text(ar,"Remove","حذف")}</button></div></div>)}</div>}</> }

function PreviewCanvas({ar,config,variables,templateName}:{ar:boolean;config:TemplateBuilderConfig;variables:TemplateVariable[];templateName:string}) { return <><SectionTitle ar={ar} title={text(ar,"Preview","المعاينة")} description={text(ar,"Preview the structured builder definition before publishing it.","عاين تعريف القالب المنظم قبل نشره.")}/><div className="mx-auto max-w-[820px] rounded-xl border border-slate-300 bg-white p-8 shadow-sm"><div className="border-b pb-4 text-center" style={{fontFamily:config.branding.fontFamily||undefined}}>{config.branding.companyName && <div className="text-xs font-semibold">{config.branding.companyName}</div>}{config.header.enabled && <div className="mt-2 text-[10px] text-slate-500">{config.header.content}</div>}<h2 className="mt-4 text-xl font-semibold">{templateName}</h2></div>{config.sections.map(s=><section key={s.id} className="mt-6 rounded-lg border border-dashed border-slate-300 p-4"><h3 className="text-sm font-semibold">{s.name}</h3>{s.description && <p className="mt-1 text-[10px] text-slate-500">{s.description}</p>}<div className={`mt-3 grid gap-3 ${s.layout==="three-column"?"md:grid-cols-3":s.layout==="two-column"?"md:grid-cols-2":"grid-cols-1"}`}>{config.fields.filter(f=>f.sectionId===s.id).map(f=><div key={f.id} className="rounded-lg bg-slate-50 p-3"><div className="text-[10px] text-slate-500">{f.label}</div><div className="mt-2 text-xs text-slate-700">{variables.find(v=>v.id===f.variableId)?.defaultValue || "Sample value"}</div></div>)}</div></section>)}{config.sections.length===0 && config.fields.map(f=><div key={f.id} className="mt-4 rounded-lg border p-3"><div className="text-[10px] text-slate-500">{f.label}</div><div className="mt-2 text-xs">{variables.find(v=>v.id===f.variableId)?.defaultValue || "Sample value"}</div></div>)}{config.tables.map(t=><div key={t.id} className="mt-6 overflow-hidden rounded-lg border"><div className="bg-slate-50 px-3 py-2 text-xs font-semibold">{t.name}</div><div className="grid" style={{gridTemplateColumns:`repeat(${Math.max(1,t.columns.length)},minmax(0,1fr))`}}>{t.columns.map(c=><div key={c.id} className="border-t border-r p-2 text-[10px]">{c.label}</div>)}</div></div>)}{config.images.map(im=><div key={im.id} className="mt-6 text-center">{im.sourceType==="URL" && im.source ? <img src={im.source} alt={im.alt||im.name} className="mx-auto max-h-48 max-w-full object-contain"/>:<div className="rounded-lg bg-slate-100 p-8 text-[10px] text-slate-500">{im.name}</div>}</div>)}{config.footer.enabled && <div className="mt-8 border-t pt-4 text-center text-[10px] text-slate-500">{config.footer.content}</div>}</div></> }

function Empty({text}:{ar:boolean;text:string}) { return <div className="rounded-2xl border border-dashed border-slate-300 p-12 text-center text-xs text-slate-500">{text}</div>; }
