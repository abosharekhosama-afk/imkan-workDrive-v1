"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/locale-provider";
import { useConfirmAction } from "@/components/confirm-action-modal";
import { Icons } from "@/components/layout/icons";
import { listGroups, listOrganizationMembers, type GroupOption, type OrgMember } from "@/lib/api/organization";
import { createDataTemplate, deleteDataTemplate, listDataTemplates, updateDataTemplate, type DataTemplate } from "@/lib/api/metadata";
import { ImkanOptionPicker } from "@/components/imkan-option-picker";

export default function DataTemplatesAdminPage() {
  const router = useRouter();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const { requestConfirm, confirmModal } = useConfirmAction();
  const [templates, setTemplates] = useState<DataTemplate[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"ALL" | "ACTIVE" | "DISABLED">("ALL");
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<"ALL_EDIT" | "SPECIFIC">("ALL_EDIT");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>([]);

  async function load() {
    try {
      const [ts, ms, gs] = await Promise.all([listDataTemplates(true), listOrganizationMembers({ status: "ACTIVE" }), listGroups()]);
      setTemplates(ts);
      setMembers(ms);
      setGroups(gs);
    } catch (e: any) {
      setError(e?.message || (ar ? "تعذر تحميل قوالب البيانات." : "Unable to load data templates."));
    }
  }
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => templates.filter((t) =>
    (status === "ALL" || (status === "ACTIVE" ? t.active : !t.active)) &&
    `${t.name} ${t.description || ""}`.toLowerCase().includes(query.trim().toLowerCase())
  ), [templates, query, status]);

  function openCreate() {
    setName(""); setDescription(""); setScope("ALL_EDIT"); setMemberIds([]); setGroupIds([]); setError(""); setCreateOpen(true);
  }

  async function create() {
    if (!name.trim() || saving) return;
    setSaving(true); setError("");
    try {
      const created = await createDataTemplate({
        name: name.trim(), description: description.trim(), schema: [],
        associationScope: scope,
        allowedMemberIds: scope === "SPECIFIC" ? memberIds : [],
        allowedGroupIds: scope === "SPECIFIC" ? groupIds : [],
      });
      setCreateOpen(false);
      router.push(`/admin/data-templates/${created.id}`);
    } catch (e: any) {
      setError(e?.message || (ar ? "تعذر إنشاء قالب البيانات." : "Unable to create the data template."));
    } finally { setSaving(false); }
  }

  async function toggle(t: DataTemplate) {
    try { await updateDataTemplate(t.id, { active: !t.active }); await load(); }
    catch (e: any) { setError(e?.message || "Unable to update template."); }
  }

  async function remove(t: DataTemplate) {
    const templateName = t.name;
    requestConfirm({
      title: ar ? "حذف القالب" : "Delete template",
      description: ar ? `حذف «${templateName}» نهائيًا؟` : `Permanently delete “${templateName}”?`,
      confirmLabel: ar ? "حذف" : "Delete",
      run: async () => { try { await deleteDataTemplate(t.id); await load(); }
    catch (e: any) { setError(e?.message || "Unable to delete template."); } },
    });
  }

  return <main className="h-full overflow-hidden bg-[#f7f8fa]" dir={ar ? "rtl" : "ltr"}>{confirmModal}
    <header className="border-b border-slate-200 bg-white px-7 py-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#2c66dd]">{ar ? "المؤسسة" : "Organization"}</div>
          <h1 className="mt-1 text-[22px] font-semibold text-slate-950">{ar ? "قوالب البيانات" : "Data Templates"}</h1>
          <p className="mt-1 text-[11px] text-slate-500">{ar ? "أنشئ قالبًا أولًا، ثم أضف الحقول المخصصة من محرر القالب." : "Create a template first, then add custom fields from its editor."}</p>
        </div>
        <button onClick={openCreate} className="flex h-10 items-center gap-2 rounded-lg bg-[#2c66dd] px-4 text-[11px] font-semibold text-white"><Icons.plus size={15}/>{ar ? "إنشاء قالب بيانات" : "Create Data Template"}</button>
      </div>
    </header>

    <div className="grid h-[calc(100%-104px)] grid-cols-1 overflow-hidden lg:grid-cols-[390px_minmax(0,1fr)]">
      <aside className="overflow-y-auto border-e border-slate-200 bg-white">
        <div className="sticky top-0 z-10 space-y-3 border-b border-slate-100 bg-white p-4">
          <div className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3"><Icons.search size={15}/><input value={query} onChange={(e)=>setQuery(e.target.value)} className="min-w-0 flex-1 text-[11px] outline-none" placeholder={ar ? "البحث عن قالب" : "Search templates"}/></div>
          <ImkanOptionPicker
            value={status}
            onChange={(next) => { if (next) setStatus(next); }}
            ariaLabel={ar ? "تصفية القوالب" : "Filter templates"}
            fullWidth
            options={[
              { value: "ALL", label: ar ? "كل القوالب" : "All Data Templates" },
              { value: "ACTIVE", label: ar ? "النشطة" : "Active Data Templates" },
              { value: "DISABLED", label: ar ? "المعطلة" : "Disabled Data Templates" },
            ]}
          />
        </div>
        {filtered.map((t) => <div key={t.id} className="group flex items-center gap-3 border-b border-slate-100 p-4 hover:bg-slate-50">
          <button className="flex min-w-0 flex-1 items-center gap-3 text-start" onClick={() => router.push(`/admin/data-templates/${t.id}`)}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#edf3ff] text-[#315da8]"><Icons.props size={17}/></span>
            <span className="min-w-0 flex-1"><b className="block truncate text-[12px] text-slate-900">{t.name}</b><small className="mt-1 block text-[10px] text-slate-500">{t.fieldCount ?? (t.schema || []).length} {ar ? "حقول" : "fields"} · {t.active ? (ar ? "نشط" : "Active") : (ar ? "معطل" : "Disabled")}</small></span>
          </button>
          <button title={ar ? "تعديل" : "Edit"} onClick={() => router.push(`/admin/data-templates/${t.id}`)} className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-[#2c66dd]"><Icons.pencil size={14}/></button>
        </div>)}
        {!filtered.length ? <div className="p-10 text-center text-[11px] text-slate-400">{ar ? "لا توجد قوالب." : "No data templates."}</div> : null}
      </aside>

      <section className="min-w-0 overflow-y-auto p-6 lg:p-10">
        <div className="mx-auto max-w-[1000px] rounded-2xl border border-slate-200 bg-white p-8">
          <div className="flex items-start gap-4"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#edf3ff] text-[#2c66dd]"><Icons.props size={22}/></span><div><h2 className="text-[18px] font-semibold text-slate-950">{ar ? "إدارة Data Templates" : "Manage Data Templates"}</h2><p className="mt-2 max-w-2xl text-[12px] leading-6 text-slate-500">{ar ? "أنشئ القالب من بطاقة بسيطة، ثم استخدم محرر الحقول بالسحب والإفلات لإضافة خصائصك وإدارتها. هذا يطابق تدفق WorkDrive الموثق: إنشاء القالب ثم فتح صفحة الحقول المخصصة." : "Create the template from a focused card, then use the drag-and-drop field editor to build and manage its custom properties."}</p></div></div>
          <div className="mt-8 grid gap-4 md:grid-cols-3"><div className="rounded-xl bg-slate-50 p-5"><b className="block text-2xl">{templates.length}</b><span className="text-[10px] text-slate-500">{ar ? "إجمالي القوالب" : "Total templates"}</span></div><div className="rounded-xl bg-slate-50 p-5"><b className="block text-2xl">{templates.filter(t=>t.active).length}</b><span className="text-[10px] text-slate-500">{ar ? "القوالب النشطة" : "Active templates"}</span></div><div className="rounded-xl bg-slate-50 p-5"><b className="block text-2xl">150</b><span className="text-[10px] text-slate-500">{ar ? "الحد الأقصى للحقول/قالب" : "Max fields / template"}</span></div></div>
          <button onClick={openCreate} className="mt-8 inline-flex h-10 items-center gap-2 rounded-lg bg-[#2c66dd] px-4 text-[11px] font-semibold text-white"><Icons.plus size={15}/>{ar ? "إنشاء قالب جديد" : "Create a new template"}</button>
        </div>
      </section>
    </div>

    {createOpen ? <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/35 p-4">
      <div className="w-full max-w-[680px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" dir={ar ? "rtl" : "ltr"}>
        <div className="border-b border-slate-100 px-7 py-6"><div className="flex items-start justify-between gap-4"><div><h2 className="text-[18px] font-semibold text-slate-950">{ar ? "إنشاء قالب بيانات" : "Create Data Template"}</h2><p className="mt-1 text-[11px] text-slate-500">{ar ? "حتى 150 حقلًا مخصصًا مع التحكم في الارتباط." : "Up to 150 custom fields with association controls."}</p></div><button onClick={()=>setCreateOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-50"><Icons.x size={17}/></button></div></div>
        <div className="space-y-6 px-7 py-6">
          <div className="grid gap-4 md:grid-cols-2"><label><span className="mb-1.5 block text-[11px] font-semibold text-slate-700">{ar ? "اسم القالب" : "Template name"}</span><input autoFocus value={name} onChange={e=>setName(e.target.value)} maxLength={50} className="h-11 w-full rounded-lg border border-slate-200 px-3 text-[12px] outline-none focus:border-[#2c66dd]" /></label><label><span className="mb-1.5 block text-[11px] font-semibold text-slate-700">{ar ? "الوصف" : "Description"}</span><input value={description} onChange={e=>setDescription(e.target.value)} maxLength={200} className="h-11 w-full rounded-lg border border-slate-200 px-3 text-[12px] outline-none focus:border-[#2c66dd]" /></label></div>
          <div><h3 className="text-[12px] font-semibold text-slate-900">{ar ? "من يستطيع ربط القالب" : "Who can associate"}</h3><div className="mt-3 grid gap-3 md:grid-cols-2"><label className={`rounded-xl border p-4 ${scope === "ALL_EDIT" ? "border-[#2c66dd] bg-[#f5f8ff]" : "border-slate-200"}`}><input type="radio" checked={scope === "ALL_EDIT"} onChange={()=>setScope("ALL_EDIT")} className="me-2" />{ar ? "كل المستخدمين الذين لديهم صلاحية تعديل" : "All users with edit access"}</label><label className={`rounded-xl border p-4 ${scope === "SPECIFIC" ? "border-[#2c66dd] bg-[#f5f8ff]" : "border-slate-200"}`}><input type="radio" checked={scope === "SPECIFIC"} onChange={()=>setScope("SPECIFIC")} className="me-2" />{ar ? "أعضاء أو مجموعات محددة مع صلاحية تعديل" : "Specific members or groups with edit access"}</label></div></div>
          {scope === "SPECIFIC" ? <div className="grid gap-4 md:grid-cols-2"><div><div className="mb-2 text-[10px] font-semibold text-slate-600">{ar ? "الأعضاء" : "Members"}</div><div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200">{members.filter(m=>m.status === "ACTIVE").map(m=>{const id=m.userId||m.id; return <label key={id} className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5 text-[10px]"><input type="checkbox" checked={memberIds.includes(id)} onChange={()=>setMemberIds(x=>x.includes(id)?x.filter(y=>y!==id):[...x,id])}/><span className="truncate">{m.name || m.email} · {m.email}</span></label>})}</div></div><div><div className="mb-2 text-[10px] font-semibold text-slate-600">{ar ? "المجموعات" : "Groups"}</div><div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200">{groups.map(g=><label key={g.id} className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5 text-[10px]"><input type="checkbox" checked={groupIds.includes(g.id)} onChange={()=>setGroupIds(x=>x.includes(g.id)?x.filter(y=>y!==g.id):[...x,g.id])}/><span>{g.name} ({g.memberCount})</span></label>)}</div></div></div> : null}
          {error ? <div className="rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-600">{error}</div> : null}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-7 py-4"><button onClick={()=>setCreateOpen(false)} className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-[11px]">{ar ? "إلغاء" : "Cancel"}</button><button disabled={saving || !name.trim() || (scope === "SPECIFIC" && !memberIds.length && !groupIds.length)} onClick={()=>void create()} className="h-10 rounded-lg bg-[#2c66dd] px-5 text-[11px] font-semibold text-white disabled:opacity-50">{saving ? (ar ? "جارٍ الإنشاء..." : "Creating...") : (ar ? "إنشاء" : "Create")}</button></div>
      </div>
    </div> : null}
  </main>;
}
