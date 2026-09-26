"use client";
import { useEffect, useState } from "react";
import { useLocale } from "@/components/locale-provider";
import { getEnterpriseAudit } from "@/lib/api/enterprise";

export default function AdminAuditPage() {
  const { locale } = useLocale(); const ar = locale === "ar";
  const [rows, setRows] = useState<any[]>([]); const [error, setError] = useState("");
  useEffect(() => { void getEnterpriseAudit(100).then(setRows).catch(() => setError(ar ? "تعذر تحميل سجل التدقيق." : "Unable to load audit logs.")); }, [ar]);
  return <main className="h-full overflow-y-auto bg-[#f7f7f7] p-6 lg:p-8" dir={ar ? "rtl" : "ltr"}>
    <div className="mx-auto max-w-[1300px]"><div className="mb-6"><div className="text-[11px] font-semibold uppercase tracking-[.16em] text-[#2c66dd]">{ar ? "Security & Control" : "Security & Control"}</div><h1 className="mt-1 text-[26px] font-semibold text-slate-950">{ar ? "سجلات التدقيق والتقارير" : "Audit Logs & Reports"}</h1><p className="mt-1 text-[12px] text-slate-500">{ar ? "سجل مركزي للأحداث الإدارية والتشغيلية." : "Centralized administrative and operational event history."}</p></div>
      {error ? <div className="mb-4 rounded-xl bg-red-50 p-3 text-[11px] text-red-700">{error}</div> : null}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="grid grid-cols-[1.2fr_1fr_1fr_1.2fr] border-b border-slate-100 px-5 py-3 text-[10px] font-semibold text-slate-500"><span>{ar ? "الإجراء" : "Action"}</span><span>{ar ? "المورد" : "Resource"}</span><span>{ar ? "المنفذ" : "Actor"}</span><span>{ar ? "الوقت" : "Time"}</span></div>{rows.length ? rows.map((r) => <div key={r.id} className="grid grid-cols-[1.2fr_1fr_1fr_1.2fr] border-b border-slate-100 px-5 py-3 text-[10.5px] text-slate-700 last:border-b-0"><span className="font-semibold">{r.action}</span><span>{r.resourceType}</span><span>{r.actor?.name || r.actor?.email || r.actorId || (ar ? "النظام" : "System")}</span><span>{new Date(r.createdAt).toLocaleString()}</span></div>) : <div className="p-10 text-center text-[11px] text-slate-400">{ar ? "لا توجد أحداث." : "No audit events found."}</div>}</div>
    </div></main>;
}
