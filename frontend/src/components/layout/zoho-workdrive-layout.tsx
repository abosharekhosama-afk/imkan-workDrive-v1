"use client";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ShellProvider, useShell } from "./shell-context";
import { PrimarySidebar } from "./primary-sidebar";
import { TopHeader } from "./top-header";
import { InspectorDock, InspectorPanel } from "./inspector";
import { Icons } from "./icons";
import { WipHost } from "../wip-modal";
function Frame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { sidebarCollapsed, setSidebarCollapsed, mobileNavOpen, setMobileNavOpen } = useShell();
  if (pathname.startsWith("/auth/")) return <>{children}</>;
  const width = sidebarCollapsed ? "md:w-16" : "md:w-[264px]";
  return (
    <div className="flex h-screen w-full overflow-hidden bg-white">
      <WipHost />
      <aside className={`hidden shrink-0 md:block ${width}`} aria-label="primary">
        <PrimarySidebar />
      </aside>
      {mobileNavOpen ? (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileNavOpen(false)} aria-hidden="true" />
          <div className="absolute bottom-0 start-0 top-0 w-[264px] max-w-[85vw] overflow-hidden bg-[#282828] shadow-[0_6px_24px_rgba(0,0,0,0.1)]">
            <PrimarySidebar />
          </div>
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopHeader />
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">{children}</div>
          <InspectorPanel />
          <InspectorDock />
        </div>
      </div>
      <button type="button" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        className="fixed bottom-4 start-4 z-40 hidden rounded-full border border-slate-200 bg-white p-2 shadow-lg md:block" aria-label="toggle">
        <Icons.menu size={15} />
      </button>
    </div>
  );
}
export function ZohoWorkdriveLayout({ children }: { children: ReactNode }) {
  return (<ShellProvider><Frame>{children}</Frame></ShellProvider>);
}
