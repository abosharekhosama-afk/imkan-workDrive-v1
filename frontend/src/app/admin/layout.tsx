"use client";

import type { ReactNode } from "react";
import { AuthGate } from "@/components/auth-gate";
import { AdminConsoleSidebar } from "@/components/admin-console/admin-console-sidebar";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <div className="admin-console-shell flex h-screen min-h-0 w-full overflow-hidden bg-[#f7f7f7]">
        <AdminConsoleSidebar />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#f7f7f7]">
          <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5 lg:px-7">
            <div className="flex items-center gap-3">
              <span className="text-[14px] font-semibold text-slate-900">Admin Console</span>
              <span className="h-4 w-px bg-slate-200" />
              <span className="text-[11px] text-slate-500">IMKAN WorkDrive</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden text-[11px] font-medium text-slate-600 sm:inline">IMKAN</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#dce8ff] text-[10px] font-bold text-[#315da8]">IM</span>
            </div>
          </header>
          <div className="min-h-0 flex-1">{children}</div>
        </div>
      </div>
    </AuthGate>
  );
}
