"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "./locale-provider";
import { isWorkspaceHref, workspaceNavItems } from "../lib/workspace-routes";

const icons: Record<string,string> = {
  "nav.files":"▣", "nav.recent":"◷", "nav.teamFolders":"▦", "nav.sharedWithMe":"⇄",
  "nav.sharedByMe":"↗", "nav.favorites":"☆", "files.trash":"⌫", "audit.heading":"◌"
};

export function WorkdriveNav(){
  const {label}=useLocale(); const pathname=usePathname();
  return <nav className="zoho-sidebar-nav" aria-label={label("nav.workspace")}>
    <div className="zoho-nav-section-title">{label("nav.workspace")}</div>
    {workspaceNavItems().map(item=><Link key={item.href} href={item.href} className={isWorkspaceHref(pathname,item.href)?"zoho-side-link active":"zoho-side-link"}>
      <span className="zoho-side-icon" aria-hidden="true">{icons[item.labelKey] ?? "•"}</span><span>{label(item.labelKey)}</span>
    </Link>)}
    <div className="zoho-sidebar-spacer" />
    <Link href="/organization" className={pathname==="/organization"?"zoho-side-link active":"zoho-side-link"}><span className="zoho-side-icon">◎</span><span>Organization</span></Link>
    <Link href="/settings" className={pathname==="/settings"?"zoho-side-link active":"zoho-side-link"}><span className="zoho-side-icon">⚙</span><span>{label("nav.settings")}</span></Link>
  </nav>;
}
