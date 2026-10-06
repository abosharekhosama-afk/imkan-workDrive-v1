"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "../locale-provider";
import { Icons, type IconName } from "./icons";
import { useShell } from "./shell-context";
import type { MessageKey } from "@/i18n";
import { buildWorkdriveSidebarItems } from "./workdrive-sidebar-logic";

type Item = { href: string; key: MessageKey; icon: IconName; active?: boolean; spaced?: boolean };

function Row({ item, collapsed, onNav }: { item: Item; collapsed: boolean; onNav: () => void }) {
  const { label } = useLocale();
  const Icon = Icons[item.icon];
  const isActive = Boolean(item.active);
  const cls = isActive
    ? "wd-sidebar-item is-active bg-[var(--wd-sidebar-active-bg)] font-bold text-[var(--wd-sidebar-active-text)]"
    : "wd-sidebar-item font-medium text-[var(--wd-sidebar-text)] hover:bg-white/[0.08]";
  return (
    <Link
      href={item.href}
      onClick={onNav}
      aria-current={isActive ? "page" : undefined}
      title={collapsed ? label(item.key) : undefined}
      className={`flex h-10 w-full items-center gap-4 rounded-[16px] px-[15px] text-[14px] leading-[22px] transition-colors duration-150 ease-in-out ${cls} ${collapsed ? "justify-center px-0" : ""} ${item.spaced ? "my-4" : ""}`}
    >
      <span aria-hidden="true" className={isActive ? "text-[var(--wd-sidebar-active-text)]" : "text-[var(--wd-sidebar-text)]"}>
        <Icon size={20} />
      </span>
      {collapsed ? null : <span className="min-w-0 flex-1 truncate">{label(item.key)}</span>}
    </Link>
  );
}

export function SidebarNav() {
  const pathname = usePathname();
  const { sidebarCollapsed, mobileNavOpen, setMobileNavOpen } = useShell();
  const c = mobileNavOpen ? false : sidebarCollapsed;
  const close = () => setMobileNavOpen(false);
  const items: Item[] = buildWorkdriveSidebarItems(pathname);
  return (
    <nav className="workspace-sidebar-scroll min-h-0 flex-1 overflow-y-auto px-2 pt-4" aria-label="workspace">
      <div className="flex flex-col">
        {items.map((i) => (
          <Row key={`${i.key}-${i.href}`} item={i} collapsed={c} onNav={close} />
        ))}
      </div>
    </nav>
  );
}
