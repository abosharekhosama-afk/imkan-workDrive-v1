"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { WorkflowShell } from "@/components/workflow-shell";
import { WorkflowHelp } from "@/components/workflow-help";
import { useLocale } from "@/components/locale-provider";
import {
  listWorkflowQueue,
  workflowQueueAction,
  type WorkflowQueueJob,
} from "@/lib/api/workflows";

export default function QueuePage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<WorkflowQueueJob[]>([]);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<WorkflowQueueJob | null>(null);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    setError("");
    void listWorkflowQueue(status)
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load queue"));
  }, [status]);

  return (
    <WorkflowShell
      active="queue"
      title={ar ? "مركز الطابور" : "Queue center"}
      subtitle={ar ? "مراقبة Jobs الفعلية والمحاولات والـLease والأخطاء." : "Monitor real jobs, attempts, leases and errors."}
    >
      <main className="h-full overflow-y-auto p-5" dir={ar ? "rtl" : "ltr"}>
        <div className="mx-auto max-w-[1400px]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[18px] font-semibold">{ar ? "عمليات الطابور" : "Queue operations"}</h2>
              <p className="mt-1 text-[10.5px] text-slate-500">
                {ar ? "بيانات من قاعدة البيانات وليست مؤشرات تجريبية." : "Database-backed operational data, not mock metrics."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="wf-input mt-0 w-auto"
              >
                <option value="">{ar ? "كل الحالات" : "All statuses"}</option>
                <option>QUEUED</option>
                <option>RUNNING</option>
                <option>FAILED</option>
                <option>DEAD_LETTER</option>
                <option>COMPLETED</option>
              </select>
              <WorkflowHelp compact helpKey="workflow.queue" />
            </div>
          </div>

          {error && <div className="wf-card mt-4 p-4 text-[11px] text-red-600">{error}</div>}

          <div className="workflow-table-scroll wf-card mt-5">
            <div className="min-w-[980px]">
              <div className="grid grid-cols-[1.5fr_1fr_110px_90px_110px_170px_1.3fr] border-b border-slate-100 bg-slate-50/70 px-4 py-3 text-[9px] font-semibold text-slate-400">
                <span>{ar ? "سير العمل" : "Workflow"}</span>
                <span>Run</span>
                <span>Status</span>
                <span>{ar ? "محاولات" : "Attempts"}</span>
                <span>{ar ? "الأولوية" : "Priority"}</span>
                <span>Lease / Run at</span>
                <span>{ar ? "آخر خطأ" : "Last error"}</span>
              </div>

              {rows.length === 0 ? (
                <div className="p-12 text-center text-[11px] text-slate-400">
                  {ar ? "لا توجد Jobs مطابقة." : "No matching jobs."}
                </div>
              ) : (
                rows.map((j) => (
                  <div
                    key={j.id}
                    className="grid grid-cols-[1.5fr_1fr_110px_90px_110px_170px_1.3fr] items-center border-b border-slate-100 px-4 py-3 text-[10px]"
                  >
                    <span className="font-semibold">{j.workflow?.name ?? j.workflowId}</span>
                    <Link href={`/files/workflows/runs?id=${j.runId}`} className="text-[#1B66EA]">
                      {j.runId.slice(0, 8)}…
                    </Link>
                    <button
                      type="button"
                      onClick={() => setSelected(j)}
                      className="text-start underline decoration-slate-300 underline-offset-2"
                    >
                      {j.status}
                    </button>
                    <span>
                      {j.attempts}/{j.maxAttempts}
                    </span>
                    <span>{j.priority}</span>
                    <span className="text-slate-500">
                      {j.leaseUntil ? new Date(j.leaseUntil).toLocaleString() : new Date(j.runAt).toLocaleString()}
                    </span>
                    <span className="truncate text-red-500" title={j.lastError ?? ""}>
                      {j.lastError ?? "—"}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {selected && (
            <div className="fixed inset-0 z-[230] flex justify-end">
              <div className="absolute inset-0 bg-slate-950/30" onClick={() => setSelected(null)} />
              <aside
                className="relative h-full w-[min(520px,96vw)] overflow-y-auto bg-white p-5 shadow-2xl"
                dir={ar ? "rtl" : "ltr"}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[9px] uppercase tracking-[.15em] text-slate-400">
                      {ar ? "تفاصيل Job" : "Job details"}
                    </div>
                    <h3 className="mt-1 text-[15px] font-semibold">
                      {selected.workflow?.name || selected.workflowId}
                    </h3>
                  </div>
                  <button className="wf-icon-button" onClick={() => setSelected(null)}>
                    ×
                  </button>
                </div>

                <div className="wf-card mt-4 space-y-2 p-4 text-[10px]">
                  <div>
                    {ar ? "الحالة" : "Status"}: <b>{selected.status}</b>
                  </div>
                  <div>Run: {selected.runId}</div>
                  <div>
                    {ar ? "المحاولات" : "Attempts"}: {selected.attempts}/{selected.maxAttempts}
                  </div>
                  <div>
                    {ar ? "الأولوية" : "Priority"}: {selected.priority}
                  </div>
                  <div>
                    {ar ? "التشغيل" : "Run at"}: {new Date(selected.runAt).toLocaleString()}
                  </div>
                  <div>
                    {ar ? "Lease" : "Lease"}: {selected.leaseUntil ? new Date(selected.leaseUntil).toLocaleString() : "—"}
                  </div>
                  {selected.lastError && (
                    <pre className="whitespace-pre-wrap rounded-xl bg-red-50 p-3 text-[9px] text-red-700">
                      {selected.lastError}
                    </pre>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  {(["retry", "requeue", "recover", "dead-letter"] as const).map((a) => (
                    <button
                      key={a}
                      disabled={!!busy}
                      onClick={() => {
                        setBusy(a);
                        void workflowQueueAction(selected.id, a)
                          .then(() => {
                            setSelected(null);
                            return listWorkflowQueue(status);
                          })
                          .then(setRows)
                          .catch((e) => setError(e instanceof Error ? e.message : "Queue action failed"))
                          .finally(() => setBusy(""));
                      }}
                      className="wf-primary-button"
                    >
                      {busy === a ? "…" : a}
                    </button>
                  ))}
                </div>
                <WorkflowHelp compact helpKey="workflow.queue" />
              </aside>
            </div>
          )}
        </div>
      </main>
    </WorkflowShell>
  );
}