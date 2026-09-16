"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useLocale } from "./locale-provider";
import { WorkflowHelp } from "./workflow-help";

export function WorkflowShell({ children, title, subtitle, active }: { children: ReactNode; title?: string; subtitle?: string; active?: "all" | "mine" | "drafts" | "templates" | "functions" | "waiting" | "runs" | "diagnostics" | "queue" | "audit" | "dynamic-values" }) {
  const { locale } = useLocale();
  const pathname = usePathname();
  const ar = locale === "ar";
  const helpKeyByActive = {
    all: "workflow.workspace", mine: "workflow.workspace", drafts: "workflow.workspace", templates: "workflow.templates", functions: "workflow.functions", waiting: "workflow.tasks", runs: "workflow.runs", diagnostics: "workflow.diagnostics", queue: "workflow.queue", audit: "workflow.audit", "dynamic-values": "workflow.dynamic-values",
  } as const;
  const contextualHelpKey = helpKeyByActive[active ?? "all"];
  const items = [
    ["all", "/files/workflows", ar ? "كل سير العمل" : "All workflows"],
    ["mine", "/files/workflows?scope=mine", ar ? "سير العمل الخاص بي" : "My workflows"],
    ["drafts", "/files/workflows?scope=drafts", ar ? "المسودات" : "Drafts"],
    ["templates", "/files/workflows/templates", ar ? "قوالب البيانات" : "Data templates"],
    ["functions", "/files/workflows/functions", ar ? "الدوال الآمنة" : "Safe functions"],
    ["waiting", "/files/workflows/tasks", ar ? "بانتظار إجراءاتي" : "Waiting for my action"],
    ["runs", "/files/workflows/runs", ar ? "سجل التشغيل" : "Run history"],
    ["diagnostics", "/files/workflows/diagnostics", ar ? "التشخيص" : "Diagnostics"],
    ["queue", "/files/workflows/queue", ar ? "الطابور" : "Queue"],
    ["audit", "/files/workflows/audit", ar ? "سجل التدقيق" : "Audit"],
    ["dynamic-values", "/files/workflows/dynamic-values", ar ? "القيم الديناميكية" : "Dynamic values"],
  ] as const;
  return (
    <div className="workflow-ui flex min-h-0 flex-1 flex-col bg-white">
      <div className="workflow-shell-header bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#1B66EA]">{ar ? "مساحة سير العمل" : "Workflow workspace"}</div>
              <h1 className="truncate text-[16px] font-semibold text-slate-900">{title ?? (ar ? "سير العمل" : "Workflows")}</h1>
              {subtitle ? <p className="truncate text-[10.5px] text-slate-500">{subtitle}</p> : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <WorkflowHelp compact helpKey={contextualHelpKey} />
            <Link href="/files/workflows/builder" className="wd-pill wd-pill-new">＋ {ar ? "سير عمل جديد" : "New workflow"}</Link>
          </div>
        </div>
        <nav className="workflow-shell-nav mt-3 flex items-center gap-1 overflow-x-auto" aria-label={ar ? "تنقل سير العمل" : "Workflow navigation"}>
          {items.map(([key, href, text]) => {
            const selected = active === key || (!active && pathname === href.split("?")[0]);
            return <Link key={key} href={href} className={`whitespace-nowrap rounded-lg px-3 py-2 text-[11px] font-medium transition ${selected ? "bg-[#EEF4FF] text-[#1B66EA] shadow-sm" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"}`}>{text}</Link>;
          })}
        </nav>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
