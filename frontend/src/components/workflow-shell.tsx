"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useLocale } from "./locale-provider";
import { WorkflowHelp } from "./workflow-help";
import { useWorkflowAccess } from "./workflow-access";
import { buildWorkflowShellTabs, filterWorkflowShellTabs, workflowShellBase } from "./workflow-nav-logic";

export function WorkflowShell({ children, title, subtitle, active }: { children: ReactNode; title?: string; subtitle?: string; active?: "all" | "mine" | "drafts" | "templates" | "functions" | "connections" | "waiting" | "runs" | "diagnostics" | "queue" | "audit" | "dynamic-values" }) {
  const { locale } = useLocale();
  const pathname = usePathname();
  const ar = locale === "ar";
  const adminConsole = pathname.startsWith("/admin/workflows");
  const access = useWorkflowAccess();
  const helpKeyByActive = {
    all: "workflow.workspace", mine: "workflow.workspace", drafts: "workflow.workspace", templates: "workflow.templates", functions: "workflow.functions", waiting: "workflow.tasks", runs: "workflow.runs", diagnostics: "workflow.diagnostics", queue: "workflow.queue", audit: "workflow.audit", "dynamic-values": "workflow.dynamic-values", connections: "workflow.connections",
  } as const;
  const contextualHelpKey = helpKeyByActive[active ?? "all"];
  const visibleItems = filterWorkflowShellTabs(buildWorkflowShellTabs(adminConsole), adminConsole, access);
  const createHref = `${workflowShellBase(adminConsole)}?create=1`;

  return (
    <div className="workflow-ui flex min-h-0 flex-1 flex-col bg-[var(--wd-bg,#fff)] text-[var(--wd-text,#212121)]" style={{ fontFamily: "var(--user-font-family), Arial, system-ui, sans-serif" }}>
      <div className="workflow-shell-header bg-[var(--wd-bg,#fff)] px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[.16em] text-[color:var(--wd-primary,#1B66EA)]">{adminConsole ? (ar ? "وحدة إدارة سير العمل" : "Workflow admin") : (ar ? "مساحة سير العمل" : "Workflow workspace")}</div>
              <h1 className="truncate text-[16px] font-semibold text-[var(--wd-text,#0f172a)]">{title ?? (ar ? "سير العمل" : "Workflows")}</h1>
              {subtitle ? <p className="truncate text-[10.5px] text-slate-500">{subtitle}</p> : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <WorkflowHelp compact helpKey={contextualHelpKey} />
            {access?.canCreate ? (
              <Link href={createHref} className="wd-pill wd-pill-new">＋ {ar ? "سير عمل جديد" : "New workflow"}</Link>
            ) : null}
          </div>
        </div>
        <nav className="workflow-shell-nav mt-2 flex items-end gap-5 overflow-x-auto border-b border-[color:var(--wd-line,#e5e7eb)]" aria-label={ar ? "تنقل سير العمل" : "Workflow navigation"}>
          {visibleItems.map((item) => {
            const selected = active === item.key || (!active && pathname === item.href.split("?")[0]);
            return (
              <Link key={item.key} href={item.href} aria-current={selected ? "page" : undefined} className={`workflow-shell-tab whitespace-nowrap border-b-2 px-0.5 pb-2.5 pt-1 text-[11px] font-medium transition ${selected ? "is-active" : ""}`}>
                {ar ? item.labelAr : item.labelEn}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
