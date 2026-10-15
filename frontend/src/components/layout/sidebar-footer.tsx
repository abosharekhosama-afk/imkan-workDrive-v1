"use client";
import Link from "next/link";
import { useLocale } from "../locale-provider";
import type { QuotaOverview } from "../../lib/api/quota";
import { Icons } from "./icons";

export function SidebarFooter({ quota: _quota, role, onNav }: { quota: QuotaOverview | null; role: string; onNav: () => void }) {
  const { label, locale } = useLocale();
  const admin = role === "ADMIN" || role === "SUPER_ADMIN";
  return (
    <div className="shrink-0 px-2 pb-2">
      <div className="flex flex-col gap-1 text-[12px]">
        <Link href="/settings" onClick={onNav} className="mt-1 flex h-[42px] items-center justify-between rounded-[16px] bg-[#3E3E3E] px-3 text-[13px] font-bold text-white hover:bg-[#4A4A4A]">
          <span className="inline-flex items-center gap-1.5"><Icons.spark size={16} /> {locale === "ar" ? "حسابي" : "My Account"}</span> <Icons.chevR size={16} />
        </Link>
        {admin ? (
          <a
            href="/admin"
            target="_blank"
            rel="noopener noreferrer"
            onClick={onNav}
            className="mb-2 flex h-[42px] w-full items-center justify-between rounded-[16px] bg-[#3E3E3E] px-3 text-[13px] font-bold text-white hover:bg-[#4A4A4A]"
          >
            <span className="min-w-0 truncate">{label("nav.adminConsole")}</span> <Icons.ext size={16} />
          </a>
        ) : (
          <Link href="/settings" onClick={onNav} className="mb-2 flex h-[42px] items-center justify-between rounded-[16px] bg-[#3E3E3E] px-3 text-[13px] font-bold text-white hover:bg-[#4A4A4A]">
            <span className="min-w-0 truncate">{label("nav.settings")}</span> <Icons.chevR size={16} />
          </Link>
        )}
      </div>
    </div>
  );
}
