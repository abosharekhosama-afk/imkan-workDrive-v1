"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { listWorkflowCapabilities, type WorkflowCapabilities } from "@/lib/api/workflows";
import { useLocale } from "@/components/locale-provider";

const WorkflowAccessContext = createContext<WorkflowCapabilities | null>(null);

function requiredCapability(pathname: string, searchParams: URLSearchParams): keyof WorkflowCapabilities | null {
  if (pathname === "/files/workflows" || pathname === "/files/workflows/") {
    const scope = searchParams.get("scope");
    if (scope === "mine") return "canViewMy";
    if (scope === "drafts") return "canViewDrafts";
    return "canViewWorkspace";
  }
  if (pathname === "/files/workflows/builder") return searchParams.get("id") ? "canEditOwnedDrafts" : "canCreate";
  if (pathname.startsWith("/files/workflows/templates")) return "canViewTemplates";
  if (pathname.startsWith("/files/workflows/functions")) return "canViewFunctions";
  if (pathname.startsWith("/files/workflows/diagnostics")) return "canViewDiagnostics";
  if (pathname.startsWith("/files/workflows/queue")) return "canViewQueue";
  if (pathname.startsWith("/files/workflows/audit")) return "canViewAudit";
  if (pathname.startsWith("/files/workflows/dynamic-values")) return "canViewDynamicValues";
  if (pathname.startsWith("/files/workflows/tasks")) return "canViewWaiting";
  if (pathname.startsWith("/files/workflows/runs")) return "canViewRuns";
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
    router.replace("/files/workflows");
  }, [caps, required, router]);

  if (error) {
    return <div className="flex h-full min-h-0 items-center justify-center bg-white p-6"><div className="max-w-md rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-center text-[11px] text-red-700">{ar ? "تعذر التحقق من صلاحيات سير العمل." : "Unable to verify workflow permissions."}</div></div>;
  }
  if (!caps) {
    return <div className="flex h-full min-h-0 items-center justify-center bg-white text-[11px] text-slate-400">{ar ? "جارٍ التحقق من الصلاحيات…" : "Checking workflow permissions…"}</div>;
  }
  if (required && !caps[required]) return null;

  return <WorkflowAccessContext.Provider value={caps}>{children}</WorkflowAccessContext.Provider>;
}
