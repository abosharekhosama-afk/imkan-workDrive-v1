import type { ReactNode } from "react";
import { AuthGate } from "../../components/auth-gate";

/** Dedicated Backup & Recovery shell — not the organization Admin Console. */
export default function BackupLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <div className="imkan-workspace-layout flex min-h-0 w-full max-w-full flex-1 flex-col bg-[#f6f7f9]">
        <div className="imkan-workspace-content flex min-h-0 w-full max-w-full flex-1 flex-col">{children}</div>
      </div>
    </AuthGate>
  );
}
