"use client";

import type { ReactNode } from "react";
import { AuthGate } from "@/components/auth-gate";
import { AdminConsoleSidebar } from "@/components/admin-console/admin-console-sidebar";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AuthGate><div className="admin-console-shell flex h-screen min-h-0 w-full overflow-hidden bg-[#f7f7f7]"><AdminConsoleSidebar /><div className="min-w-0 flex-1 overflow-hidden bg-[#f7f7f7]">{children}</div></div></AuthGate>;
}
