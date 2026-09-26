"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale } from "@/components/locale-provider";
import { Icons } from "@/components/layout/icons";
import { getAuditScopes, generateAuditReport, type AuditReport, type AuditReportCriteria, type AuditScopeMember, type AuditScopeTeamFolder } from "@/lib/api/audit-report";

type ActivityCategory = { key: string; en: string; ar: string; items: Array<{ key: string; en: string; ar: string }> };

const CATEGORIES: ActivityCategory[] = [
  { key: "FILES_FOLDERS", en: "Files & Folders", ar: "الملفات والمجلدات", items: [
    ["UPLOAD", "Upload", "رفع"], ["CREATE", "Create", "إنشاء"], ["DOWNLOAD", "Download", "تنزيل"], ["VIEW", "View", "عرض"], ["MODIFY", "Modify", "تعديل"], ["RENAME", "Rename", "إعادة تسمية"], ["TRASH", "Trash", "نقل إلى السلة"], ["DELETE", "Delete", "حذف"], ["PERMANENT_DELETE", "Permanent Delete", "حذف نهائي"], ["RESTORE", "Restore", "استعادة"], ["MOVE", "Move", "نقل"], ["COPY", "Copy", "نسخ"], ["PURGED", "Purged", "إزالة نهائية"], ["ASSOCIATE_DATA_TEMPLATES", "Associate Data Templates", "ربط قوالب البيانات"], ["MODIFY_CUSTOM_FIELD_VALUES", "Modify Custom Field Values", "تعديل قيم الحقول المخصصة"], ["DISSOCIATE_DATA_TEMPLATES", "Disassociate Data Templates", "إلغاء ربط قوالب البيانات"], ["ASSOCIATE_CLASSIFICATION_LABEL", "Associate Classification Label", "ربط تصنيف"], ["DISSOCIATE_CLASSIFICATION_LABEL", "Disassociate Classification Label", "إلغاء ربط تصنيف"], ["TRANSFER_OWNERSHIP", "Transfer Ownership", "نقل الملكية"],
  ].map(([key, en, ar]) => ({ key, en, ar })) },
  { key: "SHARING", en: "Sharing", ar: "المشاركة", items: [
    ["SHARE", "Share", "مشاركة"], ["REMOVE_SHARE", "Remove Share", "إزالة المشاركة"], ["MODIFY_SHARE", "Modify Share", "تعديل المشاركة"], ["APPLY_CUSTOMIZATION", "Apply customization", "تطبيق التخصيص"], ["REMOVE_CUSTOMIZATION", "Remove customization", "إزالة التخصيص"],
  ].map(([key, en, ar]) => ({ key, en, ar })) },
  { key: "GROUPS", en: "Groups", ar: "المجموعات", items: [
    ["CREATE", "Create", "إنشاء"], ["RENAME", "Rename", "إعادة تسمية"], ["ADD_MEMBERS", "Add Members", "إضافة أعضاء"], ["REMOVE_MEMBERS", "Remove Members", "إزالة أعضاء"], ["UPDATE_MEMBER_ROLE", "Update Member Role", "تحديث دور العضو"], ["DELETE", "Delete", "حذف"],
  ].map(([key, en, ar]) => ({ key, en, ar })) },
  { key: "TEAM_FOLDERS", en: "Team Folders", ar: "مجلدات الفريق", items: [
    ["CREATE", "Create", "إنشاء"], ["RENAME", "Rename", "إعادة تسمية"], ["DUPLICATE", "Duplicate", "تكرار"], ["ADD_MEMBERS", "Add Members", "إضافة أعضاء"], ["REMOVE_MEMBERS", "Remove Members", "إزالة أعضاء"], ["UPDATE_MEMBER_ROLE", "Update Member Role", "تحديث دور العضو"], ["DELETE", "Delete", "حذف"], ["RESTORE", "Restore", "استعادة"], ["ARCHIVE", "Archive", "أرشفة"], ["UNARCHIVE", "Unarchive", "إلغاء الأرشفة"],
  ].map(([key, en, ar]) => ({ key, en, ar })) },
  { key: "TEAM", en: "Team", ar: "الفريق", items: [
    ["CREATE", "Create", "إنشاء"], ["RENAME", "Rename", "إعادة تسمية"], ["MEMBERS_INVITED", "Members Invited", "دعوة أعضاء"], ["MEMBERS_JOINED", "Members Joined", "انضمام أعضاء"], ["UPDATE_MEMBER_ROLE", "Update Member Role", "تحديث دور العضو"], ["DELETE_MEMBERS", "Delete Members", "حذف أعضاء"], ["CUSTOM_DOMAIN", "Custom Domain", "النطاق المخصص"],
  ].map(([key, en, ar]) => ({ key, en, ar })) },
  { key: "DATA_TEMPLATES", en: "Data Templates", ar: "قوالب البيانات", items: [
    ["CREATE", "Create", "إنشاء"], ["MODIFY", "Modify", "تعديل"], ["DELETE", "Delete", "حذف"], ["ASSOCIATE", "Associate", "ربط"], ["DISSOCIATE", "Disassociate", "إلغاء الربط"], ["MODIFY_CUSTOM_FIELDS", "Modify Custom Fields", "تعديل الحقول المخصصة"], ["DELETE_CUSTOM_FIELDS", "Delete Custom Fields", "حذف الحقول المخصصة"],
  ].map(([key, en, ar]) => ({ key, en, ar })) },
  { key: "COLLECT_FILES", en: "Collect Files", ar: "جمع الملفات", items: [
    ["CREATE", "Create", "إنشاء"], ["ENABLE", "Enable", "تمكين"], ["DELETE", "Delete", "حذف"], ["PURGED", "Purged", "إزالة نهائية"],
  ].map(([key, en, ar]) => ({ key, en, ar })) },
  { key: "DLP", en: "Data Loss Prevention", ar: "منع فقدان البيانات", items: [
    ["CREATE_DLP_POLICY", "Create DLP Policy", "إنشاء سياسة DLP"], ["EDIT_DLP_POLICY", "Edit DLP Policy", "تعديل سياسة DLP"], ["DELETE_DLP_POLICY", "Delete DLP Policy", "حذف سياسة DLP"], ["ENABLE_DLP_POLICY", "Enable DLP Policy", "تمكين سياسة DLP"], ["DISABLE_DLP_POLICY", "Disable DLP Policy", "تعطيل سياسة DLP"], ["CREATE_CLASSIFICATION_LABEL", "Create Classification Label", "إنشاء تصنيف"], ["EDIT_CLASSIFICATION_LABEL", "Edit Classification Label", "تعديل تصنيف"], ["DELETE_CLASSIFICATION_LABEL", "Delete Classification Label", "حذف تصنيف"],
  ].map(([key, en, ar]) => ({ key, en, ar })) },
  { key: "DEVICES", en: "Manage Devices", ar: "إدارة الأجهزة", items: [
    ["CONNECT_DEVICES", "Connect Devices", "ربط الأجهزة"], ["DISCONNECT_DEVICES", "Disconnect Devices", "فصل الأجهزة"], ["WIPE_DEVICES", "Wipe and Disconnect Devices", "مسح وفصل الأجهزة"], ["APP_TOGGLE", "Enable and Disable Apps", "تمكين وتعطيل التطبيقات"],
  ].map(([key, en, ar]) => ({ key, en, ar })) },
  { key: "COMMENTS", en: "Comments", ar: "التعليقات", items: [
    ["CREATE", "Create", "إنشاء"], ["EDIT", "Edit", "تعديل"], ["DELETE", "Delete", "حذف"], ["RESOLVE", "Resolve", "حل"], ["REOPEN", "Reopen", "إعادة فتح"], ["REPLY", "Reply", "رد"],
  ].map(([key, en, ar]) => ({ key, en, ar })) },
  { key: "APPS", en: "Apps", ar: "التطبيقات", items: [
    ["CREATE_APP", "Create App", "إنشاء تطبيق"], ["UPDATE_APP", "Update App", "تحديث تطبيق"], ["DELETE_APP", "Delete App", "حذف تطبيق"],
  ].map(([key, en, ar]) => ({ key, en, ar })) },
  { key: "WEBHOOKS", en: "Webhooks", ar: "Webhooks", items: [
    ["CREATE_WEBHOOK", "Create Webhook", "إنشاء Webhook"], ["UPDATE_WEBHOOK", "Update Webhook", "تحديث Webhook"], ["DELETE_WEBHOOK", "Delete Webhook", "حذف Webhook"],
  ].map(([key, en, ar]) => ({ key, en, ar })) },
];

