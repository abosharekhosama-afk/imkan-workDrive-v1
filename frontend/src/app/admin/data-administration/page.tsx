"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "@/components/locale-provider";
import { ImkanOptionPicker } from "@/components/imkan-option-picker";
import {
  browseDataAdmin,
  deleteDataAdminVersion,
  getDataAdminLargeFiles,
  getDataAdminLocations,
  getDataAdminShares,
  getDataAdminVersions,
  purgeDataAdminFiles,
  recordMyFolderAccess,
  restoreDataAdminFiles,
  revokeDataAdminShare,
  shareDataAdminItems,
  trashDataAdminFiles,
  transferDataAdminItems,
  updateDataAdminShare,
  type DataAdminItem,
  type DataAdminLocations,
  type DataAdminShare,
  type DataAdminVersion,
} from "@/lib/api/enterprise";

type Tab = "team" | "mine" | "shared" | "deleted" | "large";
type Member = DataAdminLocations["members"][number];

const TABS: Array<[Tab, string, string]> = [
  ["team", "Find in Team Folders", "البحث في مجلدات الفريق"],
  ["mine", "Find in My Folders", "البحث في مجلداتي"],
  ["deleted", "Manage Deleted Items", "إدارة العناصر المحذوفة"],
  ["shared", "Shared Items", "العناصر المشتركة"],
  ["large", "Large Files", "الملفات الكبيرة"],
];

function text(ar: boolean, en: string, arText: string) {
  return ar ? arText : en;
}

function bytes(value: number | null) {
  if (value == null) return "—";
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / Math.pow(1024, index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function when(value: string | null, ar: boolean) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(ar ? "ar" : "en", { dateStyle: "medium", timeStyle: "short" });
}

function explain(ar: boolean, error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/reason/i.test(message)) return text(ar, message, "أدخل سبباً من 3 أحرف على الأقل قبل فتح مجلدات العضو.");
  if (/Admin access/i.test(message)) return text(ar, message, "هذه الصفحة متاحة لمسؤول المؤسسة فقط.");
  return message || text(ar, "The action could not be completed.", "تعذر تنفيذ الإجراء.");
}

function shareKindLabel(kind: DataAdminShare["kind"], ar: boolean) {
  if (kind === "team") return text(ar, "Shared within the team", "مشارك داخل الفريق");
  if (kind === "download") return text(ar, "Download link", "رابط تنزيل");
  return text(ar, "Anyone on the internet", "أي شخص على الإنترنت");
}

