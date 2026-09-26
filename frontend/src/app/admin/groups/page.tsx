"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale } from "@/components/locale-provider";
import { Icons } from "@/components/layout/icons";
import { listOrganizationMembers, listGroups, createGroup, getGroup, updateGroup, deleteGroup, addGroupMember, removeGroupMember, updateGroupMemberRole, type GroupSummary, type GroupDetails, type GroupMember, type OrgMember } from "@/lib/api/organization";

function initials(name?: string | null, email?: string | null) { return (name || email || "U").split(/\s+/).map((x) => x[0]).join("").slice(0, 2).toUpperCase(); }

export default function GroupsPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [selected, setSelected] = useState<GroupDetails | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [query, setQuery] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [modal, setModal] = useState<"create" | "edit" | "add" | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  async function loadGroups(selectId?: string) {
    setLoading(true);
    try {
      const data = await listGroups();
      setGroups(data);
      const id = selectId || selected?.id || data[0]?.id;
      if (id) setSelected(await getGroup(id)); else setSelected(null);
    } catch { setToast(ar ? "تعذر تحميل المجموعات." : "Unable to load groups."); }
    finally { setLoading(false); }
  }
  async function loadMembers() { try { setMembers(await listOrganizationMembers()); } catch { setMembers([]); } }
  useEffect(() => { void loadGroups(); void loadMembers(); }, []);

  const filtered = useMemo(() => groups.filter((g) => `${g.name} ${g.description || ""}`.toLowerCase().includes(query.trim().toLowerCase())), [groups, query]);
  const availableMembers = useMemo(() => {
    const existing = new Set((selected?.members || []).map((m) => m.userId));
    return members.filter((m) => m.status === "ACTIVE" && !existing.has(m.userId || "") && `${m.name || ""} ${m.email}`.toLowerCase().includes(memberQuery.trim().toLowerCase()));
  }, [members, selected, memberQuery]);

  function openCreate() { setName(""); setDescription(""); setModal("create"); }
  function openEdit() { if (!selected) return; setName(selected.name); setDescription(selected.description || ""); setModal("edit"); }
  async function saveGroup() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (modal === "create") { const created = await createGroup(name, description); setToast(ar ? "تم إنشاء المجموعة." : "Group created."); setModal(null); await loadGroups(created.id); }
      else if (modal === "edit" && selected) { await updateGroup(selected.id, { name, description }); setToast(ar ? "تم تحديث المجموعة." : "Group updated."); setModal(null); await loadGroups(selected.id); }
    } catch (e: any) { setToast(e?.message || (ar ? "تعذر حفظ المجموعة." : "Unable to save group.")); }
    finally { setSaving(false); }
  }
  async function removeSelected() {
    if (!selected) return;
    if (!window.confirm(ar ? `حذف المجموعة «${selected.name}»؟ سيتم إزالة صلاحياتها وعضويتها.` : `Delete “${selected.name}”? Its memberships and group permissions will be removed.`)) return;
    setSaving(true);
    try { await deleteGroup(selected.id); setToast(ar ? "تم حذف المجموعة." : "Group deleted."); setSelected(null); await loadGroups(); }
    catch (e: any) { setToast(e?.message || (ar ? "تعذر حذف المجموعة." : "Unable to delete group.")); }
    finally { setSaving(false); }
  }
  async function addMember(userId: string) {
    if (!selected) return; setSaving(true);
    try { await addGroupMember(selected.id, userId, "MEMBER"); setToast(ar ? "تمت إضافة العضو." : "Member added."); setSelected(await getGroup(selected.id)); setModal(null); }
    catch (e: any) { setToast(e?.message || (ar ? "تعذر إضافة العضو." : "Unable to add member.")); }
    finally { setSaving(false); }
  }
  async function changeRole(member: GroupMember, role: "ADMIN" | "MEMBER") {
    if (!selected) return; setSaving(true);
    try { await updateGroupMemberRole(selected.id, member.userId, role); setSelected(await getGroup(selected.id)); setToast(ar ? "تم تحديث دور العضو." : "Member role updated."); }
    catch (e: any) { setToast(e?.message || (ar ? "تعذر تحديث الدور." : "Unable to update role.")); }
    finally { setSaving(false); }
  }
  async function removeMember(member: GroupMember) {
    if (!selected) return;
    if (!window.confirm(ar ? `إزالة ${member.user.name || member.user.email} من المجموعة؟` : `Remove ${member.user.name || member.user.email} from this group?`)) return;
    setSaving(true);
    try { await removeGroupMember(selected.id, member.userId); setSelected(await getGroup(selected.id)); setToast(ar ? "تمت إزالة العضو." : "Member removed."); }
    catch (e: any) { setToast(e?.message || (ar ? "تعذر إزالة العضو." : "Unable to remove member.")); }
    finally { setSaving(false); }
  }

  return <main className="h-full overflow-hidden bg-[#f7f7f7]" dir={ar ? "rtl" : "ltr"}>
    <div className="border-b border-slate-200 bg-white px-7 py-4"><div className="flex items-center justify-between gap-4"><div><div className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#2c66dd]">{ar ? "المؤسسة" : "Organization"}</div><h1 className="mt-1 text-[22px] font-semibold text-slate-950">{ar ? "المجموعات" : "Groups"}</h1><p className="mt-1 text-[11px] text-slate-500">{ar ? "إدارة المجموعات والأعضاء والوصول الجماعي إلى الملفات." : "Manage groups, membership, and shared file access."}</p></div><button onClick={openCreate} className="flex h-9 items-center gap-2 rounded-lg bg-[#2c66dd] px-4 text-[11px] font-semibold text-white"><Icons.plus size={15}/>{ar ? "إنشاء مجموعة" : "Create Group"}</button></div></div>
    <div className="grid h-[calc(100%-86px)] grid-cols-1 overflow-hidden lg:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="overflow-y-auto border-e border-slate-200 bg-white"><div className="sticky top-0 z-10 border-b border-slate-100 bg-white p-4"><div className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3"><Icons.search size={15}/><input value={query} onChange={(e)=>setQuery(e.target.value)} className="min-w-0 flex-1 text-[11px] outline-none" placeholder={ar ? "البحث عن مجموعة" : "Search groups"}/></div></div>{loading ? <div className="p-6 text-center text-[11px] text-slate-400">{ar ? "جارٍ التحميل..." : "Loading..."}</div> : filtered.length ? <div className="p-2">{filtered.map(g => <button key={g.id} onClick={()=>void getGroup(g.id).then(setSelected)} className={`w-full rounded-xl p-4 text-start transition ${selected?.id===g.id ? "bg-[#edf3ff]" : "hover:bg-slate-50"}`}><div className="flex items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e9eefb] text-[#315da8]"><Icons.users size={17}/></span><span className="min-w-0 flex-1"><b className="block truncate text-[12px] text-slate-900">{g.name}</b><small className="mt-1 block truncate text-[10px] text-slate-500">{g.memberCount} {ar ? "عضو" : "members"}</small></span></div><p className="mt-3 truncate text-[10px] text-slate-500">{g.description || (ar ? "بدون وصف" : "No description")}</p></button>)}</div> : <div className="p-8 text-center text-[11px] text-slate-400">{ar ? "لا توجد مجموعات." : "No groups found."}</div>}</aside>
      <section className="min-w-0 overflow-y-auto">{selected ? <div className="mx-auto max-w-[1050px] p-6 lg:p-8"><div className="rounded-2xl border border-slate-200 bg-white"><div className="border-b border-slate-100 p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div className="flex min-w-0 items-center gap-4"><span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#edf3ff] text-[#315da8]"><Icons.users size={24}/></span><div className="min-w-0"><h2 className="truncate text-[20px] font-semibold text-slate-950">{selected.name}</h2><p className="mt-1 text-[11px] text-slate-500">{selected.description || (ar ? "لا يوجد وصف للمجموعة." : "No group description.")}</p></div></div><div className="flex items-center gap-2"><button onClick={openEdit} className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-[11px] font-semibold text-slate-700"><Icons.pencil size={14}/>{ar ? "تعديل" : "Edit"}</button><button disabled={saving} onClick={()=>void removeSelected()} className="flex h-9 items-center gap-2 rounded-lg border border-red-200 px-3 text-[11px] font-semibold text-red-600"><Icons.trash size={14}/>{ar ? "حذف" : "Delete"}</button></div></div><div className="mt-5 flex gap-5 text-[11px] text-slate-500"><span><b className="text-slate-900">{selected.members.length}</b> {ar ? "أعضاء" : "members"}</span><span>{ar ? "المنشئ:" : "Created by:"} {selected.createdById}</span></div></div>
      <div className="p-6"><div className="mb-4 flex items-center justify-between gap-3"><div><h3 className="text-[14px] font-semibold text-slate-900">{ar ? "أعضاء المجموعة" : "Group Members"}</h3><p className="mt-1 text-[10px] text-slate-500">{ar ? "مديرو المجموعة يمكنهم إدارة العضوية. يجب أن يبقى مدير واحد على الأقل." : "Group admins can manage membership. At least one group admin must remain."}</p></div><button onClick={()=>{setMemberQuery("");setModal("add")}} className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-[11px] font-semibold text-slate-700"><Icons.plus size={14}/>{ar ? "إضافة عضو" : "Add Member"}</button></div>{selected.members.length ? <div className="overflow-hidden rounded-xl border border-slate-200"><div className="grid grid-cols-[minmax(0,1fr)_130px_70px] border-b bg-slate-50 px-4 py-3 text-[10px] font-semibold text-slate-500"><span>{ar ? "العضو" : "Member"}</span><span>{ar ? "الدور" : "Role"}</span><span/></div>{selected.members.map(m=><div key={m.id} className="grid grid-cols-[minmax(0,1fr)_130px_70px] items-center border-b border-slate-100 px-4 py-3 last:border-b-0"><div className="flex min-w-0 items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[9px] font-semibold text-slate-600">{initials(m.user.name,m.user.email)}</span><span className="min-w-0"><b className="block truncate text-[11px] text-slate-800">{m.user.name || m.user.email}</b><small className="block truncate text-[10px] text-slate-500">{m.user.email}</small></span></div><select disabled={saving} value={m.role} onChange={e=>void changeRole(m,e.target.value as "ADMIN"|"MEMBER")} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-[10px] outline-none"><option value="ADMIN">{ar ? "مدير" : "Group Admin"}</option><option value="MEMBER">{ar ? "عضو" : "Member"}</option></select><button disabled={saving} onClick={()=>void removeMember(m)} className="ms-auto rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" title={ar ? "إزالة" : "Remove"}><Icons.x size={15}/></button></div>)}</div> : <div className="rounded-xl border border-dashed border-slate-200 p-10 text-center text-[11px] text-slate-400">{ar ? "لا يوجد أعضاء في هذه المجموعة." : "This group has no members."}</div>}</div></div></div> : <div className="flex h-full items-center justify-center p-8"><div className="max-w-sm text-center"><span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-slate-300 shadow-sm"><Icons.users size={28}/></span><h2 className="mt-4 text-[15px] font-semibold text-slate-800">{ar ? "اختر مجموعة" : "Select a group"}</h2><p className="mt-2 text-[11px] text-slate-500">{ar ? "اختر مجموعة لإدارة أعضائها وإعداداتها." : "Select a group to manage its members and settings."}</p></div></div>}</section>
    </div>
    {modal ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"><div className="w-full max-w-[520px] rounded-2xl bg-white shadow-2xl" dir={ar?"rtl":"ltr"}>{modal === "add" ? <><div className="flex items-center justify-between border-b p-5"><div><h3 className="text-[15px] font-semibold">{ar?"إضافة عضو إلى المجموعة":"Add member to group"}</h3><p className="mt-1 text-[10px] text-slate-500">{selected?.name}</p></div><button onClick={()=>setModal(null)}><Icons.x size={18}/></button></div><div className="p-5"><div className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3"><Icons.search size={14}/><input value={memberQuery} onChange={e=>setMemberQuery(e.target.value)} className="min-w-0 flex-1 text-[11px] outline-none" placeholder={ar?"البحث عن عضو":"Search members"}/></div><div className="mt-3 max-h-[360px] overflow-y-auto">{availableMembers.length ? availableMembers.map(m=><button key={m.userId} onClick={()=>void addMember(m.userId!)} disabled={saving} className="flex w-full items-center gap-3 rounded-xl p-3 text-start hover:bg-slate-50"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-[9px] font-semibold">{initials(m.name,m.email)}</span><span className="min-w-0 flex-1"><b className="block truncate text-[11px]">{m.name || m.email}</b><small className="block truncate text-[10px] text-slate-500">{m.email}</small></span><Icons.plus size={15}/></button>) : <div className="p-8 text-center text-[10px] text-slate-400">{ar?"لا يوجد أعضاء متاحون.":"No available members."}</div>}</div></div></> : <><div className="flex items-center justify-between border-b p-5"><h3 className="text-[15px] font-semibold">{modal==="create"?(ar?"إنشاء مجموعة":"Create Group"):(ar?"تعديل المجموعة":"Edit Group")}</h3><button onClick={()=>setModal(null)}><Icons.x size={18}/></button></div><div className="space-y-4 p-5"><label className="block"><span className="mb-1.5 block text-[10px] font-semibold text-slate-600">{ar?"اسم المجموعة":"Group name"}</span><input autoFocus value={name} onChange={e=>setName(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-[12px] outline-none focus:border-[#2c66dd]"/></label><label className="block"><span className="mb-1.5 block text-[10px] font-semibold text-slate-600">{ar?"الوصف":"Description"}</span><textarea value={description} onChange={e=>setDescription(e.target.value)} rows={4} className="w-full resize-none rounded-lg border border-slate-200 p-3 text-[11px] outline-none focus:border-[#2c66dd]"/></label><div className="flex justify-end gap-2"><button onClick={()=>setModal(null)} className="h-9 rounded-lg border border-slate-200 px-4 text-[11px] font-semibold">{ar?"إلغاء":"Cancel"}</button><button disabled={saving||!name.trim()} onClick={()=>void saveGroup()} className="h-9 rounded-lg bg-[#2c66dd] px-4 text-[11px] font-semibold text-white disabled:opacity-50">{saving?(ar?"جارٍ الحفظ...":"Saving..."):(ar?"حفظ":"Save")}</button></div></div></>}</div></div> : null}
    {toast ? <button onClick={()=>setToast(null)} className="fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-3 text-[11px] font-medium text-white shadow-xl">{toast}</button> : null}
  </main>;
}
