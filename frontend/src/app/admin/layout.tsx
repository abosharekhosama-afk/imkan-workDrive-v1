"use client";

import type { ReactNode } from "react";
import { AuthGate } from "@/components/auth-gate";
import { AdminConsoleSidebar } from "@/components/admin-console/admin-console-sidebar";
import { TopHeader } from "@/components/layout/top-header";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <div className="admin-console-shell flex h-screen min-h-0 w-full overflow-hidden bg-[#f7f7f7]">
        <AdminConsoleSidebar />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#f7f7f7]">
          <TopHeader adminMode />
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden bg-[#f7f7f7]">{children}</div>
        </div>
      </div>
    </AuthGate>
  );
}