export default function AdminDataAdministrationPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const params = useSearchParams();
  const router = useRouter();
  const initial = params.get("tab");
  const [tab, setTab] = useState<Tab>(TABS.some(([id]) => id === initial) ? (initial as Tab) : "team");
  const [locations, setLocations] = useState<DataAdminLocations | null>(null);
  const [teamId, setTeamId] = useState("");
  const [memberId, setMemberId] = useState("");
  const [pendingMember, setPendingMember] = useState<Member | null>(null);
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [shareFilter, setShareFilter] = useState("all");
  const [shareLocation, setShareLocation] = useState("all");
  const [deletedLocation, setDeletedLocation] = useState("all");
  const [items, setItems] = useState<DataAdminItem[]>([]);
  const [shares, setShares] = useState<DataAdminShare[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [sharePermission, setSharePermission] = useState("VIEW");
  const [shareRecipient, setShareRecipient] = useState("");
  const [shareDownload, setShareDownload] = useState(true);
  const [transferOpen, setTransferOpen] = useState(false);
  const [targetUserId, setTargetUserId] = useState("");
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [activeShare, setActiveShare] = useState<DataAdminShare | null>(null);
  const [permission, setPermission] = useState("VIEW");
  const [versionsFor, setVersionsFor] = useState<DataAdminItem | null>(null);
  const [versions, setVersions] = useState<DataAdminVersion[]>([]);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    void getDataAdminLocations().then((next) => {
      setLocations(next);
      setTeamId((current) => current || "all");
    }).catch((caught) => setError(explain(ar, caught)));
  }, [ar]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError("");
      try {
        if (tab === "shared") {
          const rows = await getDataAdminShares({ filter: shareFilter, location: shareLocation, q: query || undefined });
          if (!cancelled) setShares(rows);
        } else if (tab === "large") {
          const rows = await getDataAdminLargeFiles(query || undefined);
          if (!cancelled) setItems(rows);
        } else if (tab === "deleted") {
          const scope = deletedLocation === "all" ? "all" : deletedLocation === "personal" ? "personal" : "team";
          const id = scope === "team" ? deletedLocation : undefined;
          const rows = await browseDataAdmin({ scope, id, q: query || undefined, deleted: true });
          if (!cancelled) setItems(rows);
        } else if (tab === "team" && teamId) {
          const folders = teamId === "all" ? (locations?.teamFolders ?? []) : (locations?.teamFolders ?? []).filter((folder) => folder.id === teamId);
          const batches = await Promise.all(folders.map((folder) => browseDataAdmin({ scope: "team", id: folder.id, q: query || undefined })));
          const rows = batches.flat().sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
          if (!cancelled) setItems(rows);
        } else if (tab === "mine" && memberId) {
          const rows = await browseDataAdmin({ scope: "personal", id: memberId, q: query || undefined });
          if (!cancelled) setItems(rows);
        } else if (!cancelled) {
          setItems([]);
          setShares([]);
        }
      } catch (caught) {
        if (!cancelled) setError(explain(ar, caught));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [ar, tab, teamId, memberId, query, shareFilter, shareLocation, deletedLocation, refresh, locations]);

  useEffect(() => { setSelected([]); }, [tab, teamId, memberId, query, shareFilter, shareLocation, deletedLocation]);

  const selectedItems = useMemo(() => items.filter((item) => selected.includes(item.id)), [items, selected]);
  const selectedShares = useMemo(() => shares.filter((share) => selected.includes(share.id)), [shares, selected]);
  const visibleIds = tab === "shared" ? shares.map((share) => share.id) : items.map((item) => item.id);

  const reload = () => setRefresh((current) => current + 1);

  async function act(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      setSelected([]);
      reload();
    } catch (caught) {
      setError(explain(ar, caught));
    } finally {
      setBusy(false);
    }
  }

  async function confirmReason() {
    if (!pendingMember) return;
    await act(async () => {
      const result = await recordMyFolderAccess({ memberId: pendingMember.id, reason });
      setMemberId(pendingMember.id);
      setPendingMember(null);
      setReason("");
      setNotice(result.emailed
        ? text(ar, "The member was notified by email and in the product.", "تم إشعار العضو بالبريد وداخل المنتج.")
        : text(ar, "The member was notified in the product.", "تم إشعار العضو داخل المنتج."));
    });
  }

  async function shareSelected() {
    const files = selectedItems.filter((item) => item.kind === "FILE").map((item) => item.id);
    const folders = selectedItems.filter((item) => item.kind === "FOLDER").map((item) => item.id);
    await act(async () => {
      const body = { permission: sharePermission, recipientUserId: shareRecipient || undefined, canDownload: shareDownload };
      if (files.length) await shareDataAdminItems({ kind: "FILE", ids: files, ...body });
      if (folders.length) await shareDataAdminItems({ kind: "FOLDER", ids: folders, ...body });
      setShareOpen(false);
      setNotice(text(ar, "Sharing updated.", "تم تحديث المشاركة."));
    });
  }

  async function transfer() {
    const files = selectedItems.filter((item) => item.kind === "FILE").map((item) => item.id);
    const folders = selectedItems.filter((item) => item.kind === "FOLDER").map((item) => item.id);
    await act(async () => {
      if (files.length) await transferDataAdminItems({ kind: "FILE", ids: files, targetUserId });
      if (folders.length) await transferDataAdminItems({ kind: "FOLDER", ids: folders, targetUserId });
      setTransferOpen(false);
      setNotice(text(ar, "Ownership was transferred.", "تم نقل الملكية."));
    });
  }

  async function openVersions(item: DataAdminItem) {
    setVersionsFor(item);
    setVersions([]);
    try {
      const result = await getDataAdminVersions(item.id);
      setVersions(result.versions);
    } catch (caught) {
      setError(explain(ar, caught));
    }
  }

  function openItem(item: DataAdminItem) {
    if (tab === "deleted") return;
    if (item.kind === "FOLDER") router.push(`/files/${encodeURIComponent(item.id)}`);
    else window.dispatchEvent(new CustomEvent("workdrive:preview", { detail: { id: item.id, name: item.name, size: item.size ?? undefined } }));
  }

  return (
    <main className="flex h-full min-h-0 flex-col bg-white" dir={ar ? "rtl" : "ltr"}>
      <div className="border-b border-slate-200 bg-white px-4 pt-4">
        <h1 className="text-[21px] font-semibold text-[#252525]">{text(ar, "Data Administration", "إدارة البيانات")}</h1>
        
        <div className="mt-5 flex gap-5 overflow-x-auto border-b border-slate-200">
          {TABS.map(([id, en, arLabel]) => (
            <button key={id} type="button" onClick={() => setTab(id)} className={`admin-underline-tab shrink-0 border-b-2 bg-transparent px-1 pb-3 text-[13px] ${tab === id ? "border-[#175cd3] font-semibold text-[#175cd3]" : "border-transparent text-[#555] hover:text-[#175cd3]"}`}>{text(ar, en, arLabel)}</button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col bg-white">
        <section className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-4">
            {tab === "team" ? (
              <ImkanOptionPicker value={teamId} onChange={setTeamId} ariaLabel={text(ar, "Team Folder", "مجلد الفريق")} options={[
                { value: "all", label: text(ar, "All Team Folders", "كل مجلدات الفريق") },
                ...(locations?.teamFolders.map((folder) => ({ value: folder.id, label: folder.name })) ?? []),
              ]} />
            ) : null}
            {tab === "mine" ? (
              <ImkanOptionPicker value={memberId} onChange={(id) => { const member = locations?.members.find((entry) => entry.id === id); if (member) { setPendingMember(member); setReason(""); } }} ariaLabel={text(ar, "Member", "العضو")} options={[
                { value: "", label: text(ar, "Select a member", "اختر عضواً") },
                ...(locations?.members.map((member) => ({ value: member.id, label: member.name || member.email })) ?? []),
              ]} />
            ) : null}
            {tab === "deleted" ? <>
              <span className="text-[13px] text-[#333]">{text(ar, "Show for", "عرض لـ")}</span>
              <ImkanOptionPicker value={deletedLocation === "all" || deletedLocation === "personal" ? deletedLocation : "team"} onChange={(value) => setDeletedLocation(value === "team" ? (locations?.teamFolders[0]?.id || "all") : value)} ariaLabel={text(ar, "Deleted location type", "نوع موقع المحذوفات")} options={[
                { value: "team", label: text(ar, "Team Folders", "مجلدات الفريق") },
                { value: "personal", label: text(ar, "My Folders", "مجلداتي") },
                { value: "all", label: text(ar, "All locations", "كل المواقع") },
              ]} />
              {deletedLocation !== "all" && deletedLocation !== "personal" ? <ImkanOptionPicker value={deletedLocation} onChange={setDeletedLocation} ariaLabel={text(ar, "Select any Team Folder", "اختر مجلد فريق")} options={locations?.teamFolders.map((folder) => ({ value: folder.id, label: folder.name })) ?? []} /> : null}
            </> : null}
            {tab === "shared" ? <>
              <ImkanOptionPicker value={shareFilter} onChange={setShareFilter} ariaLabel={text(ar, "Share filter", "تصفية المشاركات")} options={[
                { value: "all", label: text(ar, "All shared items", "كل العناصر المشتركة") },
                { value: "external", label: text(ar, "Direct sharing to external users", "مشاركة مباشرة مع مستخدمين خارجيين") },
                { value: "internet", label: text(ar, "Visibility to anyone on the internet", "مرئي لأي شخص على الإنترنت") },
                { value: "download", label: text(ar, "Shared via download links", "مشاركة عبر روابط التنزيل") },
                { value: "team", label: text(ar, "Shared within team", "مشاركة داخل الفريق") },
              ]} />
              <ImkanOptionPicker value={shareLocation} onChange={setShareLocation} ariaLabel={text(ar, "Location", "الموقع")} options={[
                { value: "all", label: text(ar, "All locations", "كل المواقع") },
                { value: "personal", label: text(ar, "My Folders", "مجلداتي") },
                ...(locations?.teamFolders.map((folder) => ({ value: folder.id, label: folder.name })) ?? []),
              ]} />
            </> : null}
            {tab === "large" ? <>
              <ImkanOptionPicker value={shareFilter} onChange={setShareFilter} ariaLabel={text(ar, "File type", "نوع الملف")} options={[{value:"all",label:text(ar,"All File Types","كل أنواع الملفات")}]} />
              <ImkanOptionPicker value={shareLocation} onChange={setShareLocation} ariaLabel={text(ar, "Location", "الموقع")} options={[{value:"all",label:text(ar,"All locations","كل المواقع")},...(locations?.teamFolders.map((folder)=>({value:folder.id,label:folder.name}))??[])]} />
            </> : null}
            {tab !== "mine" ? <>
              <input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") setQuery(search.trim()); }} placeholder={text(ar, "Search by keywords", "بحث بالكلمات المفتاحية")} className="h-9 w-[260px] max-w-full rounded-full border border-[#d7dce2] px-4 text-[13px] outline-none focus:border-[#175cd3]" />
              <button type="button" onClick={() => setQuery(search.trim())} className="h-9 rounded-full bg-[#8eaff5] px-5 text-[13px] font-medium text-white hover:bg-[#175cd3]">{text(ar, "Find", "بحث")}</button>
            </> : null}
          </div>

          {tab === "deleted" ? <p className="border-b border-slate-100 bg-[#f8fafc] px-4 py-3 text-[12px] text-slate-600">{text(ar, `Deleted items will be permanently deleted after ${locations?.trashDays ?? 30} days.`, `سيتم حذف العناصر نهائياً بعد ${locations?.trashDays ?? 30} يوماً.`)} <span className="text-[#175cd3]">{text(ar, "Manage Data Retention Policy", "إدارة سياسة الاحتفاظ بالبيانات")}</span></p> : null}
          {tab === "large" ? <p className="border-b border-slate-100 bg-[#f8fafc] px-4 py-3 text-[12px] text-slate-600">{text(ar, "Review files larger than 100 MB to manage storage and versions.", "راجع الملفات الأكبر من 100 ميجابايت لإدارة التخزين والإصدارات.")}</p> : null}
          {error ? <p className="bg-red-50 px-4 py-2 text-[12px] text-red-700">{error}</p> : null}
          {notice ? <p className="bg-emerald-50 px-4 py-2 text-[12px] text-emerald-700">{notice}</p> : null}

          {selected.length ? (
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-[#eef4ff] px-4 py-2">
              <span className="text-[12px] font-semibold text-[#175cd3]">{selected.length} {text(ar, "selected", "محدد")}</span>
              {tab === "shared" ? <>
                <button type="button" disabled={selectedShares.length !== 1} onClick={() => { const share = selectedShares[0]; if (!share) return; setActiveShare(share); setPermission(share.permission); }} className="rounded-md bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 disabled:opacity-40">{text(ar, "Share details", "تفاصيل المشاركة")}</button>
                <button type="button" disabled={busy} onClick={() => void act(async () => { for (const share of selectedShares) await revokeDataAdminShare(share.id, share.resourceKind); setNotice(text(ar, "Access removed.", "تمت إزالة الوصول.")); })} className="rounded-md bg-white px-3 py-1.5 text-[12px] font-semibold text-red-600">{text(ar, "Remove access", "إزالة الوصول")}</button>
              </> : null}
              {tab === "deleted" ? <>
                <button type="button" disabled={busy} onClick={() => void act(async () => { await restoreDataAdminFiles(selected); setNotice(text(ar, "Items restored.", "تمت استعادة العناصر.")); })} className="rounded-md bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700">{text(ar, "Restore", "استعادة")}</button>
                <button type="button" onClick={() => setPurgeOpen(true)} className="rounded-md bg-white px-3 py-1.5 text-[12px] font-semibold text-red-600">{text(ar, "Delete permanently", "حذف نهائي")}</button>
              </> : null}
              {tab !== "shared" && tab !== "deleted" ? <>
                <button type="button" disabled={!selectedItems.length} onClick={() => { setSharePermission("VIEW"); setShareRecipient(""); setShareDownload(true); setShareOpen(true); }} className="rounded-md bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700">{text(ar, "Share", "مشاركة")}</button>
                <button type="button" disabled={!selectedItems.length} onClick={() => { setTargetUserId(locations?.members[0]?.id || ""); setTransferOpen(true); }} className="rounded-md bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700">{text(ar, "Transfer ownership", "نقل الملكية")}</button>
                <button type="button" disabled={busy || !selectedItems.some((item) => item.kind === "FILE")} onClick={() => void act(async () => { await trashDataAdminFiles(selectedItems.filter((item) => item.kind === "FILE").map((item) => item.id)); setNotice(text(ar, "Files moved to trash.", "نُقلت الملفات إلى المحذوفات.")); })} className="rounded-md bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700">{text(ar, "Move to trash", "نقل إلى المحذوفات")}</button>
                {tab === "large" && selectedItems.length === 1 ? <button type="button" onClick={() => void openVersions(selectedItems[0])} className="rounded-md bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700">{text(ar, "Manage versions", "إدارة الإصدارات")}</button> : null}
              </> : null}
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-auto">
            {loading ? <p className="px-4 py-8 text-[13px] text-slate-400">{text(ar, "Loading…", "جارٍ التحميل…")}</p> : tab === "shared" ? (
              <table className="w-full min-w-[760px] border-collapse bg-white text-[13px]">
                <thead className="sticky top-0 bg-white text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="w-10 px-3 py-3"><input type="checkbox" checked={visibleIds.length > 0 && selected.length === visibleIds.length} onChange={(event) => setSelected(event.target.checked ? visibleIds : [])} /></th><th className="px-3 py-3 text-start">{text(ar,"Name","الاسم")}</th><th className="px-3 py-3 text-start">{text(ar,"Share details","تفاصيل المشاركة")}</th><th className="px-3 py-3 text-start">{text(ar,"Location","الموقع")}</th><th className="px-3 py-3 text-start">{text(ar,"Owner","المالك")}</th></tr></thead>
                <tbody>{shares.map((share) => <tr key={share.id} onClick={() => { setActiveShare(share); setPermission(share.permission); }} className="cursor-pointer border-t border-slate-100 hover:bg-[#f7f8fa]"><td className="px-3 py-3" onClick={(e)=>e.stopPropagation()}><input type="checkbox" checked={selected.includes(share.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, share.id] : current.filter((id) => id !== share.id))} /></td><td className="px-3 py-3 font-medium text-slate-800">{share.name}</td><td className="px-3 py-3 text-slate-600">{shareKindLabel(share.kind, ar)} · {share.permission}{share.recipients.length ? ` · ${share.recipients.map((person) => person.email).join(", ")}` : ""}</td><td className="px-3 py-3 text-slate-600">{share.location}</td><td className="px-3 py-3 text-slate-600">{share.ownerName || "—"}</td></tr>)}</tbody>
              </table>
            ) : (
              <table className="w-full min-w-[760px] border-collapse bg-white text-[13px]">
                <thead className="sticky top-0 bg-white text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="w-10 px-3 py-3"><input type="checkbox" checked={visibleIds.length > 0 && selected.length === visibleIds.length} onChange={(event) => setSelected(event.target.checked ? visibleIds : [])} /></th><th className="px-3 py-3 text-start">{text(ar,"Name","الاسم")}</th><th className="px-3 py-3 text-start">{text(ar,"Last modified","آخر تعديل")}</th>{tab === "large" ? <><th className="px-3 py-3 text-start">{text(ar,"Versions","الإصدارات")}</th><th className="px-3 py-3 text-start">{text(ar,"Storage used","المساحة المستخدمة")}</th></> : null}<th className="px-3 py-3 text-start">{text(ar,"Owner","المالك")}</th></tr></thead>
                <tbody>{items.map((item) => <tr key={`${item.kind}-${item.id}`} onClick={() => openItem(item)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openItem(item); } }} tabIndex={tab === "deleted" ? -1 : 0} className={`${tab === "deleted" ? "" : "cursor-pointer"} border-t border-slate-100 hover:bg-[#f7f8fa] focus:bg-[#eef4ff]`}><td className="px-3 py-3" onClick={(e)=>e.stopPropagation()}><input type="checkbox" checked={selected.includes(item.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} /></td><td className="px-3 py-3"><span className="font-medium text-[#252525]">{item.name}</span><span className="ms-2 text-[10px] uppercase text-slate-400">{item.kind === "FOLDER" ? text(ar,"Folder","مجلد") : item.extension || text(ar,"File","ملف")}</span></td><td className="px-3 py-3 text-slate-600">{when(item.deletedAt || item.updatedAt, ar)}</td>{tab === "large" ? <><td className="px-3 py-3 text-slate-600">{item.versionCount ?? 0}</td><td className="px-3 py-3 text-slate-600">{bytes(item.size)}</td></> : null}<td className="px-3 py-3 text-slate-600">{item.ownerName || item.ownerEmail || "—"}</td></tr>)}</tbody>
              </table>
            )}
            {!loading && ((tab === "shared" && !shares.length) || (tab !== "shared" && !items.length)) ? <div className="flex min-h-[360px] items-center justify-center px-4 text-center"><div className="max-w-[560px] rounded-2xl border border-slate-100 px-10 py-8"><h2 className="text-[16px] font-semibold text-[#333]">{tab === "deleted" ? text(ar,"Discover deleted files","اكتشف الملفات المحذوفة") : tab === "large" ? text(ar,"No large files found","لم يتم العثور على ملفات كبيرة") : tab === "shared" ? text(ar,"There are no Shared Items here","لا توجد عناصر مشتركة هنا") : text(ar,"Discover files in Team Folders","اكتشف الملفات في مجلدات الفريق")}</h2><p className="mt-3 text-[13px] text-slate-600">{tab === "deleted" ? text(ar,"Find and restore all files deleted by your team members.","اعثر على الملفات التي حذفها أعضاء الفريق واستعدها.") : tab === "large" ? text(ar,"You don't have any files larger than 100 MB.","لا توجد ملفات أكبر من 100 ميجابايت.") : tab === "shared" ? text(ar,"Shared files and folders will appear here.","ستظهر الملفات والمجلدات المشتركة هنا.") : text(ar,"Find and manage files in Team Folders","اعثر على الملفات وأدرها في مجلدات الفريق")}</p></div></div> : null}
          </div>
        </section>
      </div>

      {pendingMember ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-[16px] font-semibold">{text(ar, "Open My Folders", "فتح مجلداتي")}</h2>
            <p className="mt-2 text-[13px] text-slate-600">{text(ar, `You are about to view ${pendingMember.name || pendingMember.email}'s My Folders. Enter a reason. The member will be notified.`, `أنت على وشك عرض مجلدات ${pendingMember.name || pendingMember.email}. أدخل السبب. سيتم إشعار العضو.`)}</p>
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={4} className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-[#175cd3]" placeholder={text(ar, "Reason", "السبب")} />
            {error ? <p className="mt-2 text-[12px] text-red-600">{error}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setPendingMember(null)} className="rounded-lg px-3 py-2 text-[13px] text-slate-600">{text(ar, "Cancel", "إلغاء")}</button>
              <button type="button" disabled={busy || reason.trim().length < 3} onClick={() => void confirmReason()} className="rounded-lg bg-[#175cd3] px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-40">{text(ar, "Continue", "متابعة")}</button>
            </div>
          </div>
        </div>
      ) : null}

      {shareOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-[16px] font-semibold">{text(ar, "Share", "مشاركة")}</h2>
            <p className="mt-2 text-[13px] text-slate-600">{text(ar, "Share with a team member, or leave the member empty to create a link anyone can open.", "شارك مع عضو في الفريق، أو اترك العضو فارغاً لإنشاء رابط يمكن لأي شخص فتحه.")}</p>
            <label className="mt-3 block text-[12px] font-semibold text-slate-700">{text(ar, "Permission", "الإذن")}</label>
            <ImkanOptionPicker fullWidth value={sharePermission} onChange={setSharePermission} ariaLabel={text(ar, "Permission", "الإذن")} options={["VIEW", "COMMENT", "EDIT", "ORGANIZE", "FULL_ACCESS"].map((value) => ({ value, label: value }))} />
            <label className="mt-3 block text-[12px] font-semibold text-slate-700">{text(ar, "Team member", "عضو الفريق")}</label>
            <ImkanOptionPicker fullWidth allowEmpty emptyLabel={text(ar, "Anyone with the link", "أي شخص يملك الرابط")} value={shareRecipient} onChange={setShareRecipient} ariaLabel={text(ar, "Team member", "عضو الفريق")} options={locations?.members.map((member) => ({ value: member.id, label: member.name || member.email })) ?? []} />
            <label className="mt-3 flex items-center gap-2 text-[13px] text-slate-700"><input type="checkbox" checked={shareDownload} onChange={(event) => setShareDownload(event.target.checked)} />{text(ar, "Allow download", "السماح بالتنزيل")}</label>
            {error ? <p className="mt-2 text-[12px] text-red-600">{error}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setShareOpen(false)} className="rounded-lg px-3 py-2 text-[13px] text-slate-600">{text(ar, "Cancel", "إلغاء")}</button>
              <button type="button" disabled={busy} onClick={() => void shareSelected()} className="rounded-lg bg-[#175cd3] px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-40">{text(ar, "Share", "مشاركة")}</button>
            </div>
          </div>
        </div>
      ) : null}

      {transferOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-[16px] font-semibold">{text(ar, "Transfer ownership", "نقل الملكية")}</h2>
            <p className="mt-2 text-[13px] text-slate-600">{text(ar, "The new owner must be an active member. A folder transfer includes the files inside it.", "يجب أن يكون المالك الجديد عضواً نشطاً. نقل المجلد يشمل الملفات داخله.")}</p>
            <div className="mt-3"><ImkanOptionPicker fullWidth value={targetUserId} onChange={setTargetUserId} ariaLabel={text(ar, "New owner", "المالك الجديد")} options={locations?.members.map((member) => ({ value: member.id, label: member.name || member.email })) ?? []} /></div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setTransferOpen(false)} className="rounded-lg px-3 py-2 text-[13px] text-slate-600">{text(ar, "Cancel", "إلغاء")}</button>
              <button type="button" disabled={busy || !targetUserId} onClick={() => void transfer()} className="rounded-lg bg-[#175cd3] px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-40">{text(ar, "Transfer", "نقل")}</button>
            </div>
          </div>
        </div>
      ) : null}

      {purgeOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-[16px] font-semibold">{text(ar, "Delete permanently", "حذف نهائي")}</h2>
            <p className="mt-2 text-[13px] text-slate-600">{text(ar, "These files and their versions will be removed. This cannot be undone.", "ستُزال هذه الملفات وإصداراتها. لا يمكن التراجع عن ذلك.")}</p>
            <ul className="mt-3 max-h-32 overflow-auto text-[12px] text-slate-700">{selectedItems.map((item) => <li key={item.id}>{item.name}</li>)}</ul>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setPurgeOpen(false)} className="rounded-lg px-3 py-2 text-[13px] text-slate-600">{text(ar, "Cancel", "إلغاء")}</button>
              <button type="button" disabled={busy} onClick={() => void act(async () => { await purgeDataAdminFiles(selected); setPurgeOpen(false); setNotice(text(ar, "Files permanently deleted.", "حُذفت الملفات نهائياً.")); })} className="rounded-lg bg-red-600 px-3 py-2 text-[13px] font-semibold text-white">{text(ar, "Delete permanently", "حذف نهائي")}</button>
            </div>
          </div>
        </div>
      ) : null}

      {activeShare ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-[16px] font-semibold">{activeShare.name}</h2>
            <p className="mt-1 text-[12px] text-slate-500">{shareKindLabel(activeShare.kind, ar)} · {activeShare.location}</p>
            <label className="mt-3 block text-[12px] font-semibold text-slate-700">{text(ar, "Permission", "الإذن")}</label>
            <ImkanOptionPicker fullWidth value={permission} onChange={setPermission} ariaLabel={text(ar, "Permission", "الإذن")} options={["VIEW", "COMMENT", "EDIT", "ORGANIZE", "FULL_ACCESS"].map((value) => ({ value, label: value }))} />
            <p className="mt-3 text-[12px] text-slate-600">{activeShare.recipients.length ? activeShare.recipients.map((person) => person.email).join(", ") : text(ar, "No team recipients. This is a link share.", "لا يوجد مستلمون داخل الفريق. هذه مشاركة برابط.")}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setActiveShare(null)} className="rounded-lg px-3 py-2 text-[13px] text-slate-600">{text(ar, "Close", "إغلاق")}</button>
              <button type="button" disabled={busy} onClick={() => void act(async () => { await updateDataAdminShare(activeShare.id, { kind: activeShare.resourceKind, permission }); setActiveShare(null); setNotice(text(ar, "Access updated.", "تم تحديث الوصول.")); })} className="rounded-lg bg-[#175cd3] px-3 py-2 text-[13px] font-semibold text-white">{text(ar, "Save", "حفظ")}</button>
            </div>
          </div>
        </div>
      ) : null}

      {versionsFor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-[16px] font-semibold">{text(ar, "Manage versions", "إدارة الإصدارات")}</h2>
            <p className="mt-1 text-[12px] text-slate-500">{versionsFor.name}</p>
            <ul className="mt-3 max-h-64 divide-y divide-slate-100 overflow-auto">
              {versions.map((version) => (
                <li key={version.id} className="flex items-center justify-between py-2 text-[13px]">
                  <span>{text(ar, "Version", "الإصدار")} {version.versionNumber} · {bytes(version.size)}{version.latest ? ` · ${text(ar, "Latest", "الأحدث")}` : ""}</span>
                  {version.latest ? null : <button type="button" className="text-[12px] font-semibold text-red-600" onClick={() => void act(async () => { await deleteDataAdminVersion(versionsFor.id, version.id); const next = await getDataAdminVersions(versionsFor.id); setVersions(next.versions); setNotice(text(ar, "Older version deleted.", "حُذف الإصدار الأقدم.")); })}>{text(ar, "Delete", "حذف")}</button>}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-end"><button type="button" onClick={() => setVersionsFor(null)} className="rounded-lg px-3 py-2 text-[13px] text-slate-600">{text(ar, "Close", "إغلاق")}</button></div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
