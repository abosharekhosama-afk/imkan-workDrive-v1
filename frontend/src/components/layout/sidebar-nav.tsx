"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "../locale-provider";
import { Icons, type IconName } from "./icons";
import { useShell } from "./shell-context";
import type { MessageKey } from "../../i18n";
type Item = { href: string; key: MessageKey; icon: IconName; active?: boolean; spaced?: boolean };
function Row({ item, collapsed, onNav, active }: { item: Item; collapsed: boolean; onNav: () => void; active?: boolean }) {
  const { label } = useLocale();
  const Icon = Icons[item.icon];
  const isActive = active ?? item.active;
  const cls = isActive
    ? "bg-[var(--wd-active)] font-bold text-[#DBE3FA]"
    : "font-medium text-[#EEEEEE] hover:bg-white/[0.08]";
  return (
    <Link href={item.href} onClick={onNav} aria-current={isActive ? "page" : undefined}
      title={collapsed ? label(item.key) : undefined}
      className={`flex h-10 w-full items-center gap-4 rounded-[16px] px-[15px] text-[14px] leading-[22px] transition-colors duration-150 ease-in-out ${cls} ${collapsed ? "justify-center px-0" : ""} ${item.spaced ? "my-4" : ""}`}>
      <span aria-hidden="true" className={isActive ? "text-[#DBE3FA]" : "text-[#EEEEEE]"}><Icon size={20} /></span>
      {collapsed ? null : <span className="min-w-0 flex-1 truncate">{label(item.key)}</span>}
    </Link>
  );
}
export function SidebarNav() {
  const pathname = usePathname();
  const { sidebarCollapsed, setMobileNavOpen } = useShell();
  const c = sidebarCollapsed;
  const close = () => setMobileNavOpen(false);
  const myActive = pathname === "/files" || (pathname.startsWith("/files/") && !pathname.startsWith("/files/recent") && !pathname.startsWith("/files/favorites") && !pathname.startsWith("/files/shared-with-me") && !pathname.startsWith("/files/shared-links") && !pathname.startsWith("/files/trash") && !pathname.startsWith("/files/team-folders"));
  const items: Item[] = [
    { href: "/files", key: "nav.fileSuggestions", icon: "spark" },
    { href: "/notifications", key: "nav.allUnread", icon: "bell" },
    { href: "/files/recent", key: "nav.recent", icon: "clock", active: pathname.startsWith("/files/recent") },
    { href: "/files/favorites", key: "nav.favorites", icon: "star", active: pathname.startsWith("/files/favorites") },
    { href: "/files", key: "nav.labels", icon: "tag" },
    { href: "/files/shared-with-me", key: "nav.sharedWithMe", icon: "share", active: pathname.startsWith("/files/shared-with-me") },
    { href: "/files/shared-links", key: "nav.collectFiles", icon: "inbox", active: pathname.startsWith("/files/shared-links") },
    { href: "/files", key: "nav.templates", icon: "layout" },
    { href: "/files", key: "nav.workflows", icon: "flow" },
    { href: "/files", key: "files.breadcrumb.root", icon: "folder", active: myActive, spaced: true },
  ];
  return (
    <nav className="min-h-0 flex-1 overflow-y-auto px-2 pt-4" aria-label="workspace">
      <div className="flex flex-col">{items.map((i) => <Row key={`${i.key}-${i.href}`} item={i} collapsed={c} onNav={close} />)}</div>
    </nav>
  );
}
