"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useLocale } from "@/components/locale-provider";
import { Icons } from "@/components/layout/icons";
import { getAdminOverview, listAdminUsers, type AdminOverview, type AdminUser } from "@/lib/api/admin";
import { getEnterpriseDashboard, type EnterpriseDashboard } from "@/lib/api/enterprise";
import { listTeamFolders, type TeamFolderListItem } from "@/lib/api/team-folders";
import { getStorageOverview, type QuotaOverview } from "@/lib/api/quota";
import { listCollaborationActivity, type CollaborationActivity } from "@/lib/api/notifications";

function bytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / Math.pow(1024, index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function initials(name?: string | null, email?: string | null) {
  return (name || email || "U").split(/\s+/).map((x) => x[0]).join("").slice(0, 2).toUpperCase();
}

const actionLabel: Record<string, string> = {
  PREVIEW: "Preview", UPLOAD: "Upload", CREATE: "Create", UPDATE: "Edit", DOWNLOAD: "Download",
  UPLOAD_VERSION: "Upload", DELETE: "Delete", SHARE: "Share", COMMENT: "Comment", MOVE: "Move",
};

function ActivityChart({ rows, ar }: { rows: CollaborationActivity[]; ar: boolean }) {
  const points = useMemo(() => {
    const now = new Date();
    const counts = Array.from({ length: 30 }, (_, index) => {
      const date = new Date(now); date.setHours(0, 0, 0, 0); date.setDate(now.getDate() - (29 - index));
      const key = date.toISOString().slice(0, 10);
      return { key, count: 0 };
    });
    const byDate = new Map(counts.map((x) => [x.key, x]));
    rows.forEach((row) => { const item = byDate.get(new Date(row.createdAt).toISOString().slice(0, 10)); if (item) item.count += 1; });
    return counts;
  }, [rows]);
  const max = Math.max(1, ...points.map((p) => p.count));
  const width = 920, height = 220, padX = 16, padY = 18;
  const coords = points.map((p, i) => `${padX + (i * (width - padX * 2)) / Math.max(points.length - 1, 1)},${height - padY - (p.count / max) * (height - padY * 2)}`).join(" ");
  return <div className="relative h-[250px] w-full overflow-hidden rounded-xl bg-white"><div className="absolute inset-x-4 top-4 flex justify-between text-[9px] text-slate-400"><span>{ar ? "عدد الملفات خلال آخر 30 يوماً" : "Files activity during the last 30 days"}</span><span>{rows.length} events</span></div><svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="absolute inset-x-3 bottom-2 top-10 h-[195px] w-[calc(100%-24px)]"><g stroke="#edf0f4" strokeWidth="1">{[0,1,2,3,4].map((n) => <line key={n} x1="0" x2={width} y1={18 + n * 45} y2={18 + n * 45} />)}</g>{rows.length ? <polyline points={coords} fill="none" stroke="#18b79b" strokeWidth="2.4" vectorEffect="non-scaling-stroke" /> : null}{points.map((p, i) => p.count ? <circle key={p.key} cx={padX + (i * (width - padX * 2)) / Math.max(points.length - 1, 1)} cy={height - padY - (p.count / max) * (height - padY * 2)} r="3.2" fill="#fff" stroke="#18b79b" strokeWidth="2" vectorEffect="non-scaling-stroke" /> : null)}</svg></div>;
}

export default function AdminPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [enterprise, setEnterprise] = useState<EnterpriseDashboard | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [teamFolders, setTeamFolders] = useState<TeamFolderListItem[]>([]);
  const [activity, setActivity] = useState<CollaborationActivity[]>([]);
  const [quota, setQuota] = useState<QuotaOverview | null>(null);
  const [error, setError] = useState("");
  const [selectedActivity, setSelectedActivity] = useState("PREVIEW");

  useEffect(() => {
    Promise.all([getAdminOverview(), getEnterpriseDashboard(), listAdminUsers(), listTeamFolders(), listCollaborationActivity(120), getStorageOverview()])
      .then(([o, d, u, tf, a, q]) => { setOverview(o); setEnterprise(d); setUsers(u); setTeamFolders(tf.teamFolders ?? []); setActivity(a); setQuota(q); })
      .catch(() => setError(ar ? "تعذر تحميل بيانات وحدة الإدارة." : "Unable to load Admin Console data."));
  }, [ar]);

  const filteredActivity = activity.filter((row) => selectedActivity === "ALL" || (selectedActivity === "UPDATE" ? ["UPDATE", "EDIT"].includes(row.action) : row.action === selectedActivity));
  const actionCounts = { PREVIEW: activity.filter((x) => x.action === "PREVIEW").length, UPLOAD: activity.filter((x) => ["UPLOAD", "UPLOAD_VERSION"].includes(x.action)).length, CREATE: activity.filter((x) => x.action === "CREATE").length, UPDATE: activity.filter((x) => ["UPDATE", "EDIT"].includes(x.action)).length, DOWNLOAD: activity.filter((x) => x.action === "DOWNLOAD").length };
  const topFolders = [...teamFolders].sort((a, b) => (Number(b.storageUsedBytes ?? b.size ?? 0) - Number(a.storageUsedBytes ?? a.size ?? 0))).slice(0, 4);
  const adminUser = users.find((u) => u.role === "SUPER_ADMIN") || users.find((u) => u.role === "ADMIN") || users[0];
  const quotaBytes = quota?.buckets.total.quotaBytes ?? 0;
  const usagePct = quota && !quota.unlimited && quotaBytes > 0 ? Math.min(100, Math.round((enterprise?.storage.usedBytes ?? quota.buckets.total.usedBytes) / quotaBytes * 100)) : 0;

  return <main className="h-full overflow-y-auto bg-[#f7f7f7]" dir={ar ? "rtl" : "ltr"}>
    <div className="border-b border-slate-200 bg-white px-7 py-4 lg:px-8"><div className="flex items-center justify-between"><div><div className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#2c66dd]">{ar ? "وحدة الإدارة" : "Administration"}</div><h1 className="mt-0.5 text-[20px] font-semibold text-slate-950">{ar ? "لوحة التحكم" : "Dashboard"}</h1></div><Link href="/admin/settings" className="rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-700">{ar ? "إعدادات المؤسسة" : "Organization settings"}</Link></div></div>
    <div className="mx-auto max-w-[1420px] space-y-6 p-5 lg:p-7">
      {error ? <div className="rounded-xl bg-red-50 p-3 text-[11px] text-red-700">{error}</div> : null}

      <section className="grid gap-5 xl:grid-cols-3">
        <article className="min-h-[185px] rounded-[18px] border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,.03)]"><div className="flex items-start justify-between"><div><h2 className="text-[15px] font-semibold">{ar ? "المؤسسة" : "Organization"}</h2><p className="mt-3 text-[12px] text-slate-600">IMKAN WorkDrive</p><p className="mt-1 text-[12px] text-slate-500">{overview ? `${overview.users} ${ar ? "مستخدم" : "users"}` : "—"} · {overview ? `${overview.teamFolders} ${ar ? "مجلدات فريق" : "team folders"}` : "—"}</p></div><Link href="/admin/settings" className="text-[11px] font-semibold text-[#175cd3]">{ar ? "إدارة" : "Manage"}</Link></div><div className="mt-7 rounded-xl bg-slate-50 px-3 py-2 text-[10px] text-slate-500">{ar ? "بيانات الاشتراك الفعلية تُدار من إعدادات المؤسسة؛ لا يتم عرض خطة وهمية." : "Subscription data is managed by the organization settings; no synthetic plan is displayed."}</div></article>
        <article className="min-h-[185px] rounded-[18px] border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,.03)]"><div className="flex items-start justify-between"><div><h2 className="text-[15px] font-semibold">{ar ? "أعضاء الفريق" : "Team Members"}</h2><p className="mt-4 text-[12px] text-slate-600">{ar ? "النشطون" : "Active members"} · <b>{enterprise?.users.active ?? "—"}</b></p><p className="mt-1 text-[12px] text-slate-500">{ar ? "الموقوفون" : "Suspended"} · {enterprise?.users.suspended ?? 0}</p></div><Link href="/admin/members" className="text-[11px] font-semibold text-[#175cd3]">{ar ? "إدارة" : "Manage"}</Link></div>{adminUser?<div className="mt-5 flex items-center gap-2 rounded-full bg-slate-50 px-3 py-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#dfe9ff] text-[9px] font-bold text-[#315da8]">{initials(adminUser.name,adminUser.email)}</span><span className="truncate text-[10px] font-semibold text-slate-700">{adminUser.email}</span></div>:null}</article>
        <article className="min-h-[185px] rounded-[18px] border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,.03)]"><h2 className="text-[15px] font-semibold">{ar ? "مستخدمو العملاء" : "Client Users"}</h2><div className="flex h-[120px] flex-col items-center justify-center text-center"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#fff3d6] text-[#e89a00]"><Icons.users size={23} /></span><p className="mt-3 text-[11px] text-slate-500">{ar ? "لا توجد طبقة تراخيص مهيأة حالياً." : "No client-user licensing layer is configured."}</p><Link href="/admin/client-users" className="mt-2 text-[11px] font-semibold text-[#175cd3]">{ar ? "عرض الواجهة" : "Open client users"}</Link></div></article>
      </section>

      <section className="rounded-[18px] border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,.03)]"><div className="flex items-start justify-between"><div><h2 className="text-[17px] font-semibold">{ar ? "المساحة المستخدمة" : "Storage used"}</h2><div className="mt-5 flex items-end gap-2"><span className="text-[26px] font-semibold">{bytes(enterprise?.storage.usedBytes ?? 0)}</span><span className="pb-1 text-[11px] text-slate-500">{ar ? "المستخدمة حالياً" : "currently used"}</span></div></div><Link href="/admin/data-administration" className="text-[11px] font-semibold text-[#175cd3]">{ar ? "عرض كل التخزين" : "View all storage"}</Link></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#2dbb9c]" style={{width:`${Math.max(usagePct, enterprise?.storage.usedBytes ? 1 : 0)}%`}} /></div><div className="mt-2 flex justify-between text-[10px] text-slate-500"><span>{quota?.unlimited ? (ar ? "غير محدود" : "Unlimited") : `${usagePct}% ${ar ? "من الحصة" : "of quota"}`}</span><span>{enterprise?.storage.files ?? 0} {ar ? "ملف" : "files"}</span></div>
        <div className="mt-7 grid gap-6 border-t border-slate-100 pt-5 lg:grid-cols-3"><div><div className="mb-3 flex items-center justify-between"><h3 className="text-[12px] font-semibold">{ar ? "مجلدات الفريق حسب الاستخدام" : "Team Folders by Usage"}</h3><Link href="/admin/team-folders" className="text-[10px] font-semibold text-[#175cd3]">{ar ? "إدارة" : "Manage"}</Link></div>{topFolders.length?topFolders.map((f)=><div key={f.id} className="flex items-center justify-between py-1.5 text-[10px]"><span className="flex min-w-0 items-center gap-2 truncate"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100"><Icons.folder size={13}/></span>{f.name}</span><span className="text-slate-500">{bytes(Number((f as any).storageUsedBytes ?? (f as any).size ?? 0))}</span></div>):<span className="text-[10px] text-slate-400">{ar?'لا توجد بيانات.':'No usage data.'}</span>}</div><div><div className="mb-3 flex items-center justify-between"><h3 className="text-[12px] font-semibold">{ar ? "إدارة البيانات" : "Data Administration"}</h3><Link href="/admin/data-administration" className="text-[10px] font-semibold text-[#175cd3]">{ar ? "فتح" : "Open"}</Link></div><div className="rounded-xl bg-slate-50 p-4 text-[10px] text-slate-500">{ar ? "عرض مؤشرات وبيانات المؤسسة من وحدة الإدارة." : "Review organization data and administration from this console."}</div></div><div><div className="mb-3 flex items-center justify-between"><h3 className="text-[12px] font-semibold">{ar ? "الملفات الكبيرة" : "Large files by storage"}</h3><Link href="/admin/data-administration" className="text-[10px] font-semibold text-[#175cd3]">{ar ? "إدارة" : "Manage"}</Link></div>{enterprise?.largeFiles?.length?enterprise.largeFiles.slice(0,4).map(f=><div key={f.id} className="flex items-center justify-between py-1.5 text-[10px]"><span className="max-w-[210px] truncate">{f.name}</span><span className="text-slate-500">{bytes(Number(f.size))}</span></div>):<span className="text-[10px] text-slate-400">{ar?'لا توجد ملفات كبيرة.':'No large files found.'}</span>}</div></div></section>

      <section className="rounded-[18px] border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,.03)]"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-[17px] font-semibold">{ar ? "نشاط الملفات" : "File Activity"}</h2><p className="mt-1 text-[10px] text-slate-500">{ar ? "الأحداث الفعلية من مركز التعاون خلال آخر 30 يوماً." : "Real events from the Collaboration Center over the last 30 days."}</p></div><Link href="/admin/audit" className="text-[11px] font-semibold text-[#175cd3]">{ar ? "سجلات كاملة" : "View full logs"}</Link></div><div className="mb-3 flex flex-wrap gap-5 border-b border-slate-100 text-[11px]">{["PREVIEW","UPLOAD","CREATE","UPDATE","DOWNLOAD"].map((key)=><button key={key} type="button" onClick={() => setSelectedActivity(key)} className={`border-b-2 pb-2 text-[11px] ${selectedActivity===key ? "border-[#2c66dd] font-semibold text-[#175cd3]" : "border-transparent text-slate-600"}`}>{actionLabel[key]} <b className="ms-1 text-[9px]">{actionCounts[key as keyof typeof actionCounts]}</b></button>)}</div><ActivityChart rows={filteredActivity} ar={ar}/></section>

      <section className="grid gap-5 lg:grid-cols-3">
        <Link href="/admin/team-folders" className="rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-[#9bb9f5]">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#edf3ff] text-[#2c66dd]"><Icons.folder size={19}/></div>
          <h3 className="mt-4 text-[13px] font-semibold">{ar ? "مجلدات الفريق" : "Team Folders"}</h3>
          <p className="mt-1 text-[10px] leading-5 text-slate-500">{ar ? "إنشاء وإدارة ومراجعة مجلدات الفريق مباشرة داخل وحدة الإدارة." : "Create and manage Team Folders directly inside the Admin Console."}</p>
        </Link>
        <Link href="/admin/members" className="rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-[#9bb9f5]">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#edf3ff] text-[#2c66dd]"><Icons.users size={19}/></div>
          <h3 className="mt-4 text-[13px] font-semibold">{ar ? "الأعضاء" : "Members"}</h3>
          <p className="mt-1 text-[10px] leading-5 text-slate-500">{ar ? "دعوة الأعضاء وإيقافهم وتنشيطهم وإدارة أدوارهم من وحدة الإدارة." : "Invite, suspend, activate, and manage member roles from the Admin Console."}</p>
        </Link>
        <Link href="/admin/settings?settingtab=sharing" className="rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-[#9bb9f5]">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#edf3ff] text-[#2c66dd]"><Icons.share size={19}/></div>
          <h3 className="mt-4 text-[13px] font-semibold">{ar ? "المشاركة والسياسات" : "Sharing & Policies"}</h3>
          <p className="mt-1 text-[10px] leading-5 text-slate-500">{ar ? "تعديل سياسات المشاركة والروابط والاحتفاظ من نفس وحدة الإدارة." : "Change sharing, links, and retention policies without leaving the Admin Console."}</p>
        </Link>
      </section>
    </div>
  </main>;
}
