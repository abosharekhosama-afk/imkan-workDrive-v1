import type { ReactNode } from 'react';
import { AuthGate } from '../../components/auth-gate';
export default function FilesSectionLayout({children}:{children:ReactNode}){return <AuthGate><div className="imkan-workspace-layout flex h-full min-h-0 w-full max-w-full flex-col"><div className="imkan-workspace-content flex h-full min-h-0 w-full max-w-full flex-col">{children}</div></div></AuthGate>}
