"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLocale } from "@/components/locale-provider";
import { Icons } from "@/components/layout/icons";
import { listGroups, listOrganizationMembers, type GroupOption, type OrgMember } from "@/lib/api/organization";
import { getDataTemplate, updateDataTemplate, type DataTemplate, type DataTemplateField } from "@/lib/api/metadata";
import { ImkanOptionPicker } from "@/components/imkan-option-picker";

const FIELD_TYPES: Array<{ value: DataTemplateField["type"]; en: string; ar: string; icon: keyof typeof Icons }> = [
  { value: "text", en: "Single line text", ar: "نص سطر واحد", icon: "doc" },
  { value: "multiline", en: "Multi-line text", ar: "نص متعدد الأسطر", icon: "list" },
  { value: "number", en: "Number", ar: "رقم", icon: "props" },
  { value: "datetime", en: "Date & time", ar: "تاريخ ووقت", icon: "clock" },
  { value: "date", en: "Date", ar: "تاريخ", icon: "clock" },
  { value: "boolean", en: "Yes/No", ar: "نعم/لا", icon: "check" },
  { value: "select", en: "Choice", ar: "اختيار", icon: "layout" },
  { value: "radio", en: "Radio", ar: "اختيارات", icon: "tag" },
  { value: "email", en: "Email address", ar: "بريد إلكتروني", icon: "link" },
];

function fieldLabel(type: DataTemplateField["type"], ar: boolean) { return FIELD_TYPES.find(x => x.value === type)?.[ar ? "ar" : "en"] || type; }
function FieldIcon({ type, size = 18 }: { type: DataTemplateField["type"]; size?: number }) {
  const icon = FIELD_TYPES.find(x => x.value === type)?.icon || "props";
  const Component = Icons[icon];
  return <Component size={size} />;
}
function makeKey(index: number) { return `field_${index + 1}`; }
function emptyField(index: number): DataTemplateField { return { key: makeKey(index), label: "", type: "text", required: false, searchable: true }; }

