import type { ReactNode } from 'react';
import { AuthGate } from '../../components/auth-gate';
export default function FilesSectionLayout({children}:{children:ReactNode}){return <AuthGate><div className="imkan-workspace-layout"><div className="imkan-workspace-content">{children}</div></div></AuthGate>}
