"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useLocale } from "@/components/locale-provider";
import { getWorkspacePolicy } from "@/lib/api/organization";
import { Icons, type IconName } from "@/components/layout/icons";

interface AdminItem {
  href: string;
  en: string;
  ar: string;
  icon: IconName;
  section?: string;
}

const items: AdminItem[] = [
  { href: "/admin", en: "Dashboard", ar: "لوحة التحكم", icon: "grid", section: "Workspace" },
  { href: "/admin/team-folders", en: "Team Folders", ar: "مجلدات الفريق", icon: "folder" },
  { href: "/admin/members", en: "Members", ar: "الأعضاء", icon: "users" },
  { href: "/admin/groups", en: "Groups", ar: "المجموعات", icon: "users" },
  { href: "/admin/client-users", en: "Client Users", ar: "مستخدمو العملاء", icon: "users" },
  { href: "/admin/workflows", en: "Workflows", ar: "سير العمل", icon: "flow", section: "Automation" },
  { href: "/admin/custom-functions", en: "Custom Functions", ar: "الدوال المخصصة", icon: "code" },
  { href: "/admin/connections", en: "Connections", ar: "الاتصالات", icon: "link" },
  { href: "/admin/data-templates", en: "Data Templates", ar: "قوالب البيانات", icon: "layout", section: "Data & Policy" },
  { href: "/admin/dlp", en: "Data Loss Prevention", ar: "منع فقدان البيانات", icon: "shield" },
  { href: "/admin/settings", en: "Settings", ar: "الإعدادات", icon: "gear", section: "Security & Control" },
  { href: "/admin/audit", en: "Audit Logs & Reports", ar: "سجلات التدقيق والتقارير", icon: "history" },
  { href: "/admin/data-administration", en: "Data Administration", ar: "إدارة البيانات", icon: "columns" },
  { href: "/admin/devices", en: "Manage Devices", ar: "إدارة الأجهزة", icon: "columns" },
];

export function AdminConsoleSidebar() {
  const pathname = usePathname();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [logo, setLogo] = useState<string | null>(null);
  useEffect(() => {
    const load = () => { getWorkspacePolicy().then((policy) => setLogo(policy.logoDataUrl)).catch(() => undefined); };
    load();
    window.addEventListener("workdrive:workspace-policy", load);
    return () => window.removeEventListener("workdrive:workspace-policy", load);
  }, []);

  return (
    <aside className="admin-console-sidebar flex h-full w-[255px] shrink-0 flex-col bg-[#272727] text-white" dir={ar ? "rtl" : "ltr"}>
      <div className="flex h-[54px] shrink-0 items-center border-b border-white/10 px-4">
        <Link href="/admin" className="flex min-w-0 items-center gap-2">
          {logo ? <img src={logo} alt="" className="h-7 max-w-[120px] object-contain" /> : <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[color:var(--wd-primary)] text-white"><Icons.folder size={17} /></span>}
          <span className="truncate text-[15px] font-semibold tracking-[-.01em]">IMKAN</span>
          <span className="text-[11px] text-white/55">Admin Console</span>
        </Link>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-4" aria-label={ar ? "تنقل وحدة الإدارة" : "Admin console navigation"}>
        {items.map((item, index) => {
          const previous = items[index - 1];
          const showSection = item.section && item.section !== previous?.section;
          const active = item.href === "/admin" ? pathname === "/admin" : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = Icons[item.icon];
          return (
            <div key={item.href}>
              {showSection ? <div className="px-3 pb-2 pt-4 text-[10px] font-medium text-white/45">{item.section}</div> : null}
              <Link href={item.href} aria-current={active ? "page" : undefined}
                className={`flex h-10 items-center gap-3 rounded-[10px] px-3 text-[12px] font-medium transition ${active ? "bg-[#304d82] font-semibold text-[#e6edff]" : "text-white/90 hover:bg-white/[0.07]"}`}>
                <Icon size={18} />
                <span className="min-w-0 flex-1 truncate">{ar ? item.ar : item.en}</span>
              </Link>
            </div>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-white/10 p-2">
        <Link href="/files" className="flex h-11 items-center gap-3 rounded-[15px] bg-white/[0.10] px-4 text-[13px] font-semibold text-white hover:bg-white/[0.15]">
          <Icons.chevR size={16} className={ar ? "rotate-180" : ""} />
          <span>{ar ? "العودة إلى ملفات الفريق" : "Back to team files"}</span>
        </Link>
      </div>
    </aside>
  );
}
