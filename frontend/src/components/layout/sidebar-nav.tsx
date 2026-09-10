"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "../locale-provider";
import { Icons, type IconName } from "./icons";
import { useShell } from "./shell-context";
import type { MessageKey } from "../../i18n";
type Item = { href: string; key: MessageKey; icon: IconName; active: boolean };
function Row({ item, collapsed, onNav }: { item: Item; collapsed: boolean; onNav: () => void }) {
  const { label } = useLocale();
  const Icon = Icons[item.icon];
  const cls = item.active
    ? "bg-[#2A3756] font-medium text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
    : "text-slate-300/90 hover:bg-white/[0.06] hover:text-white";
  return (
    <Link href={item.href} onClick={onNav} aria-current={item.active ? "page" : undefined}
      title={collapsed ? label(item.key) : undefined}
      className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] leading-5 transition-colors ${cls} ${collapsed ? "justify-center px-0" : ""}`}>
      <span aria-hidden="true" className={item.active ? "text-white" : "text-slate-400"}><Icon size={17} /></span>
      {collapsed ? null : <span className="min-w-0 flex-1 truncate">{label(item.key)}</span>}
    </Link>
  );
}
function Title({ collapsed, k }: { collapsed: boolean; k: MessageKey }) {
  const { label } = useLocale();
  if (collapsed) return <div className="mx-2 my-2 border-t border-white/10" aria-hidden="true" />;
  return <div className="px-2.5 pb-1 pt-3 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-500">{label(k)}</div>;
}
export function SidebarNav() {
  const pathname = usePathname();
  const { sidebarCollapsed, setMobileNavOpen } = useShell();
  const c = sidebarCollapsed;
  const close = () => setMobileNavOpen(false);
  const myActive = pathname === "/files" || /^\/files\/[^/]+$/.test(pathname);
  const quick: Item[] = [
    { href: "/files/recent", key: "nav.recent", icon: "clock", active: pathname.startsWith("/files/recent") },
    { href: "/files/favorites", key: "nav.favorites", icon: "star", active: pathname.startsWith("/files/favorites") },
    { href: "/notifications", key: "nav.unread", icon: "bell", active: pathname.startsWith("/notifications") },
  ];
  const collab: Item[] = [
    { href: "/files/shared-with-me", key: "nav.sharedWithMe", icon: "share", active: pathname.startsWith("/files/shared-with-me") },
    { href: "/files/shared-by-me", key: "nav.sharedByMe", icon: "inbox", active: pathname.startsWith("/files/shared-by-me") },
    { href: "/files/activity", key: "nav.workflows", icon: "flow", active: false },
  ];
  return (
    <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-2" aria-label="workspace">
      <Title collapsed={c} k="nav.quickAccess" />
      <div className="flex flex-col gap-0.5">{quick.map((i) => <Row key={i.key} item={i} collapsed={c} onNav={close} />)}</div>
      <Title collapsed={c} k="nav.collab" />
      <div className="flex flex-col gap-0.5">{collab.map((i) => <Row key={i.key} item={i} collapsed={c} onNav={close} />)}</div>
      <Title collapsed={c} k="nav.spaces" />
      <div className="flex flex-col gap-0.5">
        <Row item={{ href: "/files", key: "files.breadcrumb.root", icon: "folder", active: myActive }} collapsed={c} onNav={close} />
      </div>
    </nav>
  );
}
