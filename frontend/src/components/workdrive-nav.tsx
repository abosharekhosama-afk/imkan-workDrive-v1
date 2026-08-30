"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "./locale-provider";
import { activeSidebarSection } from "./view-mode-logic";

/** Primary sections required by the enterprise shell spec. */
const PRIMARY_SECTIONS = [
  { href: "/files", icon: "▣", labelKey: "nav.myFolder", section: "myFolder" },
  { href: "/files/team-folders", icon: "▦", labelKey: "nav.teamFolders", section: "teamFolders" },
  { href: "/files/shared-with-me", icon: "⇄", labelKey: "nav.sharedWithMe", section: "sharedWithMe" },
  { href: "/files/trash", icon: "⌫", labelKey: "files.trash", section: "trash" },
] as const;

const LIBRARY_LINKS = [
  { href: "/files/recent", icon: "◷", labelKey: "nav.recent" },
  { href: "/files/favorites", icon: "☆", labelKey: "nav.favorites" },
  { href: "/files/shared-by-me", icon: "↗", labelKey: "nav.sharedByMe" },
  { href: "/files/activity", icon: "◌", labelKey: "audit.heading" },
] as const;

export function WorkdriveNav({ onNavigate }: { onNavigate?: () => void }) {
  const { label } = useLocale();
  const pathname = usePathname();
  const activeSection = activeSidebarSection(pathname);

  return (
    <nav className="zoho-sidebar-nav" aria-label={label("nav.workspace")}>
      {PRIMARY_SECTIONS.map((item) => {
        const isActive = activeSection === item.section;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={isActive ? "page" : undefined}
            className={isActive ? "zoho-side-link active" : "zoho-side-link"}
          >
            <span className="zoho-side-icon" aria-hidden="true">{item.icon}</span>
            <span>{label(item.labelKey)}</span>
          </Link>
        );
      })}
      <div className="zoho-nav-section-title">{label("nav.library")}</div>
      {LIBRARY_LINKS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          aria-current={pathname.startsWith(item.href) ? "page" : undefined}
          className={pathname.startsWith(item.href) ? "zoho-side-link active" : "zoho-side-link"}
        >
          <span className="zoho-side-icon" aria-hidden="true">{item.icon}</span>
          <span>{label(item.labelKey)}</span>
        </Link>
      ))}
      <div className="zoho-sidebar-spacer" />
      <Link href="/organization" onClick={onNavigate} className={pathname === "/organization" ? "zoho-side-link active" : "zoho-side-link"}>
        <span className="zoho-side-icon">◎</span><span>Organization</span>
      </Link>
      <Link href="/settings" onClick={onNavigate} className={pathname === "/settings" ? "zoho-side-link active" : "zoho-side-link"}>
        <span className="zoho-side-icon">⚙</span><span>{label("nav.settings")}</span>
      </Link>
    </nav>
  );
}

