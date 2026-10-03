import type { ReactNode } from 'react';
import { AuthGate } from '../../components/auth-gate';
import { GlobalUploadProgressHost } from '../../components/global-upload-progress-host';

export default function FilesSectionLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <div className="imkan-workspace-layout flex min-h-0 w-full max-w-full flex-1 flex-col">
        <div className="imkan-workspace-content flex min-h-0 w-full max-w-full flex-1 flex-col">{children}</div>
      </div>
      <GlobalUploadProgressHost />
    </AuthGate>
  );
}
