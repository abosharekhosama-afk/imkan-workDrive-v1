import type { ReactNode } from 'react';
import { AuthGate } from '../../components/auth-gate';
export default function FilesSectionLayout({children}:{children:ReactNode}){return <AuthGate><div className="imkan-workspace-layout w-full max-w-full"><div className="imkan-workspace-content w-full max-w-full">{children}</div></div></AuthGate>}
