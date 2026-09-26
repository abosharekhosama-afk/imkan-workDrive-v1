"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "@/components/locale-provider";
import { ApiError } from "@/lib/api/client";
import { createTeamFolder, deleteTeamFolder, listTeamFolders, renameTeamFolder, updateTeamFolderSettings, type TeamFolderListItem } from "@/lib/api/team-folders";
import { MembersModal } from "@/components/members-modal";
import { Icons } from "@/components/layout/icons";

export default function AdminTeamFoldersPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [rows, setRows] = useState<TeamFolderListItem[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createPublic, setCreatePublic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rename, setRename] = useState<TeamFolderListItem | null>(null);
  const [renameName, setRenameName] = useState("");
  const [members, setMembers] = useState<TeamFolderListItem | null>(null);
  const [menu, setMenu] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setRows((await listTeamFolders()).teamFolders); }
    catch (e) { setError(e instanceof ApiError ? e.message : (ar ? "تعذر تحميل مجلدات الفريق." : "Unable to load Team Folders.")); }
    finally { setLoading(false); }
  }, [ar]);
  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => rows.filter((r) => !query.trim() || r.name.toLowerCase().includes(query.trim().toLowerCase())), [rows, query]);
  const doCreate = async () => {
    if (!createName.trim()) return;
    setBusy(true); setError("");
    try { await createTeamFolder(createName.trim(), { isPublicToOrg: createPublic }); setCreateName(""); setCreatePublic(false); setCreateOpen(false); await load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : (ar ? "تعذر إنشاء مجلد الفريق." : "Unable to create Team Folder.")); }
    finally { setBusy(false); }
  };
  const doRename = async () => {
    if (!rename || !renameName.trim()) return;
    setBusy(true); setError("");
    try { await renameTeamFolder(rename.id, renameName.trim()); setRename(null); await load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : (ar ? "تعذر إعادة التسمية." : "Unable to rename Team Folder.")); }
    finally { setBusy(false); }
  };
  const doDelete = async (row: TeamFolderListItem) => {
    if (!window.confirm(ar ? `حذف مجلد الفريق «${row.name}»؟` : `Delete Team Folder “${row.name}”?`)) return;
    setBusy(true); setError("");
    try { await deleteTeamFolder(row.id); await load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : (ar ? "تعذر حذف مجلد الفريق. يجب أن يكون فارغاً." : "Unable to delete Team Folder. It must be empty.")); }
    finally { setBusy(false); }
  };
  const toggle = async (row: TeamFolderListItem, field: "isPublicToOrg" | "allowExternalSharing" | "allowViewerDownloads") => {
    setBusy(true); setError("");
    try { await updateTeamFolderSettings(row.id, { [field]: !row[field] } as any); await load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : (ar ? "تعذر تحديث إعداد المجلد." : "Unable to update Team Folder settings.")); }
    finally { setBusy(false); }
  };

  return <section className="h-full overflow-y-auto bg-[#f7f7f7]" dir={ar ? "rtl" : "ltr"}>
    <div className="border-b border-[#e6e6e6] bg-white px-6 py-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#2c66dd]">{ar ? "وحدة الإدارة" : "Admin Console"}</div><h1 className="mt-1 text-[20px] font-semibold text-[#202124]">{ar ? "مجلدات الفريق" : "Team Folders"}</h1></div><button type="button" className="zoho-admin-primary" onClick={() => setCreateOpen(true)}><Icons.plus size={15} /> <span className="ms-1">{ar ? "إنشاء مجلد فريق" : "Create Team Folder"}</span></button></div></div>
    <div className="mx-auto max-w-[1400px] p-5 lg:p-7">
      {error ? <div className="mb-4 rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-red-700">{error}</div> : null}
      <div className="mb-4 flex items-center gap-3 rounded-[12px] border border-[#e5e6e8] bg-white px-4 py-3"><Icons.search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} className="w-full text-[12px] outline-none" placeholder={ar ? "بحث في مجلدات الفريق" : "Search Team Folders"} /><span className="text-[10px] text-[#858990]">{visible.length}</span></div>
      <div className="overflow-hidden rounded-[14px] border border-[#e5e6e8] bg-white"><div className="grid grid-cols-[minmax(240px,1.5fr)_100px_110px_150px_160px] gap-3 border-b border-[#ececec] bg-[#fafafa] px-5 py-3 text-[10px] font-semibold text-[#6d7279]"><span>{ar ? "الاسم" : "Name"}</span><span>{ar ? "الأعضاء" : "Members"}</span><span>{ar ? "الحجم" : "Size"}</span><span>{ar ? "الوصول" : "Access"}</span><span className="text-end">{ar ? "إجراءات" : "Actions"}</span></div>{loading ? <div className="px-5 py-10 text-center text-[12px] text-[#777]">{ar ? "جارٍ التحميل…" : "Loading…"}</div> : visible.length === 0 ? <div className="px-5 py-14 text-center text-[12px] text-[#777]">{ar ? "لا توجد مجلدات فريق." : "No Team Folders found."}</div> : visible.map((row) => <div key={row.id} className="grid grid-cols-[minmax(240px,1.5fr)_100px_110px_150px_160px] items-center gap-3 border-b border-[#f0f0f0] px-5 py-4 last:border-b-0 hover:bg-[#fbfcfe]"><div className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[#edf4ff] text-[#2c66dd]"><Icons.folder size={17} /></span><div className="min-w-0"><div className="truncate text-[12px] font-semibold text-[#202124]">{row.name}</div><div className="mt-1 text-[10px] text-[#858990]">{row.role} · {row.isPublicToOrg ? (ar ? "عام" : "Public") : (ar ? "خاص" : "Private")}</div></div></div><span className="text-[11px] text-[#555b62]">{row.memberCount}</span><span className="text-[11px] text-[#555b62]">{row.totalSize ? `${(row.totalSize / 1048576).toFixed(1)} MB` : "0 B"}</span><div className="flex flex-wrap gap-1.5"><button disabled={busy} onClick={() => void toggle(row, "isPublicToOrg")} className={`rounded-full px-2 py-1 text-[9px] font-semibold ${row.isPublicToOrg ? "bg-[#e9f7ef] text-[#28724a]" : "bg-[#f1f2f4] text-[#666b72]"}`}>{row.isPublicToOrg ? "Public" : "Private"}</button><button disabled={busy} onClick={() => void toggle(row, "allowExternalSharing")} className={`rounded-full px-2 py-1 text-[9px] font-semibold ${row.allowExternalSharing ? "bg-[#e9f7ef] text-[#28724a]" : "bg-[#fff0f0] text-[#a33a3a]"}`}>{ar ? "خارجي" : "External"}</button></div><div className="relative flex justify-end gap-1"><button type="button" onClick={() => setMembers(row)} className="rounded-lg border border-[#e0e2e5] px-2.5 py-1.5 text-[10px] font-semibold hover:bg-[#f7f8fa]">{ar ? "الأعضاء" : "Members"}</button><button type="button" onClick={() => setMenu(menu === row.id ? null : row.id)} className="grid h-8 w-8 place-items-center rounded-lg border border-[#e0e2e5]"><Icons.dots size={15} /></button>{menu === row.id ? <div className="absolute end-0 top-9 z-20 w-[190px] rounded-[10px] border border-[#e2e3e5] bg-white p-1.5 shadow-xl"><button className="w-full rounded-lg px-3 py-2 text-start text-[11px] hover:bg-[#f5f6f8]" onClick={() => { setMenu(null); setRename(row); setRenameName(row.name); }}>{ar ? "إعادة تسمية" : "Rename"}</button><button className="w-full rounded-lg px-3 py-2 text-start text-[11px] hover:bg-[#f5f6f8]" onClick={() => { setMenu(null); void toggle(row, "allowViewerDownloads"); }}>{row.allowViewerDownloads ? (ar ? "تعطيل تنزيل المشاهد" : "Disable viewer downloads") : (ar ? "تمكين تنزيل المشاهد" : "Enable viewer downloads")}</button><button className="w-full rounded-lg px-3 py-2 text-start text-[11px] text-red-600 hover:bg-red-50" onClick={() => { setMenu(null); void doDelete(row); }}>{ar ? "حذف" : "Delete"}</button></div> : null}</div></div>)}</div>
    </div>
    {createOpen ? <ModalShell title={ar ? "إنشاء مجلد فريق" : "Create Team Folder"} onClose={() => setCreateOpen(false)}><label className="block text-[12px] font-medium">{ar ? "اسم مجلد الفريق" : "Team Folder name"}<input autoFocus value={createName} onChange={(e) => setCreateName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void doCreate(); } }} className="zoho-admin-input mt-2" placeholder={ar ? "مثال: التسويق" : "e.g. Marketing"} /><div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={() => setCreatePublic(false)} className={`rounded-lg border px-3 py-2 text-start text-[11px] ${!createPublic ? "border-[#5c8fe8] bg-[#f7faff]" : "border-[#ddd]"}`}>{ar ? "خاص" : "Private"}</button><button type="button" onClick={() => setCreatePublic(true)} className={`rounded-lg border px-3 py-2 text-start text-[11px] ${createPublic ? "border-[#5c8fe8] bg-[#f7faff]" : "border-[#ddd]"}`}>{ar ? "عام" : "Public"}</button></div></label><div className="mt-5 flex justify-end gap-2"><button className="rounded-lg border border-[#ddd] px-4 py-2 text-[11px]" onClick={() => setCreateOpen(false)}>{ar ? "إلغاء" : "Cancel"}</button><button className="zoho-admin-primary" disabled={!createName.trim() || busy} onClick={() => void doCreate()}>{busy ? "…" : ar ? "إنشاء" : "Create"}</button></div></ModalShell> : null}
    {rename ? <ModalShell title={ar ? "إعادة تسمية مجلد الفريق" : "Rename Team Folder"} onClose={() => setRename(null)}><input autoFocus value={renameName} onChange={(e) => setRenameName(e.target.value)} className="zoho-admin-input" /><div className="mt-5 flex justify-end gap-2"><button className="rounded-lg border border-[#ddd] px-4 py-2 text-[11px]" onClick={() => setRename(null)}>{ar ? "إلغاء" : "Cancel"}</button><button className="zoho-admin-primary" disabled={!renameName.trim() || busy} onClick={() => void doRename()}>{busy ? "…" : ar ? "حفظ" : "Save"}</button></div></ModalShell> : null}
    {members ? <MembersModal teamFolderId={members.id} teamFolderName={members.name} userRole="ORG_ADMIN" onClose={() => setMembers(null)} /> : null}
  </section>;
}
function ModalShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) { return <div className="fixed inset-0 z-[100] grid place-items-center bg-black/30 p-4" onMouseDown={onClose}><div className="w-full max-w-[480px] rounded-[14px] bg-white p-5 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}><div className="mb-5 flex items-center justify-between"><h2 className="text-[15px] font-semibold">{title}</h2><button type="button" onClick={onClose} className="text-xl text-[#777]">×</button></div>{children}</div></div>; }
