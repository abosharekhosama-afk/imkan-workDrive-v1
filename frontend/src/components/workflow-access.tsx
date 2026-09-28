"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { listWorkflowCapabilities, type WorkflowCapabilities } from "@/lib/api/workflows";
import { useLocale } from "@/components/locale-provider";
import { workflowShellBase } from "@/components/workflow-nav-logic";

const WorkflowAccessContext = createContext<WorkflowCapabilities | null>(null);

function normalizeWorkflowPath(pathname: string): string {
  return pathname.startsWith("/admin/workflows")
    ? pathname.replace(/^\/admin\/workflows/, "/files/workflows")
    : pathname;
}

function requiredCapability(pathname: string, searchParams: URLSearchParams): keyof WorkflowCapabilities | null {
  const normalized = normalizeWorkflowPath(pathname);
  if (normalized === "/files/workflows" || normalized === "/files/workflows/") {
    const scope = searchParams.get("scope");
    if (scope === "mine") return "canViewMy";
    if (scope === "drafts") return "canViewDrafts";
    return "canViewWorkspace";
  }
  if (normalized === "/files/workflows/builder") return searchParams.get("id") ? "canEditOwnedDrafts" : "canCreate";
  if (normalized.startsWith("/files/workflows/templates")) return "canViewTemplates";
  if (normalized.startsWith("/files/workflows/functions")) return "canViewFunctions";
  if (normalized.startsWith("/files/workflows/connections")) return "canViewFunctions";
  if (normalized.startsWith("/files/workflows/diagnostics")) return "canViewDiagnostics";
  if (normalized.startsWith("/files/workflows/queue")) return "canViewQueue";
  if (normalized.startsWith("/files/workflows/audit")) return "canViewAudit";
  if (normalized.startsWith("/files/workflows/dynamic-values")) return "canViewDynamicValues";
  if (normalized.startsWith("/files/workflows/tasks")) return "canViewWaiting";
  if (normalized.startsWith("/files/workflows/runs")) return "canViewRuns";
  return null;
}

export function useWorkflowAccess() {
  return useContext(WorkflowAccessContext);
}

export function WorkflowAccessGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { locale } = useLocale();
  const [caps, setCaps] = useState<WorkflowCapabilities | null>(null);
  const [error, setError] = useState("");
  const ar = locale === "ar";
  const fallbackHref = workflowShellBase(pathname.startsWith("/admin/workflows"));

  useEffect(() => {
    let cancelled = false;
    setError("");
    void listWorkflowCapabilities()
      .then((value) => { if (!cancelled) setCaps(value); })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : (ar ? "تعذر التحقق من صلاحيات سير العمل." : "Unable to verify workflow permissions.")); });
    return () => { cancelled = true; };
  }, [ar]);

  const required = useMemo(() => requiredCapability(pathname, new URLSearchParams(searchParams.toString())), [pathname, searchParams]);

  useEffect(() => {
    if (!caps || !required || caps[required]) return;
    router.replace(fallbackHref);
  }, [caps, required, router, fallbackHref]);

  if (error) {
    return <div className="flex h-full min-h-0 items-center justify-center bg-white p-6"><div className="max-w-md rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-center text-[11px] text-red-700">{ar ? "تعذر التحقق من صلاحيات سير العمل." : "Unable to verify workflow permissions."}</div></div>;
  }
  if (!caps) {
    return <div className="flex h-full min-h-0 items-center justify-center bg-white text-[11px] text-slate-400">{ar ? "جارٍ التحقق من الصلاحيات…" : "Checking workflow permissions…"}</div>;
  }
  if (required && !caps[required]) return null;

  return <WorkflowAccessContext.Provider value={caps}>{children}</WorkflowAccessContext.Provider>;
}
