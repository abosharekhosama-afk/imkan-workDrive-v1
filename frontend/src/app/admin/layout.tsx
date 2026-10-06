"use client";

import type { ReactNode } from "react";
import { AuthGate } from "@/components/auth-gate";
import { AdminConsoleSidebar } from "@/components/admin-console/admin-console-sidebar";
import { TopHeader } from "@/components/layout/top-header";
import { ShellProvider, useShell } from "@/components/layout/shell-context";

function AdminFrame({ children }: { children: ReactNode }) {
  const { sidebarCollapsed, mobileNavOpen, setMobileNavOpen } = useShell();
  const width = sidebarCollapsed ? "md:w-16" : "md:w-[255px]";
  return (
    <div
      className="admin-console-shell admin-theme-root flex h-screen min-h-0 w-full overflow-hidden bg-[var(--wd-canvas,#f7f7f7)] text-[var(--wd-text,#212121)]"
      style={{ fontFamily: "var(--user-font-family), Arial, system-ui, sans-serif" }}
    >
      <aside className={`hidden shrink-0 md:block ${width}`} aria-label="admin">
        <AdminConsoleSidebar />
      </aside>
      {mobileNavOpen ? (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Admin navigation">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileNavOpen(false)} aria-hidden="true" />
          <div className="wd-mobile-nav-drawer absolute bottom-0 start-0 top-0 flex w-[min(280px,88vw)] max-w-[88vw] flex-col overflow-hidden bg-[#282828] shadow-xl">
            <AdminConsoleSidebar />
          </div>
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[var(--wd-canvas,#f7f7f7)]">
        <TopHeader adminMode />
        <div className="admin-theme-content flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden bg-[var(--wd-canvas,#f7f7f7)] text-[var(--wd-text,#212121)]" style={{ fontFamily: "var(--user-font-family), Arial, system-ui, sans-serif" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <ShellProvider>
        <AdminFrame>{children}</AdminFrame>
      </ShellProvider>
    </AuthGate>
  );
}
