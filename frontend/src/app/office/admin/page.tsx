"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getOfficeAdminCenter, updateOfficeSecurityPolicy, updateOfficeAuditPolicy, type OfficeAdminCenter } from "@/lib/api/office";
import { useLocale } from "@/components/locale-provider";
import { getOfficeEmailSettings, updateOfficeEmailSettings, testOfficeEmail, type OfficeEmailSettings } from "@/lib/api/office-email";
import { listConnections, type Connection } from "@/lib/api/workflows";

const labels = {
  WRITER: { en: "Writer", ar: "Writer" }, SHEET: { en: "Sheet", ar: "Sheet" }, SHOW: { en: "Show", ar: "Show" },
};

function Card({ title, value, hint }: { title: string; value: string | number; hint?: string }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-[10px] font-medium text-slate-500">{title}</div><div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>{hint && <div className="mt-1 text-[9px] text-slate-400">{hint}</div>}</section>;
}

export default function OfficeAdminPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const router = useRouter();
  const [data, setData] = useState<OfficeAdminCenter | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [policyBusy, setPolicyBusy] = useState(false);
  const [emailSettings, setEmailSettings] = useState<OfficeEmailSettings | null>(null);
  const [emailConnections, setEmailConnections] = useState<Connection[]>([]);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailTestTo, setEmailTestTo] = useState("");

  const load = async () => {
    setRefreshing(true); setError("");
    try { setData(await getOfficeAdminCenter()); } catch (e) { setError(e instanceof Error ? e.message : (ar ? "تعذر تحميل مركز إدارة Office." : "Unable to load Office Admin Center.")); }
    finally { setRefreshing(false); }
  };
  useEffect(() => { void load(); void getOfficeEmailSettings().then(setEmailSettings).catch(() => setEmailSettings(null)); void listConnections({ status: "ACTIVE" }).then(setEmailConnections).catch(() => setEmailConnections([])); }, []);

  const security = data?.policies.security;
  const audit = data?.policies.audit;
  const setSecurity = async (key: "forceReadOnly" | "disableExport" | "disableCopy" | "disableOffline" | "requireWatermark", value: boolean) => {
    setPolicyBusy(true);
    try { await updateOfficeSecurityPolicy({ [key]: value }); await load(); } finally { setPolicyBusy(false); }
  };
  const setAudit = async (key: "immutableChain" | "exportEnabled", value: boolean) => {
    setPolicyBusy(true);
    try { await updateOfficeAuditPolicy({ [key]: value }); await load(); } finally { setPolicyBusy(false); }
  };
  const jobs = data?.backgroundJobs ?? {};
  const runs = data?.automationRuns ?? {};

  return <main dir={ar ? "rtl" : "ltr"} className="min-h-screen bg-slate-50 p-4 text-slate-800 md:p-8">
    <div className="mx-auto max-w-7xl">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div><button onClick={() => router.push("/office/new")} className="mb-3 rounded-lg border bg-white px-3 py-1.5 text-[10px] text-slate-600">← {ar ? "IMKAN Office" : "IMKAN Office"}</button><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{ar ? "مركز الإدارة" : "Administration"}</div><h1 className="mt-1 text-2xl font-semibold text-slate-900">{ar ? "مركز إدارة IMKAN Office" : "IMKAN Office Admin Center"}</h1><p className="mt-1 text-xs text-slate-500">{ar ? "إدارة Office الأصلية، التعاون، القوالب، المهام والسياسات من مساحة واحدة." : "Manage native Office, collaboration, templates, jobs and governance from one place."}</p></div>
        <button disabled={refreshing} onClick={() => void load()} className="rounded-xl bg-slate-900 px-4 py-2 text-[10px] font-medium text-white disabled:opacity-50">{refreshing ? (ar ? "جارٍ التحديث…" : "Refreshing…") : (ar ? "تحديث" : "Refresh")}</button>
      </header>
      {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{error}</div>}
      {!data && !error && <div className="rounded-2xl border bg-white p-10 text-center text-xs text-slate-500">{ar ? "جارٍ تحميل مركز الإدارة…" : "Loading Admin Center…"}</div>}
      {data && <>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card title={ar ? "مستندات Office" : "Office documents"} value={data.documents.total} hint={`${data.documents.byType.WRITER ?? 0} Writer · ${data.documents.byType.SHEET ?? 0} Sheet · ${data.documents.byType.SHOW ?? 0} Show`} />
          <Card title={ar ? "جلسات نشطة" : "Active sessions"} value={data.collaboration.activeSessions} hint={`${data.collaboration.activePresence} ${ar ? "حضور نشط" : "active presence"}`} />
          <Card title={ar ? "عمليات التعاون / 24 ساعة" : "Operations / 24h"} value={data.collaboration.operations24h} />
          <Card title={ar ? "القوالب النشطة" : "Active templates"} value={data.templates.active} hint={`${data.templates.variables} ${ar ? "متغير قالب" : "template variables"}`} />
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <section className="rounded-2xl border bg-white p-5 shadow-sm"><h2 className="text-sm font-semibold">{ar ? "حالة المهام الخلفية" : "Background jobs"}</h2><div className="mt-4 grid grid-cols-2 gap-2">{Object.entries(jobs).map(([status,count]) => <div key={status} className="rounded-xl border p-3"><div className="text-[9px] text-slate-500">{status}</div><div className="mt-1 text-lg font-semibold">{count}</div></div>)}</div></section>
          <section className="rounded-2xl border bg-white p-5 shadow-sm"><h2 className="text-sm font-semibold">{ar ? "أتمتة القوالب" : "Template automation"}</h2><div className="mt-4 grid grid-cols-2 gap-2">{Object.entries(runs).map(([status,count]) => <div key={status} className="rounded-xl border p-3"><div className="text-[9px] text-slate-500">{status}</div><div className="mt-1 text-lg font-semibold">{count}</div></div>)}</div></section>
          <section className="rounded-2xl border bg-white p-5 shadow-sm"><h2 className="text-sm font-semibold">{ar ? "سياسات Office" : "Office policies"}</h2><div className="mt-4 space-y-2 text-[10px]">{([["forceReadOnly", ar ? "قراءة فقط للمؤسسة" : "Force read only", Boolean(security?.forceReadOnly)], ["disableExport", ar ? "تعطيل التصدير" : "Disable export", Boolean(security?.disableExport)], ["disableCopy", ar ? "تعطيل النسخ" : "Disable copy", Boolean(security?.disableCopy)], ["disableOffline", ar ? "تعطيل العمل دون اتصال" : "Disable offline", Boolean(security?.disableOffline)], ["requireWatermark", ar ? "فرض العلامة المائية" : "Require watermark", Boolean(security?.requireWatermark)]] as const).map(([key,label,value]) => <label key={key} className="flex items-center justify-between rounded-lg border px-3 py-2"><span>{label}</span><input type="checkbox" disabled={policyBusy} checked={value} onChange={e => void setSecurity(key, e.target.checked)} /></label>)}<label className="flex items-center justify-between rounded-lg border px-3 py-2"><span>{ar ? "سلسلة التدقيق" : "Audit chain"}</span><input type="checkbox" disabled={policyBusy} checked={Boolean(audit?.immutableChain)} onChange={e => void setAudit("immutableChain", e.target.checked)} /></label><label className="flex items-center justify-between rounded-lg border px-3 py-2"><span>{ar ? "تصدير التدقيق" : "Audit export"}</span><input type="checkbox" disabled={policyBusy} checked={Boolean(audit?.exportEnabled)} onChange={e => void setAudit("exportEnabled", e.target.checked)} /></label><div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2"><span>{ar ? "الاحتفاظ" : "Retention"}</span><b>{audit?.retentionDays ?? "—"} {ar ? "يوم" : "days"}</b></div></div></section>
        </div>

        <section className="mt-5 rounded-2xl border bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-semibold">{ar ? "تكامل البريد الإلكتروني" : "Email Integration"}</h2><p className="mt-1 text-[10px] text-slate-500">{ar ? "إرسال روابط المشاركة ونتائج إنشاء المستندات من Workflows عبر SendGrid أو Gmail OAuth." : "Send share links and generated Office documents from Workflows through SendGrid or Gmail OAuth."}</p></div><span className={`rounded-full px-2 py-1 text-[9px] ${emailSettings?.configured && emailSettings.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{emailSettings?.configured && emailSettings.enabled ? (ar ? "مفعل" : "Enabled") : (ar ? "غير مهيأ" : "Not configured")}</span></div><div className="mt-4 grid gap-3 md:grid-cols-2"><label className="text-[10px] font-medium text-slate-700"><span>{ar ? "المزود" : "Provider"}</span><select value={emailSettings?.provider ?? "SENDGRID"} onChange={e=>setEmailSettings(v=>v?{...v,provider:e.target.value as "SENDGRID"|"GMAIL"}:({configured:false,enabled:true,provider:e.target.value as "SENDGRID"|"GMAIL",connectionId:"",fromEmail:"",fromName:""}))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-[11px]"><option value="SENDGRID">SendGrid</option><option value="GMAIL">Gmail</option></select></label><label className="text-[10px] font-medium text-slate-700"><span>{ar ? "اتصال البريد" : "Email connection"}</span><select value={emailSettings?.connectionId ?? ""} onChange={e=>setEmailSettings(v=>v?{...v,connectionId:e.target.value}:v)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-[11px]"><option value="">{ar ? "اختر اتصالاً" : "Select connection"}</option>{emailConnections.filter(c=>c.provider === (emailSettings?.provider === "GMAIL" ? "google" : "sendgrid")).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="text-[10px] font-medium text-slate-700"><span>{ar ? "من البريد" : "From email"}</span><input value={emailSettings?.fromEmail ?? ""} onChange={e=>setEmailSettings(v=>v?{...v,fromEmail:e.target.value}:v)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-[11px]" placeholder="office@example.com" /></label><label className="text-[10px] font-medium text-slate-700"><span>{ar ? "اسم المرسل" : "From name"}</span><input value={emailSettings?.fromName ?? ""} onChange={e=>setEmailSettings(v=>v?{...v,fromName:e.target.value}:v)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-[11px]" placeholder="IMKAN Office" /></label></div><div className="mt-3 flex flex-wrap items-center gap-2"><label className="flex items-center gap-2 text-[10px]"><input type="checkbox" checked={emailSettings?.enabled ?? true} onChange={e=>setEmailSettings(v=>v?{...v,enabled:e.target.checked}:v)} />{ar ? "تفعيل إرسال البريد" : "Enable email delivery"}</label><button disabled={emailBusy} onClick={()=>{if(!emailSettings)return;setEmailBusy(true);void updateOfficeEmailSettings(emailSettings).then(setEmailSettings).finally(()=>setEmailBusy(false));}} className="rounded-lg bg-slate-900 px-3 py-2 text-[10px] text-white disabled:opacity-50">{emailBusy?(ar?"جارٍ الحفظ…":"Saving…"):(ar?"حفظ إعدادات البريد":"Save email settings")}</button><input value={emailTestTo} onChange={e=>setEmailTestTo(e.target.value)} placeholder={ar?"اختبار إلى…":"Test recipient…"} className="rounded-lg border px-3 py-2 text-[10px]"/><button disabled={emailBusy || !emailSettings?.configured} onClick={()=>{setEmailBusy(true);void testOfficeEmail(emailTestTo||undefined).finally(()=>setEmailBusy(false));}} className="rounded-lg border px-3 py-2 text-[10px] disabled:opacity-50">{ar?"اختبار الإرسال":"Send test"}</button></div></section>

        <section className="mt-5 rounded-2xl border bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">{ar ? "أحدث مستندات Office" : "Recent Office documents"}</h2><span className="text-[9px] text-slate-400">{new Date(data.generatedAt).toLocaleString()}</span></div><div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-[10px]"><thead><tr className="border-b text-slate-400"><th className="px-2 py-2">{ar ? "المستند" : "Document"}</th><th className="px-2 py-2">{ar ? "النوع" : "Type"}</th><th className="px-2 py-2">Revision</th><th className="px-2 py-2">{ar ? "التحديث" : "Updated"}</th><th /></tr></thead><tbody>{data.recentDocuments.map(doc => <tr key={doc.id} className="border-b last:border-0"><td className="px-2 py-2 font-medium">{doc.name}</td><td className="px-2 py-2">{labels[doc.type][ar ? "ar" : "en"]}</td><td className="px-2 py-2">R{doc.revision}</td><td className="px-2 py-2 text-slate-500">{new Date(doc.updatedAt).toLocaleString()}</td><td className="px-2 py-2 text-right"><button onClick={() => router.push(`/office/${doc.type === "WRITER" ? "writer" : doc.type === "SHEET" ? "sheet" : "show"}/${doc.fileId}`)} className="rounded-lg border px-2 py-1">{ar ? "فتح" : "Open"}</button></td></tr>)}</tbody></table></div></section>

        <div className="mt-5 grid gap-3 sm:grid-cols-3"><button onClick={() => router.push("/files/templates")} className="rounded-xl border bg-white px-4 py-3 text-left text-xs font-medium shadow-sm">{ar ? "إدارة Templates" : "Manage Templates"}</button><button onClick={() => router.push("/office/new")} className="rounded-xl border bg-white px-4 py-3 text-left text-xs font-medium shadow-sm">{ar ? "إنشاء Office جديد" : "Create Office document"}</button><button onClick={() => router.push("/admin")} className="rounded-xl border bg-white px-4 py-3 text-left text-xs font-medium shadow-sm">{ar ? "إدارة WorkDrive" : "WorkDrive Admin"}</button></div>
      </>}
    </div>
  </main>;
}