export default function DataTemplateEditorPage() {
  const params = useParams<{ templateId: string }>();
  const router = useRouter();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [template, setTemplate] = useState<DataTemplate | null>(null);
  const [fields, setFields] = useState<DataTemplateField[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<DataTemplateField | null>(null);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragType, setDragType] = useState<DataTemplateField["type"] | null>(null);
  const [settingsName, setSettingsName] = useState("");
  const [settingsDescription, setSettingsDescription] = useState("");
  const [settingsScope, setSettingsScope] = useState<"ALL_EDIT" | "SPECIFIC">("ALL_EDIT");
  const [settingsMembers, setSettingsMembers] = useState<string[]>([]);
  const [settingsGroups, setSettingsGroups] = useState<string[]>([]);

  async function load() {
    setLoading(true); setError("");
    try {
      const [t, ms, gs] = await Promise.all([getDataTemplate(params.templateId), listOrganizationMembers({ status: "ACTIVE" }), listGroups()]);
      setTemplate(t); setFields(t.fields || t.schema || []); setMembers(ms); setGroups(gs);
      setSettingsName(t.name); setSettingsDescription(t.description || ""); setSettingsScope(t.associationScope || "ALL_EDIT"); setSettingsMembers(t.allowedMemberIds || []); setSettingsGroups(t.allowedGroupIds || []);
    } catch (e: any) { setError(e?.message || (ar ? "تعذر تحميل قالب البيانات." : "Unable to load data template.")); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (params.templateId) void load(); }, [params.templateId]);

  const selectedCount = fields.length;
  const searchableCount = useMemo(() => fields.filter(f => f.searchable !== false).length, [fields]);

  function addField(type: DataTemplateField["type"]) {
    if (fields.length >= 150) return;
    const next = emptyField(fields.length);
    next.type = type;
    // Guarantee a stable key and never derive it from the visible label.
    const used = new Set(fields.map(f => f.key));
    let n = fields.length + 1;
    while (used.has(`field_${n}`)) n += 1;
    next.key = `field_${n}`;
    setEditing(next); setEditIndex(null);
  }

  function openEdit(index: number) { setEditIndex(index); setEditing({ ...fields[index] }); }
  function deleteField(index: number) { const key = fields[index]?.key; setFields(prev => prev.filter((_, i) => i !== index)); if (expanded === key) setExpanded(null); }
  function updateField(index: number, patch: Partial<DataTemplateField>) { setFields(prev => prev.map((f, i) => i === index ? { ...f, ...patch } : f)); }

  function dropField(targetIndex: number) {
    if (dragType) {
      addField(dragType);
      setDragType(null);
      return;
    }
    if (dragIndex === null || dragIndex === targetIndex) return;
    setFields(prev => { const next = [...prev]; const [item] = next.splice(dragIndex, 1); next.splice(targetIndex, 0, item); return next; });
    setDragIndex(null);
  }

  async function saveFields(nextFields = fields): Promise<boolean> {
    if (!template || saving) return false;
    const normalized = nextFields.map((f, index) => ({ ...f, key: f.key || makeKey(index), label: f.label.trim() || (ar ? `حقل ${index + 1}` : `Field ${index + 1}`), options: ["select", "radio"].includes(f.type) ? (f.options || []).filter(Boolean) : undefined }));
    const duplicateLabels = new Set<string>();
    for (const field of normalized) {
      const labelKey = field.label.trim().toLocaleLowerCase();
      if (duplicateLabels.has(labelKey)) { setError(ar ? `اسم الحقل مكرر: ${field.label}` : `Duplicate field name: ${field.label}`); return false; }
      duplicateLabels.add(labelKey);
    }
    setSaving(true); setError("");
    try {
      const updated = await updateDataTemplate(template.id, { name: template.name, description: template.description || "", schema: normalized, associationScope: template.associationScope, allowedMemberIds: template.allowedMemberIds || [], allowedGroupIds: template.allowedGroupIds || [] });
      setTemplate(updated); setFields(updated.fields || updated.schema || normalized); setNotice(ar ? "تم حفظ الحقول." : "Custom fields saved.");
      return true;
    } catch (e: any) { setError(e?.message || (ar ? "تعذر حفظ الحقول." : "Unable to save custom fields.")); return false; }
    finally { setSaving(false); }
  }

  async function saveSettings() {
    if (!template || saving || !settingsName.trim()) return;
    setSaving(true); setError("");
    try {
      const updated = await updateDataTemplate(template.id, { name: settingsName.trim(), description: settingsDescription.trim(), schema: fields, associationScope: settingsScope, allowedMemberIds: settingsScope === "SPECIFIC" ? settingsMembers : [], allowedGroupIds: settingsScope === "SPECIFIC" ? settingsGroups : [] });
      setTemplate(updated); setFields(updated.fields || updated.schema || fields); setSettingsOpen(false); setNotice(ar ? "تم تحديث إعدادات القالب." : "Template settings updated.");
    } catch (e: any) { setError(e?.message || (ar ? "تعذر تحديث الإعدادات." : "Unable to update template settings.")); }
    finally { setSaving(false); }
  }

  async function applyEditing() {
    if (editIndex === null || !editing) return;
    const candidate = { ...editing, label: editing.label.trim() };
    if (!candidate.label) { setError(ar ? "اسم الحقل مطلوب." : "Field name is required."); return; }
    if (["select", "radio"].includes(candidate.type) && !(candidate.options || []).length) { setError(ar ? "أضف خيارًا واحدًا على الأقل." : "Add at least one choice."); return; }
    const next = editIndex === null ? [...fields, candidate] : fields.map((f, i) => i === editIndex ? candidate : f);
    setFields(next); setError("");
    const ok = await saveFields(next);
    if (ok) { setEditing(null); setEditIndex(null); }
  }

  if (loading) return <main className="flex h-full items-center justify-center bg-[#f7f8fa] text-[12px] text-slate-500">{ar ? "جارٍ تحميل القالب…" : "Loading data template…"}</main>;
  if (!template) return <main className="flex h-full items-center justify-center bg-[#f7f8fa] text-[12px] text-red-600">{error || "Data template not found"}</main>;

  return <main className="flex h-full min-h-0 flex-col overflow-hidden bg-[#f7f8fa]" dir={ar ? "rtl" : "ltr"}>
    <header className="shrink-0 border-b border-slate-200 bg-white">
      <div className="flex items-center gap-3 px-5 py-3"><button onClick={()=>router.push("/admin/data-templates")} className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><Icons.chevR size={16} className={ar ? "rotate-180" : ""}/></button><div className="min-w-0 flex-1"><h1 className="truncate text-[16px] font-semibold text-slate-950">{template.name}</h1><p className="text-[10px] text-slate-500">{ar ? "الحقول المخصصة" : "Custom Fields"}</p></div><div className="hidden items-center gap-4 text-[10px] text-slate-500 md:flex"><span>{selectedCount}/150 {ar ? "حقول" : "fields"}</span><span>{searchableCount} {ar ? "قابلة للبحث" : "searchable"}</span></div><button onClick={()=>setSettingsOpen(true)} className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"><Icons.gear size={14}/>{ar ? "Edit Data Template" : "Edit Data Template"}</button><button onClick={()=>void saveFields()} disabled={saving} className="h-9 rounded-lg bg-[#2c66dd] px-4 text-[11px] font-semibold text-white disabled:opacity-50">{saving ? (ar ? "جارٍ الحفظ…" : "Saving…") : (ar ? "حفظ" : "Save")}</button></div>
    </header>

    <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="min-h-0 overflow-y-auto border-e border-slate-200 bg-white p-5">
        <div><h2 className="text-[14px] font-semibold text-slate-900">{ar ? "الحقول المخصصة" : "Custom Fields"}</h2><p className="mt-1 text-[10px] leading-5 text-slate-500">{ar ? "اسحب الحقل إلى مساحة العمل أو اضغط + لإضافته." : "Drag a field into the workspace or click + to add it."}</p></div>
        <div className="mt-5 space-y-2">{FIELD_TYPES.map((type) => { const Component = Icons[type.icon]; return <div key={type.value} draggable onDragStart={()=>{ setDragType(type.value); setDragIndex(null); }} onDragEnd={()=>setDragType(null)} className="flex items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-white px-3 py-3 hover:border-[#aac3f8] hover:bg-[#f7faff]"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500"><Component size={16}/></span><span className="min-w-0 flex-1 text-[11px] font-medium text-slate-700">{ar ? type.ar : type.en}</span><button onClick={()=>addField(type.value)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-[#edf3ff] hover:text-[#2c66dd]" title={ar ? "إضافة" : "Add"}><Icons.plus size={15}/></button></div>})}</div>
        <div className="mt-6 rounded-xl bg-[#f7f8fa] p-4 text-[10px] leading-5 text-slate-500">{ar ? "يمكنك إضافة حتى 150 حقلًا. لا يتم تغيير نوع الحقل بعد إنشائه، ويمكن تعديل اسمه وخصائصه." : "You can add up to 150 fields. A field type cannot be changed after creation; its name and properties can be edited."}</div>
      </aside>

      <section className="min-h-0 overflow-y-auto p-5 lg:p-8">
        <div className="mx-auto max-w-[1050px]">
          <div className="mb-5 flex items-end justify-between gap-4"><div><h2 className="text-[20px] font-semibold text-slate-950">{ar ? "Custom Fields" : "Custom Fields"}</h2><p className="mt-1 text-[11px] text-slate-500">{ar ? "أضف الحقول ورتبها واسحبها إلى الموضع المطلوب." : "Add fields, reorder them, and manage their properties."}</p></div><span className="rounded-full bg-white px-3 py-1.5 text-[10px] font-medium text-slate-500 shadow-sm">{selectedCount} / 150</span></div>
          <div className={`min-h-[420px] rounded-2xl border bg-white p-4 transition lg:p-5 ${dragType ? "border-[#2c66dd] bg-[#fbfdff]" : "border-slate-200"}`} onDragOver={(e)=>e.preventDefault()} onDrop={()=>{ if (dragType) { addField(dragType); setDragType(null); } }}>
            {fields.length === 0 ? <div className="flex min-h-[420px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-10 text-center"><div><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-slate-300 shadow-sm"><Icons.props size={25}/></span><h3 className="mt-4 text-[13px] font-semibold text-slate-700">{ar ? "أضف أول Custom Field" : "Add your first Custom Field"}</h3><p className="mx-auto mt-2 max-w-sm text-[11px] leading-5 text-slate-500">{ar ? "اسحب نوع الحقل من القائمة اليسرى إلى هنا أو اضغط +." : "Drag a field type from the left panel here, or click +."}</p></div></div> : <div className="space-y-3">
              {fields.map((field, index) => <div key={field.key} draggable onDragStart={()=>setDragIndex(index)} onDragOver={(e)=>e.preventDefault()} onDrop={(e)=>{e.stopPropagation(); dropField(index)}} onDragEnd={()=>setDragIndex(null)} className={`group relative rounded-xl border bg-white transition ${dragIndex === index ? "border-[#2c66dd] opacity-60" : "border-slate-200 hover:border-[#b8cdf6] hover:shadow-sm"}`}>
                <div className="flex min-h-[76px] items-center gap-3 px-4 py-3">
                  <span className="cursor-grab text-slate-300 group-hover:text-slate-500" title={ar ? "سحب لإعادة الترتيب" : "Drag to reorder"}><Icons.menu size={17}/></span>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#edf3ff] text-[#2c66dd]"><FieldIcon type={field.type} size={18}/></span>
                  <div className="min-w-0 flex-1"><div className="truncate text-[13px] font-semibold text-slate-900">{field.label || (ar ? "حقل بدون اسم" : "Unnamed field")}</div><div className="mt-1 text-[10px] text-slate-500">({fieldLabel(field.type, ar)}){field.required ? <span className="ms-2 rounded-full bg-red-50 px-1.5 py-0.5 text-red-600">{ar ? "مطلوب" : "Required"}</span> : null}{field.searchable !== false ? <span className="ms-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-slate-500">{ar ? "بحث" : "Search"}</span> : null}</div></div>
                  <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"><button onClick={()=>setExpanded(expanded===field.key?null:field.key)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" title={ar ? "تفاصيل" : "Details"}><Icons.chevD size={15} className={expanded===field.key?"rotate-180":""}/></button><button onClick={()=>openEdit(index)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" title={ar ? "تعديل" : "Edit"}><Icons.pencil size={14}/></button><button onClick={()=>deleteField(index)} className="flex h-8 w-8 items-center justify-center rounded-lg text-red-500 hover:bg-red-50" title={ar ? "حذف" : "Delete"}><Icons.trash size={14}/></button></div>
                </div>
                {expanded===field.key ? <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-4"><div className="grid gap-3 text-[10px] md:grid-cols-3"><div><span className="text-slate-400">{ar ? "المفتاح" : "Field key"}</span><div className="mt-1 font-mono text-slate-700">{field.key}</div></div><div><span className="text-slate-400">{ar ? "الوصف" : "Description"}</span><div className="mt-1 text-slate-700">{field.description || "—"}</div></div><div><span className="text-slate-400">{ar ? "القيمة الافتراضية" : "Default value"}</span><div className="mt-1 text-slate-700">{field.defaultValue === undefined || field.defaultValue === null || field.defaultValue === "" ? "—" : String(field.defaultValue)}</div></div></div></div> : null}
              </div>)}
            </div>}
            <button onClick={()=>addField("text")} disabled={fields.length >= 150} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#b8cdf6] bg-[#f8fbff] text-[11px] font-semibold text-[#2c66dd] hover:bg-[#f1f6ff] disabled:opacity-50"><Icons.plus size={15}/>{ar ? "إضافة Custom Field" : "Add Custom Field"}</button>
          </div>
          {error ? <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-[11px] text-red-600">{error}</div> : null}
          {notice ? <button onClick={()=>setNotice("")} className="mt-4 rounded-xl bg-slate-900 px-4 py-3 text-[11px] text-white">{notice}</button> : null}
        </div>
      </section>
    </div>

    {editing ? <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/35 p-4"><div className="max-h-[92vh] w-full max-w-[760px] overflow-hidden rounded-2xl bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5"><div><h3 className="text-[16px] font-semibold text-slate-950">{editIndex !== null && fields[editIndex]?.label ? (ar ? "Edit Custom Field" : "Edit Custom Field") : (ar ? "Create Custom Field" : "Create Custom Field")}</h3><p className="mt-1 text-[10px] text-slate-500">{ar ? "أدخل خصائص الحقل ثم احفظه." : "Configure the field properties and save."}</p></div><button onClick={()=>{setEditing(null);setEditIndex(null)}} className="rounded-lg p-2 text-slate-400 hover:bg-slate-50"><Icons.x size={17}/></button></div>
      <div className="max-h-[calc(92vh-145px)] overflow-y-auto p-6">
        <div className="grid gap-4 md:grid-cols-2"><label><span className="mb-1.5 block text-[10px] font-semibold text-slate-600">{ar ? "اسم الحقل" : "Field name"}</span><input value={editing.label} onChange={e=>setEditing(v=>v?{...v,label:e.target.value}:v)} maxLength={50} placeholder={ar ? "اسم الحقل" : "Enter field name"} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-[11px] outline-none focus:border-[#2c66dd]"/></label><label><span className="mb-1.5 block text-[10px] font-semibold text-slate-600">{ar ? "نوع الحقل" : "Field type"}</span><div className="mt-0"><ImkanOptionPicker value={editing.type} onChange={(next) => { if (next) setEditing(v => v ? { ...v, type: next } : v); }} options={FIELD_TYPES.map(t => ({ value: t.value, label: ar ? t.ar : t.en }))} ariaLabel={ar ? "نوع الحقل" : "Field type"} fullWidth disabled={editIndex !== null && !!fields[editIndex]} /></div></label></div>
        <label className="mt-4 block"><span className="mb-1.5 block text-[10px] font-semibold text-slate-600">{ar ? "وصف الحقل" : "Field description"}</span><textarea value={editing.description || ""} onChange={e=>setEditing(v=>v?{...v,description:e.target.value}:v)} maxLength={200} rows={3} placeholder={ar ? "أضف وصف الحقل" : "Add field description"} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[11px] outline-none focus:border-[#2c66dd]"/></label>
        {editing.type === "number" ? <div className="mt-4 grid gap-4 md:grid-cols-2"><label><span className="mb-1.5 block text-[10px] font-semibold text-slate-600">{ar ? "الحد الأدنى" : "Minimum value"}</span><input type="number" value={editing.min ?? ""} onChange={e=>setEditing(v=>v?{...v,min:e.target.value===""?undefined:Number(e.target.value)}:v)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-[11px]"/></label><label><span className="mb-1.5 block text-[10px] font-semibold text-slate-600">{ar ? "الحد الأقصى" : "Maximum value"}</span><input type="number" value={editing.max ?? ""} onChange={e=>setEditing(v=>v?{...v,max:e.target.value===""?undefined:Number(e.target.value)}:v)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-[11px]"/></label></div> : null}
        {editing.type === "text" ? <label className="mt-4 block"><span className="mb-1.5 block text-[10px] font-semibold text-slate-600">{ar ? "الحد الأقصى للأحرف" : "Maximum characters"}</span><input type="number" min={1} max={200} value={editing.maxLength ?? 200} onChange={e=>setEditing(v=>v?{...v,maxLength:Number(e.target.value)}:v)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-[11px]"/></label> : null}
        {editing.type === "multiline" ? <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-[10px] text-slate-500">{ar ? "الحد الأقصى للنص متعدد الأسطر: 2048 حرفًا." : "Multi-line text supports up to 2048 characters."}</div> : null}
        {["select", "radio"].includes(editing.type) ? <div className="mt-4"><label className="mb-1.5 block text-[10px] font-semibold text-slate-600">{ar ? "الخيارات" : "Choices"}</label><textarea value={(editing.options || []).join("\n")} onChange={e=>setEditing(v=>v?{...v,options:e.target.value.split(/\n|,/).map(x=>x.trim()).filter(Boolean).slice(0,100)}:v)} rows={5} placeholder={ar ? "خيار 1\nخيار 2" : "Option 1\nOption 2"} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[11px]"/></div> : null}
        <label className="mt-4 block"><span className="mb-1.5 block text-[10px] font-semibold text-slate-600">{ar ? "القيمة الافتراضية" : "Default value"}</span><input value={editing.defaultValue == null ? "" : String(editing.defaultValue)} onChange={e=>setEditing(v=>v?{...v,defaultValue:e.target.value}:v)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-[11px]"/></label>
        <div className="mt-5 space-y-3"><label className="flex items-center gap-2 text-[11px] text-slate-700"><input type="checkbox" checked={!!editing.required} onChange={e=>setEditing(v=>v?{...v,required:e.target.checked}:v)}/>{ar ? "جعل هذا الحقل إلزاميًا" : "Make this custom field mandatory"}</label><label className="flex items-center gap-2 text-[11px] text-slate-700"><input type="checkbox" checked={editing.searchable !== false} onChange={e=>setEditing(v=>v?{...v,searchable:e.target.checked}:v)}/>{ar ? "تضمين هذا الحقل في مرشحات البحث" : "Include this custom field in search filters"}</label></div>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4"><button onClick={()=>{setEditing(null);setEditIndex(null)}} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-[11px]">{ar ? "إلغاء" : "Cancel"}</button><button onClick={applyEditing} className="h-9 rounded-lg bg-[#2c66dd] px-5 text-[11px] font-semibold text-white">{ar ? "حفظ الحقل" : "Save field"}</button></div>
    </div></div> : null}

    {settingsOpen ? <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/35 p-4"><div className="max-h-[92vh] w-full max-w-[680px] overflow-hidden rounded-2xl bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5"><div><h3 className="text-[16px] font-semibold">{ar ? "Edit Data Template" : "Edit Data Template"}</h3><p className="mt-1 text-[10px] text-slate-500">{ar ? "الاسم والوصف ومن يستطيع الارتباط بالقالب." : "Name, description, and who can associate this template."}</p></div><button onClick={()=>setSettingsOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-50"><Icons.x size={17}/></button></div>
      <div className="space-y-5 overflow-y-auto p-6"><div className="grid gap-4 md:grid-cols-2"><label><span className="mb-1.5 block text-[10px] font-semibold">{ar ? "اسم القالب" : "Template name"}</span><input value={settingsName} onChange={e=>setSettingsName(e.target.value)} maxLength={50} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-[11px]"/></label><label><span className="mb-1.5 block text-[10px] font-semibold">{ar ? "الوصف" : "Description"}</span><input value={settingsDescription} onChange={e=>setSettingsDescription(e.target.value)} maxLength={200} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-[11px]"/></label></div><div><h4 className="text-[11px] font-semibold">{ar ? "Who can associate" : "Who can associate"}</h4><div className="mt-2 grid gap-2 md:grid-cols-2"><label className="rounded-lg border p-3 text-[10px]"><input type="radio" checked={settingsScope === "ALL_EDIT"} onChange={()=>setSettingsScope("ALL_EDIT")} className="me-2"/>{ar ? "كل من لديه تعديل" : "All users with edit access"}</label><label className="rounded-lg border p-3 text-[10px]"><input type="radio" checked={settingsScope === "SPECIFIC"} onChange={()=>setSettingsScope("SPECIFIC")} className="me-2"/>{ar ? "أعضاء أو مجموعات محددة مع صلاحية تعديل" : "Specific members or groups with edit access"}</label></div></div>{settingsScope === "SPECIFIC" ? <div className="grid gap-4 md:grid-cols-2"><div className="max-h-40 overflow-y-auto rounded-lg border">{members.map(m=>{const id=m.userId||m.id;return <label key={id} className="flex items-center gap-2 border-b px-3 py-2 text-[10px]"><input type="checkbox" checked={settingsMembers.includes(id)} onChange={()=>setSettingsMembers(x=>x.includes(id)?x.filter(y=>y!==id):[...x,id])}/>{m.name||m.email}</label>})}</div><div className="max-h-40 overflow-y-auto rounded-lg border">{groups.map(g=><label key={g.id} className="flex items-center gap-2 border-b px-3 py-2 text-[10px]"><input type="checkbox" checked={settingsGroups.includes(g.id)} onChange={()=>setSettingsGroups(x=>x.includes(g.id)?x.filter(y=>y!==g.id):[...x,g.id])}/>{g.name}</label>)}</div></div> : null}</div>
      <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4"><button onClick={()=>setSettingsOpen(false)} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-[11px]">{ar ? "إلغاء" : "Cancel"}</button><button onClick={()=>void saveSettings()} disabled={saving || !settingsName.trim() || (settingsScope === "SPECIFIC" && !settingsMembers.length && !settingsGroups.length)} className="h-9 rounded-lg bg-[#2c66dd] px-5 text-[11px] font-semibold text-white disabled:opacity-50">{saving ? "..." : (ar ? "حفظ" : "Save")}</button></div>
    </div></div> : null}
  </main>;
}
