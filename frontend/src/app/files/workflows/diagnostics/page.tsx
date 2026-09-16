"use client";

import { useCallback, useEffect, useState } from "react";
import { WorkflowHelp } from "@/components/workflow-help";
import { WorkflowShell } from "@/components/workflow-shell";
import { useLocale } from "@/components/locale-provider";
import { getWorkflowDiagnostics, type WorkflowDiagnostics } from "@/lib/api/workflows";

export default function WorkflowDiagnosticsPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [data, setData] = useState<WorkflowDiagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await getWorkflowDiagnostics()); } catch (e) { setError(e instanceof Error ? e.message : (ar ? "تعذر تشغيل الفحص." : "Unable to run diagnostics.")); }
    finally { setLoading(false); }
  }, [ar]);
  useEffect(() => { void load(); }, [load]);
  const statusLabel = (status: string) => status === "PASS" ? (ar ? "سليم" : "Healthy") : status === "WARN" ? (ar ? "تحذير" : "Warning") : (ar ? "فشل" : "Failed");
  return <WorkflowShell active="diagnostics" title={ar ? "تشخيص سير العمل" : "Workflow diagnostics"} subtitle={ar ? "تحقق من المسار الكامل من قاعدة البيانات حتى Runtime." : "Verify the workflow path from database to runtime."}>
    <main className="h-full overflow-auto p-3 sm:p-5" dir={ar ? "rtl" : "ltr"}>
      <div className="mx-auto max-w-6xl space-y-4">
        <section className="wd-card p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-[10px] font-semibold uppercase tracking-[.15em] text-[#1B66EA]">{ar ? "V13 · Health" : "V13 · Health"}</div><h2 className="mt-1 text-[16px] font-semibold text-slate-900">{ar ? "فحص حقيقي للنظام" : "Real system verification"}</h2><p className="mt-1 max-w-2xl text-[10.5px] leading-5 text-slate-500">{ar ? "الفحص يقرأ الحالة الحالية من قاعدة البيانات ويعرض ما إذا كانت طبقات Workflow الأساسية قابلة للوصول." : "The diagnostic reads current database state and verifies that the core workflow layers are reachable."}</p></div><div className="flex items-center gap-2"><WorkflowHelp title={ar ? "تشخيص سير العمل" : "Workflow diagnostics"} description={ar ? "هذه الصفحة ليست محاكاة للواجهة؛ إنها تعرض مؤشرات من قاعدة البيانات وطبقات التشغيل." : "This is not a UI simulation; it exposes database-backed and runtime health indicators."} helpKey="workflow.diagnostics" tips={[ar ? "WARN لا يعني أن الميزة مكسورة، بل توجد حالة تحتاج متابعة." : "WARN means the system has a condition worth reviewing.", ar ? "FAIL يحتاج معالجة قبل اعتبار الإصدار جاهزاً." : "FAIL should be resolved before release certification."]} compact /><button type="button" onClick={() => void load()} className="wd-pill wd-pill-new">↻ {ar ? "إعادة الفحص" : "Run again"}</button></div></div>
          {loading && <div className="mt-5 rounded-xl bg-slate-50 p-4 text-[11px] text-slate-500">{ar ? "جاري الفحص…" : "Running diagnostics…"}</div>}
          {error && <div className="mt-5 rounded-xl border border-red-100 bg-red-50 p-4 text-[11px] text-red-600">{error}</div>}
          {data && <><div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">{[["Workflows",data.summary.workflowCount],["Active",data.summary.activeCount],["Queued",data.summary.queued],["Running",data.summary.running],["Waiting",data.summary.waiting],["Failed",data.summary.failed],["Dead-letter",data.summary.deadLetter]].map(([label,value]) => <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 p-3"><div className="text-[9px] text-slate-400">{label}</div><div className="mt-1 text-[17px] font-semibold text-slate-900">{value}</div></div>)}</div><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{data.checks.map((check) => <div key={check.key} className="rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,.03)]"><div className="flex items-center justify-between gap-2"><div className="text-[11px] font-semibold text-slate-800">{check.label}</div><span className={`rounded-full px-2 py-1 text-[8px] font-semibold ${check.status === "PASS" ? "bg-emerald-50 text-emerald-700" : check.status === "WARN" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>{statusLabel(check.status)}</span></div><p className="mt-2 text-[9.5px] leading-5 text-slate-500">{check.detail}</p>{check.latencyMs !== undefined && <div className="mt-2 text-[8.5px] text-slate-400">{check.latencyMs} ms</div>}</div>)}</div><div className="mt-4 text-[9px] text-slate-400">{ar ? "آخر فحص:" : "Last check:"} {new Date(data.generatedAt).toLocaleString(ar ? "ar" : "en")}</div></>}
        </section>
      </div>
    </main>
  </WorkflowShell>;
}
