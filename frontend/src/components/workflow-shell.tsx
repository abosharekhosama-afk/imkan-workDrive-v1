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
    <div className="workflow-ui flex min-h-0 flex-1 flex-col bg-[color:var(--wd-canvas)]">
      {/* Shell header — same visual language as the Files-UI page header (.wd-page-head). */}
      <div className="workflow-shell-header border-b border-[color:var(--wd-line)] bg-[color:var(--wd-bg)] px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/files/workflows" className="wf-icon no-underline" aria-label={ar ? "سير العمل" : "Workflows"}>↗</Link>
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-[.16em] text-[color:var(--wd-primary-ink)]">{ar ? "مساحة سير العمل" : "Workflow workspace"}</div>
              <h1 className="mt-0.5 truncate text-[21px] font-bold leading-tight text-[color:var(--wd-text)]">{title ?? (ar ? "سير العمل" : "Workflows")}</h1>
              {subtitle ? <p className="mt-1 truncate text-[12.5px] text-[color:var(--wd-text-muted)]">{subtitle}</p> : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <WorkflowHelp />
            <Link href="/files/workflows/builder" className="wf-primary-button">＋ {ar ? "سير عمل جديد" : "New workflow"}</Link>
          </div>
        </div>
        <nav className="workflow-shell-nav mt-3 flex items-center gap-1 overflow-x-auto" aria-label={ar ? "تنقل سير العمل" : "Workflow navigation"}>
          {items.map(([key, href, text]) => {
            const selected = active === key || (!active && pathname === href.split("?")[0]);
            return <Link key={key} href={href} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${selected ? "bg-[color:var(--wd-menu-hover)] text-[color:var(--wd-primary-ink)]" : "text-[color:var(--wd-text-muted)] hover:bg-[color:var(--wd-hover)] hover:text-[color:var(--wd-text)]"}`}>{text}</Link>;
          })}
        </nav>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
