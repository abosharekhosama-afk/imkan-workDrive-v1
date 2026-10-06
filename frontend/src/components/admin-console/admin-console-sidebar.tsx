"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useLocale } from "@/components/locale-provider";
import { getWorkspacePolicy } from "@/lib/api/organization";
import { Icons, type IconName } from "@/components/layout/icons";
import { useShell } from "@/components/layout/shell-context";

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
  { href: "/admin/backup", en: "Backup & Recovery", ar: "النسخ الاحتياطي والاستعادة", icon: "cloudUp" },
  { href: "/admin/audit", en: "Audit Logs & Reports", ar: "سجلات التدقيق والتقارير", icon: "history" },
  { href: "/admin/data-administration", en: "Data Administration", ar: "إدارة البيانات", icon: "columns" },
  { href: "/admin/devices", en: "Manage Devices", ar: "إدارة الأجهزة", icon: "columns" },
];

export function AdminConsoleSidebar() {
  const pathname = usePathname();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const { sidebarCollapsed, mobileNavOpen, setMobileNavOpen } = useShell();
  const closeMobile = () => setMobileNavOpen(false);
  const [logo, setLogo] = useState<string | null>(null);
  // Mobile drawer always shows expanded labels.
  const collapsed = mobileNavOpen ? false : sidebarCollapsed;
  useEffect(() => {
    const load = () => { getWorkspacePolicy().then((policy) => setLogo(policy.logoDataUrl)).catch(() => undefined); };
    load();
    window.addEventListener("workdrive:workspace-policy", load);
    return () => window.removeEventListener("workdrive:workspace-policy", load);
  }, []);

  return (
    <aside data-overlay-bound="sidebar" className={`admin-console-sidebar flex h-full shrink-0 flex-col bg-[#282828] text-[#EEEEEE] transition-[width] ${collapsed ? "w-16" : "w-[255px]"}`} dir={ar ? "rtl" : "ltr"}>
      <div className="flex h-12 shrink-0 items-center gap-2 px-4 shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
        <Link href="/admin" className="flex min-w-0 items-center gap-2 text-[#EEEEEE]">
          {logo ? <img src={logo} alt="" className="h-7 max-w-[120px] object-contain" /> : <span className="flex h-6 w-6 shrink-0 items-center justify-center text-[#EEEEEE]"><Icons.folder size={20} /></span>}
          {collapsed ? null : <span className="truncate text-[17px] font-medium leading-5 text-[#EEEEEE]">IMKAN</span>}
        </Link>
      </div>

      <nav className="sidebar-scroll-hidden min-h-0 flex-1 overflow-y-auto px-2 py-4" aria-label={ar ? "تنقل وحدة الإدارة" : "Admin console navigation"}>
        {items.map((item, index) => {
          const previous = items[index - 1];
          const showSection = item.section && item.section !== previous?.section;
          const active = item.href === "/admin" ? pathname === "/admin" : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = Icons[item.icon];
          return (
            <div key={item.href}>
              {showSection && !collapsed ? <div className="px-[15px] pb-1 pt-4 text-[11px] font-medium text-[#9CA3AF]">{item.section}</div> : null}
              <Link href={item.href} onClick={closeMobile} aria-current={active ? "page" : undefined}
                className={`flex h-10 items-center gap-4 rounded-[16px] px-[15px] text-[14px] leading-[22px] transition-colors duration-150 ease-in-out ${active ? "bg-[var(--wd-active)] font-bold text-[#DBE3FA]" : "font-medium text-[#EEEEEE] hover:bg-white/[0.08]"} ${collapsed ? "justify-center px-0" : ""}`}>
                <span className={active ? "text-[#DBE3FA]" : "text-[#EEEEEE]"}><Icon size={20} /></span>
                {collapsed ? null : <span className="min-w-0 flex-1 truncate">{ar ? item.ar : item.en}</span>}
              </Link>
            </div>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-white/10 p-2">
        <Link href="/files" className={`flex h-10 items-center gap-4 rounded-[16px] text-[14px] font-medium text-[#EEEEEE] hover:bg-white/[0.08] ${collapsed ? "justify-center px-0" : "px-[15px]"}`}>
          <Icons.chevR size={18} className={ar ? "rotate-180" : ""} />
          {collapsed ? null : <span className="min-w-0 flex-1 truncate">{ar ? "العودة إلى ملفات الفريق" : "Back to team files"}</span>}
        </Link>
      </div>
    </aside>
  );
}