const allActivityKeys = CATEGORIES.map((c) => c.key);
const allItemKeys = CATEGORIES.flatMap((c) => c.items.map((i) => `${c.key}:${i.key}`));

function Check({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return <label className="flex cursor-pointer items-center gap-2 text-[12px] text-[#202124]"><input type="checkbox" checked={checked} onChange={onChange} className="h-[14px] w-[14px] accent-[#2f6ee5]" aria-label={label} /><span>{label}</span></label>;
}

function Popover({ children, open, className = "" }: { children: React.ReactNode; open: boolean; className?: string }) {
  if (!open) return null;
  return <div className={`absolute z-[80] mt-2 min-w-full rounded-[14px] border border-[#e3e5e8] bg-white p-2 shadow-[0_12px_35px_rgba(0,0,0,.13)] ${className}`}>{children}</div>;
}

function SelectButton({ icon, value, onClick, open }: { icon?: React.ReactNode; value: string; onClick: () => void; open: boolean }) {
  return <button type="button" onClick={onClick} className={`flex h-[42px] w-full items-center gap-2 rounded-[9px] border bg-white px-3 text-start text-[14px] text-[#202124] transition ${open ? "border-[#9ab9f3] shadow-[0_0_0_2px_rgba(47,110,229,.08)]" : "border-[#d7d9dc] hover:border-[#b8bdc5]"}`}><span className="text-[#30343a]">{icon}</span><span className="min-w-0 flex-1 truncate">{value}</span><span className="text-[#5f6368]">⌄</span></button>;
}

function CategoryBlock({ category, selected, setSelected, ar }: { category: ActivityCategory; selected: Set<string>; setSelected: (next: Set<string>) => void; ar: boolean }) {
  const keys = category.items.map((item) => `${category.key}:${item.key}`);
  const all = keys.every((key) => selected.has(key));
  const toggleAll = () => { const next = new Set(selected); if (all) keys.forEach((key) => next.delete(key)); else keys.forEach((key) => next.add(key)); setSelected(next); };
  return <div className="min-w-0 pb-7"><div className="mb-4 flex items-center gap-2"><input type="checkbox" checked={all} onChange={toggleAll} className="h-[14px] w-[14px] accent-[#2f6ee5]" aria-label={ar ? category.ar : category.en} /><span className="text-[13px] font-semibold text-[#202124]">{ar ? category.ar : category.en}</span></div><div className="space-y-4 ps-1">{category.items.map((item) => { const key = `${category.key}:${item.key}`; return <Check key={key} checked={selected.has(key)} onChange={() => { const next = new Set(selected); if (next.has(key)) next.delete(key); else next.add(key); setSelected(next); }} label={ar ? item.ar : item.en} />; })}</div></div>;
}

function formatActor(member: AuditScopeMember, ar: boolean) { return member.name ? `${member.name}` : member.email; }

export default function AdminAuditPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [view, setView] = useState<"builder" | "report">("builder");
  const [scopes, setScopes] = useState<{ members: AuditScopeMember[]; teamFolders: AuditScopeTeamFolder[] }>({ members: [], teamFolders: [] });
  const [locationType, setLocationType] = useState<AuditReportCriteria["locationType"]>("ORGANIZATION");
  const [locationId, setLocationId] = useState<string | null>(null);
  const [actorId, setActorId] = useState<string | null>(null);
  const [range, setRange] = useState<AuditReportCriteria["range"]>("TODAY");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(allItemKeys));
  const [includeSystemActivities, setIncludeSystemActivities] = useState(false);
  const [open, setOpen] = useState<"location" | "actor" | "time" | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<AuditReport | null>(null);

  useEffect(() => { void getAuditScopes().then(setScopes).catch((e) => setError(e instanceof Error ? e.message : (ar ? "تعذر تحميل خيارات التقرير." : "Unable to load report options."))).finally(() => setLoading(false)); }, [ar]);

  const selectedCount = selected.size;
  const totalCount = allItemKeys.length;
  const allSelected = selectedCount === totalCount;
  const selectedCategories = useMemo(() => [...selected], [selected]);

  const locationLabel = locationType === "ORGANIZATION" ? (ar ? "المؤسسة بالكامل" : "Entire Organization") : locationType === "MY_FOLDERS" ? (ar ? "مجلداتي" : "My Folders") : scopes.teamFolders.find((x) => x.id === locationId)?.name || (ar ? "مجلد فريق" : "Team Folder");
  const actorLabel = actorId ? formatActor(scopes.members.find((m) => m.id === actorId) || { id: actorId, name: null, email: actorId, status: "" }, ar) : (ar ? "جميع الأعضاء" : "All Members");
  const rangeLabel = range === "TODAY" ? (ar ? "اليوم" : "Today") : range === "YESTERDAY" ? (ar ? "الأمس" : "Yesterday") : range === "LAST_7_DAYS" ? (ar ? "آخر 7 أيام" : "Last 7 days") : range === "LAST_30_DAYS" ? (ar ? "آخر 30 يوماً" : "Last 30 days") : (ar ? "نطاق مخصص" : "Custom Range");

  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(allItemKeys));
  const chooseLocation = (type: AuditReportCriteria["locationType"], id: string | null = null) => { setLocationType(type); setLocationId(id); setOpen(null); };
  const generate = async () => {
    if (locationType === "TEAM_FOLDER" && !locationId) { setError(ar ? "اختر مجلد فريق أولاً." : "Choose a Team Folder first."); return; }
    if (range === "CUSTOM" && (!from || !to)) { setError(ar ? "حدد تاريخ البداية والنهاية." : "Choose both custom range dates."); return; }
    setGenerating(true); setError("");
    try {
      const next = await generateAuditReport({ locationType, locationId, actorId, range, from: range === "CUSTOM" ? from : undefined, to: range === "CUSTOM" ? to : undefined, actions: selectedCategories, includeSystemActivities });
      setReport(next); setView("report");
    } catch (e) { setError(e instanceof Error ? e.message : (ar ? "تعذر إنشاء التقرير." : "Unable to generate report.")); }
    finally { setGenerating(false); }
  };

  const exportReport = () => {
    if (!report) return;
    const header = [ar ? "العضو" : "Activity by", ar ? "الوقت" : "Time", ar ? "الإجراء" : "Action", ar ? "الموقع" : "Location", ar ? "المورد" : "Resource", ar ? "مجلد الفريق" : "Team Folder"];
    const rows = report.rows.map((row) => [row.actor.name || row.actor.email || (ar ? "النظام" : "System"), new Date(row.createdAt).toLocaleString(), row.actionLabel, row.location, row.resourceName || row.resourceType, row.teamFolderName || ""]);
    const csv = [header, ...rows].map((line) => line.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `imkan-audit-report-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  if (view === "report" && report) return <ReportView report={report} ar={ar} locationLabel={locationLabel} actorLabel={actorLabel} rangeLabel={rangeLabel} onExport={exportReport} onChangeCriteria={() => setView("builder")} onNewReport={() => { setReport(null); setView("builder"); }} />;

  return <main className="h-full overflow-y-auto bg-white" dir={ar ? "rtl" : "ltr"}>
    <div className="min-h-full px-7 pb-12 pt-4 lg:px-9">
      <div className="flex items-start justify-between border-b border-[#ededed] pb-5"><div className="flex items-start gap-4"><div className="mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-[6px] border border-[#d7d9dc] text-[#202124]"><Icons.history size={23} /></div><div><h1 className="text-[21px] font-semibold leading-7 text-[#202124]">{ar ? "سجلات التدقيق والتقارير" : "Audit Logs & Reports"}</h1><p className="mt-1 max-w-[1050px] text-[12px] leading-5 text-[#4f5358]">{ar ? "أنشئ تقرير نشاط لأي عضو في الفريق خلال فترة زمنية محددة. طبّق الفلاتر على نشاط العضو عبر الملفات والمجلدات في الفريق، ثم صدّر التقرير عند الحاجة للتدقيق أو الأغراض القانونية." : "Generate an activity report for any team member over a specific time period. Apply filters to view the member's activity across files and folders in the team, and export the report when needed for auditing or legal purposes."}</p></div></div><button type="button" onClick={() => { setReport(null); setView("builder"); }} className="mt-1 hidden rounded-full bg-[#2f6ee5] px-5 py-2 text-[12px] font-semibold text-white shadow-sm hover:bg-[#255fca] lg:inline-flex">＋ {ar ? "تقرير جديد" : "NEW REPORT"}</button></div>

      <div className="mx-auto max-w-[1260px] pt-7">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <FilterSelect label={ar ? "إظهار في" : "Show in"} value={locationLabel} open={open === "location"} onClick={() => setOpen(open === "location" ? null : "location")} icon={<Icons.folder size={16} />}>
            <button type="button" onClick={() => chooseLocation("ORGANIZATION")} className={`flex w-full items-center justify-between rounded-[9px] px-3 py-2.5 text-start text-[13px] ${locationType === "ORGANIZATION" ? "bg-[#edf3ff] text-[#315da8]" : "hover:bg-[#f6f7f8]"}`}><span>{ar ? "المؤسسة بالكامل" : "Entire Organization"}</span>{locationType === "ORGANIZATION" ? "✓" : ""}</button>
            <button type="button" onClick={() => chooseLocation("MY_FOLDERS")} className={`flex w-full items-center justify-between rounded-[9px] px-3 py-2.5 text-start text-[13px] ${locationType === "MY_FOLDERS" ? "bg-[#edf3ff] text-[#315da8]" : "hover:bg-[#f6f7f8]"}`}><span>{ar ? "مجلداتي" : "My Folders"}</span>{locationType === "MY_FOLDERS" ? "✓" : ""}</button>
            {scopes.teamFolders.length ? <div className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-[#8a8e94]">{ar ? "مجلدات الفريق" : "TEAM FOLDERS"}</div> : null}
            {scopes.teamFolders.map((folder) => <button key={folder.id} type="button" onClick={() => chooseLocation("TEAM_FOLDER", folder.id)} className={`flex w-full items-center justify-between rounded-[9px] px-3 py-2.5 text-start text-[13px] ${locationId === folder.id ? "bg-[#edf3ff] text-[#315da8]" : "hover:bg-[#f6f7f8]"}`}><span className="flex min-w-0 items-center gap-2"><span className="truncate">{folder.name}</span>{folder.archivedAt ? <span className="text-[9px] text-[#8a8e94]">{ar ? "مؤرشف" : "Archived"}</span> : null}</span>{locationId === folder.id ? "✓" : ""}</button>)}
          </FilterSelect>

          <FilterSelect label={ar ? "النشاط بواسطة" : "Activity by"} value={actorLabel} open={open === "actor"} onClick={() => setOpen(open === "actor" ? null : "actor")} icon={<Icons.users size={16} />}>
            <button type="button" onClick={() => { setActorId(null); setOpen(null); }} className={`w-full rounded-[9px] px-3 py-2.5 text-start text-[13px] ${!actorId ? "bg-[#edf3ff] text-[#315da8]" : "hover:bg-[#f6f7f8]"}`}><span className="font-medium">{ar ? "جميع الأعضاء" : "All Members"}</span><span className="mt-0.5 block text-[10px] text-[#7b8086]">{ar ? "البحث في جميع أعضاء المؤسسة" : "Search in all members"}</span></button>
            <div className="my-1 border-t border-[#ededed]" />
            {scopes.members.filter((m) => m.status !== "REMOVED").map((member) => <button key={member.id} type="button" onClick={() => { setActorId(member.id); setOpen(null); }} className={`flex w-full items-center gap-3 rounded-[9px] px-3 py-2.5 text-start ${actorId === member.id ? "bg-[#edf3ff]" : "hover:bg-[#f6f7f8]"}`}><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#e9edf3] text-[10px] font-semibold text-[#4b5563]">{(member.name || member.email).slice(0, 2).toUpperCase()}</span><span className="min-w-0"><span className="block truncate text-[13px] font-semibold text-[#202124]">{formatActor(member, ar)}</span><span className="block truncate text-[10px] text-[#7b8086]">{member.email}</span></span>{actorId === member.id ? <span className="ms-auto">✓</span> : null}</button>)}
          </FilterSelect>

          <FilterSelect label={ar ? "الوقت" : "Time"} value={rangeLabel} open={open === "time"} onClick={() => setOpen(open === "time" ? null : "time")}>
            {(["TODAY", "YESTERDAY", "LAST_7_DAYS", "LAST_30_DAYS", "CUSTOM"] as const).map((key) => <button key={key} type="button" onClick={() => { setRange(key); setOpen(null); }} className={`block w-full rounded-[9px] px-3 py-2.5 text-start text-[13px] ${range === key ? "bg-[#edf3ff] text-[#315da8]" : "hover:bg-[#f6f7f8]"}`}>{key === "TODAY" ? (ar ? "اليوم" : "Today") : key === "YESTERDAY" ? (ar ? "الأمس" : "Yesterday") : key === "LAST_7_DAYS" ? (ar ? "آخر 7 أيام" : "Last 7 days") : key === "LAST_30_DAYS" ? (ar ? "آخر 30 يوماً" : "Last 30 days") : (ar ? "نطاق مخصص" : "Custom Range")}</button>)}
          </FilterSelect>
        </div>

        {range === "CUSTOM" ? <div className="mt-4 flex flex-wrap items-end gap-3 rounded-[10px] border border-[#e3e5e8] bg-[#fafafa] p-4"><label className="text-[11px] font-medium text-[#4f5358]"><span className="mb-1 block">{ar ? "من" : "From"}</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-[8px] border border-[#d7d9dc] bg-white px-3 text-[12px]" /></label><label className="text-[11px] font-medium text-[#4f5358]"><span className="mb-1 block">{ar ? "إلى" : "To"}</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-[8px] border border-[#d7d9dc] bg-white px-3 text-[12px]" /></label></div> : null}

        <div className="mt-7 flex items-center justify-between"><div className="text-[13px] text-[#202124]"><span className="font-medium">{ar ? "حدد النشاط:" : "Select activity:"}</span> <span className="text-[#4f5358]">{allSelected ? (ar ? "تم تحديد الكل" : "All selected") : `${selectedCount} ${ar ? "محدد" : "selected"}`}</span></div><Check checked={allSelected} onChange={toggleAll} label={ar ? "تحديد الكل" : "Select all"} /></div>

        <div className="mt-3 max-h-[480px] overflow-y-auto rounded-[14px] border border-[#d8dadd] bg-white p-7 shadow-[0_1px_2px_rgba(0,0,0,.02)]"><div className="grid grid-cols-1 gap-x-14 sm:grid-cols-2 xl:grid-cols-4">{CATEGORIES.map((category) => <CategoryBlock key={category.key} category={category} selected={selected} setSelected={setSelected} ar={ar} />)}</div></div>

        {error ? <div className="mt-4 rounded-[9px] border border-[#f0caca] bg-[#fff7f7] px-4 py-3 text-[12px] text-[#a52a2a]">{error}</div> : null}
        <div className="mt-5 flex items-center justify-between"><label className="flex items-center gap-2 text-[12px] text-[#33373c]"><input type="checkbox" checked={includeSystemActivities} onChange={(e) => setIncludeSystemActivities(e.target.checked)} className="h-[14px] w-[14px] accent-[#2f6ee5]" />{ar ? "إظهار الأنشطة المؤتمتة بواسطة النظام" : "Show system-automated activities"}<span className="grid h-4 w-4 place-items-center rounded-full border border-[#9da2a8] text-[9px] text-[#6d7278]">?</span></label><button type="button" disabled={loading || generating || selectedCount === 0} onClick={() => void generate()} className="rounded-full bg-[#2f6ee5] px-5 py-2.5 text-[12px] font-semibold text-white shadow-sm transition hover:bg-[#255fca] disabled:cursor-not-allowed disabled:opacity-50">{generating ? (ar ? "جارٍ إنشاء التقرير…" : "GENERATING…") : (ar ? "إنشاء التقرير" : "GENERATE REPORT")}</button></div>
      </div>
    </div>
  </main>;
}

function FilterSelect({ label, value, open, onClick, icon, children }: { label: string; value: string; open: boolean; onClick: () => void; icon?: React.ReactNode; children: React.ReactNode }) {
  return <div className="relative"><div className="mb-2 text-[12px] font-medium text-[#30343a]">{label}</div><SelectButton icon={icon} value={value} onClick={onClick} open={open} /><Popover open={open} className="start-0 top-[70px] w-full max-h-[360px] overflow-y-auto">{children}</Popover></div>;
}

function ReportView({ report, ar, locationLabel, actorLabel, rangeLabel, onExport, onChangeCriteria, onNewReport }: { report: AuditReport; ar: boolean; locationLabel: string; actorLabel: string; rangeLabel: string; onExport: () => void; onChangeCriteria: () => void; onNewReport: () => void }) {
  return <main className="h-full overflow-y-auto bg-white" dir={ar ? "rtl" : "ltr"}><div className="min-h-full px-7 pb-12 pt-4 lg:px-9"><div className="flex items-start justify-between border-b border-[#ededed] pb-5"><div className="flex items-start gap-4"><div className="mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-[6px] border border-[#d7d9dc]"><Icons.history size={23} /></div><div><h1 className="text-[21px] font-semibold text-[#202124]">{ar ? "سجلات التدقيق والتقارير" : "Audit Logs & Reports"}</h1><p className="mt-1 text-[12px] text-[#4f5358]">{ar ? "عرض نتائج التقرير الذي تم إنشاؤه وفق معايير التدقيق المحددة." : "Review the activity report generated from the selected audit criteria."}</p></div></div><button type="button" onClick={onNewReport} className="rounded-full bg-[#2f6ee5] px-5 py-2 text-[12px] font-semibold text-white">＋ {ar ? "تقرير جديد" : "NEW REPORT"}</button></div><div className="pt-7"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-[18px] font-semibold text-[#202124]">{ar ? "تم تحديد جميع الأنشطة" : "All the activities are selected"}</h2><p className="mt-1 text-[12px] text-[#5f6368]">{ar ? `عرض الأنشطة في ${locationLabel} بواسطة ${actorLabel}، ${rangeLabel}.` : `Showing activities in ${locationLabel} by ${actorLabel}, ${rangeLabel}.`}</p><p className="mt-1 text-[10px] text-[#8a8e94]">{report.total} {ar ? "سجل" : "records"} · {new Date(report.generatedAt).toLocaleString()}</p></div><div className="flex items-center gap-2"><button type="button" onClick={onExport} className="rounded-full border border-[#d7d9dc] bg-white px-4 py-2 text-[11px] font-semibold text-[#30343a] hover:bg-[#f7f7f7]">{ar ? "تصدير" : "Export"}</button><button type="button" onClick={onChangeCriteria} className="rounded-full border border-[#d7d9dc] bg-white px-4 py-2 text-[11px] font-semibold text-[#30343a] hover:bg-[#f7f7f7]">{ar ? "تغيير المعايير" : "Change Criteria"}</button></div></div><div className="overflow-hidden border-t border-[#e4e5e7]"><div className="grid grid-cols-[1.05fr_.85fr_2fr_1fr] border-b border-[#e4e5e7] bg-white px-3 py-3 text-[11px] font-medium text-[#30343a]"><span>{ar ? "النشاط بواسطة" : "Activity by"}</span><span>{ar ? "الوقت" : "Time"}</span><span>{ar ? "الإجراء" : "Action"}</span><span>{ar ? "الموقع" : "Location"}</span></div>{report.rows.length ? report.rows.map((row) => <div key={row.id} className="grid grid-cols-[1.05fr_.85fr_2fr_1fr] items-center border-b border-[#ececec] px-3 py-3.5 text-[11px] text-[#202124]"><div className="flex min-w-0 items-center gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-[#e9edf3] text-[9px] font-semibold text-[#4b5563]">{(row.actor.name || row.actor.email || "S").slice(0,2).toUpperCase()}</span><span className="min-w-0"><span className="block truncate font-medium">{row.actor.name || row.actor.email || (ar ? "النظام" : "System")}</span>{row.teamFolderName ? <span className="block truncate text-[9px] text-[#8a8e94]">{ar ? `في ${row.teamFolderName}` : `In ${row.teamFolderName}`}</span> : row.resourceName ? <span className="block truncate text-[9px] text-[#8a8e94]">{row.resourceName}</span> : null}</span></div><span className="text-[#4f5358]">{new Date(row.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span><span className="min-w-0"><span className="block font-medium">{row.actionLabel}</span>{row.resourceName ? <span className="mt-0.5 block truncate text-[10px] text-[#5f6368]">{row.resourceName}</span> : null}</span><span className="truncate text-[#5f6368]">{row.location}</span></div>) : <div className="p-14 text-center text-[12px] text-[#8a8e94]">{ar ? "لا توجد أنشطة مطابقة للمعايير المحددة." : "No activities matched the selected criteria."}</div>}</div></div></div></main>;
}
