"use client";

import { useEffect, useState } from "react";
import { WorkflowHelp } from "@/components/workflow-help";
import { WorkflowShell } from "@/components/workflow-shell";
import { useLocale } from "@/components/locale-provider";
import {
  getWorkflowVersionDetail,
  listWorkflowAudit,
  listWorkflowVersions,
  type WorkflowAuditEntry,
  type WorkflowVersionSummary,
} from "@/lib/api/workflows";

export default function AuditPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [rows, setRows] = useState<WorkflowAuditEntry[]>([]);
  const [error, setError] = useState("");
  const [workflowId, setWorkflowId] = useState("");
  const [versions, setVersions] = useState<WorkflowVersionSummary[]>([]);
  const [v1, setV1] = useState("");
  const [v2, setV2] = useState("");
  const [d1, setD1] = useState<any>(null);
  const [d2, setD2] = useState<any>(null);
  const [diff, setDiff] = useState<Array<{ path: string; a: unknown; b: unknown }>>([]);

  useEffect(() => {
    void listWorkflowAudit()
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load audit"));
  }, []);

  const loadVersions = () => {
    if (!workflowId.trim()) return;
    setError("");
    void listWorkflowVersions(workflowId.trim())
      .then((items) => {
        setVersions(items);
        setV1(items[1]?.id ?? items[0]?.id ?? "");
        setV2(items[0]?.id ?? "");
        setD1(null);
        setD2(null);
        setDiff([]);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load versions"));
  };

  const compareVersions = () => {
    if (!workflowId || !v1 || !v2 || v1 === v2) return;
    void Promise.all([
      getWorkflowVersionDetail(workflowId, v1),
      getWorkflowVersionDetail(workflowId, v2),
    ])
      .then(([a, b]) => {
        setD1(a);
        setD2(b);
        const flatten = (value: any, prefix = ""): Array<[string, unknown]> => {
          if (value === null || typeof value !== "object") return [[prefix, value]];
          if (Array.isArray(value)) return value.flatMap((item, i) => flatten(item, `${prefix}[${i}]`));
          return Object.entries(value).flatMap(([key, item]) =>
            flatten(item, prefix ? `${prefix}.${key}` : key),
          );
        };
        const aa = new Map(flatten(a.snapshot));
        const bb = new Map(flatten(b.snapshot));
        const keys = new Set([...aa.keys(), ...bb.keys()]);
        setDiff(
          [...keys]
            .filter((key) => JSON.stringify(aa.get(key)) !== JSON.stringify(bb.get(key)))
            .map((path) => ({ path, a: aa.get(path), b: bb.get(path) }))
            .slice(0, 250),
        );
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to compare versions"));
  };

  return (
    <WorkflowShell
      active="audit"
      title={ar ? "سجل التدقيق" : "Audit center"}
      subtitle={ar ? "تتبع تغييرات الإعدادات وأحداث التشغيل." : "Track configuration and runtime changes."}
    >
      <main className="h-full overflow-y-auto p-5" dir={ar ? "rtl" : "ltr"}>
        <div className="mx-auto max-w-[1400px]">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[18px] font-semibold">{ar ? "سجل تدقيق مركزي" : "Central audit log"}</h2>
              <p className="mt-1 text-[10.5px] text-slate-500">
                {ar ? "يمكنك قراءة before/after من metadata عند توفرها." : "Inspect before/after metadata when available."}
              </p>
            </div>
            <WorkflowHelp compact helpKey="workflow.audit" />
          </div>

          {error && <div className="wd-card mt-4 p-4 text-[11px] text-red-600">{error}</div>}

          <div className="mt-5 grid gap-3">
            {rows.length === 0 ? (
              <div className="wd-card p-12 text-center text-[11px] text-slate-400">
                {ar ? "لا توجد أحداث تدقيق بعد." : "No audit events yet."}
              </div>
            ) : (
              rows.map((a) => (
                <article key={a.id} className="wd-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="rounded-full bg-[#EEF4FF] px-2 py-1 text-[9px] font-semibold text-[#1B66EA]">
                        {a.action}
                      </span>
                      <span className="ms-2 text-[10px] text-slate-500">
                        {a.resourceType} · {a.resourceId.slice(0, 8)}…
                      </span>
                    </div>
                    <time className="text-[9px] text-slate-400">{new Date(a.createdAt).toLocaleString()}</time>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-xl bg-slate-50 p-3 text-[9px] text-slate-500">
                      {ar ? "المنفذ" : "Actor"}: {a.actor?.name || a.actor?.email || a.actorId || "—"}
                    </div>
                    <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-[8.5px] text-slate-600">
                      {JSON.stringify(a.metadata ?? {}, null, 2)}
                    </pre>
                  </div>
                </article>
              ))
            )}
          </div>

          <section className="wd-card mt-6 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-[13px] font-semibold">{ar ? "مقارنة إصدارات سير العمل" : "Workflow version diff"}</h3>
                <p className="mt-1 text-[9.5px] text-slate-500">
                  {ar ? "اختر Workflow ثم إصدارين لرؤية metadata الإصدارين ومعلومات النشر." : "Select a workflow and two versions to compare publication metadata."}
                </p>
              </div>
              <WorkflowHelp compact helpKey="workflow.versions" />
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <input className="wf-input" value={workflowId} onChange={(e) => setWorkflowId(e.target.value)} placeholder="Workflow ID" />
              <select className="wf-input" value={v1} onChange={(e) => setV1(e.target.value)}>
                {versions.length === 0 ? <option value="">{ar ? "الإصدار الأول" : "Version A"}</option> : versions.map((v) => <option key={v.id} value={v.id}>v{v.version}</option>)}
              </select>
              <select className="wf-input" value={v2} onChange={(e) => setV2(e.target.value)}>
                {versions.length === 0 ? <option value="">{ar ? "الإصدار الثاني" : "Version B"}</option> : versions.map((v) => <option key={v.id} value={v.id}>v{v.version}</option>)}
              </select>
            </div>

            <button className="wd-pill wd-pill-new mt-3" disabled={!workflowId.trim()} onClick={loadVersions}>
              {ar ? "تحميل الإصدارات" : "Load versions"}
            </button>

            {versions.length > 0 && (
              <>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {[v1, v2].map((id, i) => {
                    const v = versions.find((item) => item.id === id);
                    return (
                      <div key={i} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="text-[10px] font-semibold">{i === 0 ? "A" : "B"} · {v ? `v${v.version}` : "—"}</div>
                        <div className="mt-2 text-[9px] text-slate-500">
                          {v && new Date(v.createdAt).toLocaleString()} · {v?.status} · {v?.publishedAt ? new Date(v.publishedAt).toLocaleString() : ar ? "غير منشور" : "unpublished"}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button className="wd-pill wd-pill-new mt-3" disabled={!v1 || !v2 || v1 === v2} onClick={compareVersions}>
                  {ar ? "قارن الإصدارات فعلياً" : "Compare snapshots"}
                </button>

                {diff.length > 0 && (
                  <div className="mt-4 overflow-auto rounded-xl border border-slate-200">
                    <div className="grid min-w-[760px] grid-cols-[1.4fr_1fr_1fr] border-b border-slate-100 bg-slate-50 px-3 py-2 text-[9px] font-semibold text-slate-500">
                      <span>Path</span><span>A</span><span>B</span>
                    </div>
                    {diff.map((item) => (
                      <div key={item.path} className="grid min-w-[760px] grid-cols-[1.4fr_1fr_1fr] border-b border-slate-100 px-3 py-2 text-[8.5px]">
                        <code>{item.path}</code>
                        <pre className="whitespace-pre-wrap text-red-600">{JSON.stringify(item.a)}</pre>
                        <pre className="whitespace-pre-wrap text-emerald-700">{JSON.stringify(item.b)}</pre>
                      </div>
                    ))}
                  </div>
                )}

                {d1 && d2 && diff.length === 0 && (
                  <div className="mt-3 text-[9px] text-slate-500">
                    {ar ? "لا توجد فروقات في اللقطة المحددة." : "No differences found in the selected snapshots."}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </main>
    </WorkflowShell>
  );
}
