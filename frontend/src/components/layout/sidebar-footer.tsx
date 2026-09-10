"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "../locale-provider";
import { formatBytes, type QuotaOverview } from "../../lib/api/quota";
import { Icons } from "./icons";
export function SidebarFooter({ quota, role, onNav }: { quota: QuotaOverview | null; role: string; onNav: () => void }) {
  const { label } = useLocale();
  const router = useRouter();
  const used = quota?.buckets.total.usedBytes ?? 12.4 * 1024 ** 3;
  const total = quota?.buckets.total.quotaBytes ?? 100 * 1024 ** 3;
  const pct = quota && !quota.unlimited && total ? Math.min(100, Math.round((used / total) * 100)) : 12;
  const admin = role === "ADMIN" || role === "SUPER_ADMIN";
  return (
    <div className="shrink-0 border-t border-white/[0.07] px-3 py-2.5">
      <div className="flex flex-col gap-1 text-[12px]">
        <a href="https://www.zoho.com/crm/" target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded px-1 py-1 text-slate-400 hover:bg-white/[0.06] hover:text-white">
          <Icons.ext size={14} /> {label("nav.integratedApps")}
        </a>
        <Link href="/settings" onClick={onNav} className="flex items-center gap-2 rounded px-1 py-1 text-slate-400 hover:bg-white/[0.06] hover:text-white">
          <Icons.spark size={14} /> {label("nav.getStarted")}
        </Link>
        {admin ? (
          <Link href="/admin" onClick={onNav} className="flex items-center gap-2 rounded px-1 py-1 text-slate-400 hover:bg-white/[0.06] hover:text-white">
            <Icons.shield size={14} /> {label("nav.admin")}
          </Link>
        ) : null}
      </div>
      <div className="mt-2 rounded-md bg-white/[0.04] p-2">
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span className="truncate">{formatBytes(used)} / {formatBytes(total)}</span>
          <button type="button" className="font-medium text-[#5B8DEF] hover:text-[#8FB2FF]" onClick={() => router.push("/settings")}>{label("quota.upgrade")}</button>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label("quota.title")}>
          <div className="h-full rounded-full bg-[#1B66EA]" style={{ width: `${Math.max(pct, 3)}%` }} />
        </div>
      </div>
    </div>
  );
}
