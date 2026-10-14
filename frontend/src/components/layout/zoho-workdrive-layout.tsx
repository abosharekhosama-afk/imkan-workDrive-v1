"use client";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { ShellProvider, useShell } from "./shell-context";
import { PrimarySidebar } from "./primary-sidebar";
import { TopHeader } from "./top-header";
import { InspectorDock, InspectorPanel } from "./inspector";
import { Icons } from "./icons";
import { WipHost } from "../wip-modal";
import { ExternalAppsHost } from "../external-apps-modal";
import { CloudImportHost } from "../cloud-import-modal";
import { NewItemHost } from "../new-item-host";
import { RecordingHost } from "../recording-host";
import { showInspectorForPath } from "../../lib/workspace-routes";
function Frame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const {
    sidebarCollapsed,
    setSidebarCollapsed,
    mobileNavOpen,
    setMobileNavOpen,
    mobileInspectorOpen,
    setInspectorOpen,
    setMobileInspectorOpen,
    select,
  } = useShell();
  const showInspector = showInspectorForPath(pathname);

  useEffect(() => {
    if (showInspector) return;
    setInspectorOpen(false);
    setMobileInspectorOpen(false);
    select(null);
  }, [showInspector, pathname, select, setInspectorOpen, setMobileInspectorOpen]);

  if (pathname.startsWith("/auth/") || pathname.startsWith("/collect/") || pathname.startsWith("/share/")) return <>{children}</>;
  const width = sidebarCollapsed ? "md:w-16" : "md:w-[264px]";
  return (
    <div className="workdrive-frame flex h-[100dvh] min-h-0 w-full overflow-hidden bg-[var(--wd-canvas,#fff)]">
      <WipHost /><ExternalAppsHost /><CloudImportHost /><NewItemHost /><RecordingHost />
      <aside data-overlay-bound="sidebar" className={`hidden shrink-0 md:block ${width}`} aria-label="primary">
        <PrimarySidebar />
      </aside>
      {mobileNavOpen ? (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="wd-secondary-panel-backdrop absolute inset-0" onClick={() => setMobileNavOpen(false)} aria-hidden="true" />
          <div className="wd-mobile-nav-drawer absolute bottom-0 start-0 top-0 flex w-[min(280px,88vw)] max-w-[88vw] flex-col overflow-hidden bg-[var(--wd-sidebar,#282828)] shadow-[0_6px_24px_rgba(0,0,0,0.12)]">
            <PrimarySidebar />
          </div>
        </div>
      ) : null}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="workdrive-topbar-slot shrink-0">
          <TopHeader />
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <div className="workdrive-main-scroll flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-y-contain">{children}</div>
          {showInspector ? (
            <>
              {mobileInspectorOpen ? (
                <div
                  className="inspector-mobile-backdrop fixed inset-0 z-[45] md:hidden"
                  onClick={() => setMobileInspectorOpen(false)}
                  aria-hidden="true"
                />
              ) : null}
              <InspectorPanel />
              <InspectorDock />
            </>
          ) : null}
        </div>
      </div>
      <button type="button" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        className="fixed bottom-4 start-4 z-40 hidden rounded-full border border-[color:var(--wd-line,#e2e8f0)] bg-[var(--wd-bg,#fff)] p-2 shadow-lg md:block" aria-label="toggle">
        <Icons.menu size={15} />
      </button>
    </div>
  );
}
export function ZohoWorkdriveLayout({ children }: { children: ReactNode }) {
  return (<ShellProvider><Frame>{children}</Frame></ShellProvider>);
}
