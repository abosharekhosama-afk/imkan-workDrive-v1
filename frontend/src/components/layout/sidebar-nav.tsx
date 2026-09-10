"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "../locale-provider";
import { Icons, type IconName } from "./icons";
import { useShell } from "./shell-context";
import type { MessageKey } from "../../i18n";
type Item = { href: string; key: MessageKey; icon: IconName; active?: boolean };
function Row({ item, collapsed, onNav, active }: { item: Item; collapsed: boolean; onNav: () => void; active?: boolean }) {
  const { label } = useLocale();
  const Icon = Icons[item.icon];
  const isActive = active ?? item.active;
  const cls = isActive
    ? "bg-[#2A3A58] font-medium text-white"
    : "text-[#9CA3AF] hover:bg-white/[0.06] hover:text-white";
  return (
    <Link href={item.href} onClick={onNav} aria-current={isActive ? "page" : undefined}
      title={collapsed ? label(item.key) : undefined}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] leading-5 transition-colors ${cls} ${collapsed ? "justify-center px-0" : ""}`}>
      <span aria-hidden="true" className={isActive ? "text-white" : "text-[#9CA3AF]"}><Icon size={17} /></span>
      {collapsed ? null : <span className="min-w-0 flex-1 truncate">{label(item.key)}</span>}
    </Link>
  );
}
function Title({ collapsed, k }: { collapsed: boolean; k: MessageKey }) {
  const { label } = useLocale();
  if (collapsed) return <div className="mx-2 my-2 border-t border-white/10" aria-hidden="true" />;
  return <div className="px-2.5 pb-1 pt-3 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#6B7280]">{label(k)}</div>;
}
export function SidebarNav() {
  const pathname = usePathname();
  const { sidebarCollapsed, setMobileNavOpen } = useShell();
  const c = sidebarCollapsed;
  const close = () => setMobileNavOpen(false);
  const myActive = pathname === "/files" && !pathname.startsWith("/files/recent") && !pathname.startsWith("/files/favorites") && !pathname.startsWith("/files/shared-with-me") && !pathname.startsWith("/files/shared-links") && !pathname.startsWith("/files/trash");
  const utilities: Item[] = [
    { href: "/files", key: "nav.fileSuggestions", icon: "spark" },
    { href: "/notifications", key: "nav.allUnread", icon: "bell" },
    { href: "/files/recent", key: "nav.recent", icon: "clock", active: pathname.startsWith("/files/recent") },
    { href: "/files/favorites", key: "nav.favorites", icon: "star", active: pathname.startsWith("/files/favorites") },
    { href: "/files", key: "nav.labels", icon: "tag" },
  ];
  const sharing: Item[] = [
    { href: "/files/shared-with-me", key: "nav.sharedWithMe", icon: "share", active: pathname.startsWith("/files/shared-with-me") },
    { href: "/files/shared-links", key: "nav.collectFiles", icon: "inbox", active: pathname.startsWith("/files/shared-links") },
  ];
  const automations: Item[] = [
    { href: "/files", key: "nav.templates", icon: "layout" },
    { href: "/files", key: "nav.workflows", icon: "flow" },
  ];
  return (
    <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-2" aria-label="workspace">
      <Title collapsed={c} k="nav.section.utilities" />
      <div className="flex flex-col gap-0.5">{utilities.map((i) => <Row key={i.key} item={i} collapsed={c} onNav={close} />)}</div>
      <Title collapsed={c} k="nav.section.sharing" />
      <div className="flex flex-col gap-0.5">{sharing.map((i) => <Row key={i.key} item={i} collapsed={c} onNav={close} />)}</div>
      <Title collapsed={c} k="nav.section.automations" />
      <div className="flex flex-col gap-0.5">{automations.map((i) => <Row key={i.key} item={i} collapsed={c} onNav={close} />)}</div>
      <Title collapsed={c} k="nav.section.spaces" />
      <div className="flex flex-col gap-0.5">
        <Row item={{ href: "/files", key: "files.breadcrumb.root", icon: "folder" }} collapsed={c} onNav={close} active={myActive} />
      </div>
    </nav>
  );
}
