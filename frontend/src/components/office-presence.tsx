'use client';
import type { OfficePresence } from '@/lib/api/office';

export function OfficePresence({ items, ar = false }: { items: OfficePresence[]; ar?: boolean }) {
  const active = items.filter(x => x.status === 'ACTIVE');
  if (!active.length) return <span className="text-[11px] text-slate-400">{ar ? 'لا يوجد محررون آخرون' : 'No other editors'}</span>;
  return <div className="flex items-center gap-1.5" title={active.map(x => x.user.name || x.user.email).join(', ')}>
    <div className="flex -space-x-2 rtl:space-x-reverse">{active.slice(0, 5).map(x => <div key={x.id} className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-slate-200 text-[10px] font-semibold text-slate-700" title={x.user.name || x.user.email}>{(x.user.name || x.user.email).slice(0,1).toUpperCase()}</div>)}</div>
    <span className="text-[11px] text-slate-500">{active.length} {ar ? 'محرر الآن' : active.length === 1 ? 'editor here' : 'editors here'}</span>
  </div>;
}
