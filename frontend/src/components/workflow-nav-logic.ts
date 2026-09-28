import type { WorkflowCapabilities } from "@/lib/api/workflows";

export type WorkflowShellTabKey =
  | "all"
  | "mine"
  | "drafts"
  | "templates"
  | "connections"
  | "waiting"
  | "runs"
  | "diagnostics"
  | "queue"
  | "audit"
  | "dynamic-values";

export type WorkflowShellTab = {
  key: WorkflowShellTabKey;
  href: string;
  labelEn: string;
  labelAr: string;
  capability: keyof WorkflowCapabilities;
};

const WORKSPACE_TAB_KEYS = new Set<WorkflowShellTabKey>(["all", "drafts", "runs"]);

export function workflowShellBase(adminConsole: boolean): string {
  return adminConsole ? "/admin/workflows" : "/files/workflows";
}

export function buildWorkflowShellTabs(adminConsole: boolean): WorkflowShellTab[] {
  const base = workflowShellBase(adminConsole);
  return [
    { key: "all", href: base, labelEn: "All workflows", labelAr: "كل سير العمل", capability: "canViewWorkspace" },
    { key: "mine", href: `${base}?scope=mine`, labelEn: "My workflows", labelAr: "سير العمل الخاص بي", capability: "canViewMy" },
    { key: "drafts", href: `${base}?scope=drafts`, labelEn: "Drafts", labelAr: "المسودات", capability: "canViewDrafts" },
    { key: "templates", href: `${base}/templates`, labelEn: "Data templates", labelAr: "قوالب البيانات", capability: "canViewTemplates" },
    { key: "connections", href: `${base}/connections`, labelEn: "Connections", labelAr: "الاتصالات", capability: "canViewFunctions" },
    { key: "waiting", href: `${base}/tasks`, labelEn: "Waiting for my action", labelAr: "بانتظار إجراءاتي", capability: "canViewWaiting" },
    { key: "runs", href: `${base}/runs`, labelEn: "Run history", labelAr: "سجل التشغيل", capability: "canViewRuns" },
    { key: "diagnostics", href: `${base}/diagnostics`, labelEn: "Diagnostics", labelAr: "التشخيص", capability: "canViewDiagnostics" },
    { key: "queue", href: `${base}/queue`, labelEn: "Queue", labelAr: "الطابور", capability: "canViewQueue" },
    { key: "audit", href: `${base}/audit`, labelEn: "Audit", labelAr: "سجل التدقيق", capability: "canViewAudit" },
    { key: "dynamic-values", href: `${base}/dynamic-values`, labelEn: "Dynamic values", labelAr: "القيم الديناميكية", capability: "canViewDynamicValues" },
  ];
}

export function filterWorkflowShellTabs(
  tabs: WorkflowShellTab[],
  adminConsole: boolean,
  access: WorkflowCapabilities | null,
): WorkflowShellTab[] {
  const scoped = adminConsole ? tabs : tabs.filter((tab) => WORKSPACE_TAB_KEYS.has(tab.key));
  if (!access) return adminConsole ? scoped : scoped;
  return scoped.filter((tab) => access[tab.capability]);
}

export type WorkflowSecondaryItemKey = "workflows.all" | "workflows.drafts" | "workflows.runs";

export function buildWorkflowSecondaryItems(): Array<{ href: string; labelKey: WorkflowSecondaryItemKey; icon: "flow" | "pencil" | "history" }> {
  return [
    { href: "/files/workflows", labelKey: "workflows.all", icon: "flow" },
    { href: "/files/workflows?scope=drafts", labelKey: "workflows.drafts", icon: "pencil" },
    { href: "/files/workflows/runs", labelKey: "workflows.runs", icon: "history" },
  ];
}
