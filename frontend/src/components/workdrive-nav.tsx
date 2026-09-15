"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useLocale } from "./locale-provider";
import { isWorkspaceHref, workspaceNavItems } from "../lib/workspace-routes";

const icons: Record<string,string> = {
  "nav.files":"▣", "nav.recent":"◷", "nav.teamFolders":"▦", "nav.sharedWithMe":"⇄",
  "nav.sharedByMe":"↗", "nav.favorites":"☆", "files.trash":"⌫", "audit.heading":"◌"
};

export function WorkdriveNav(){
  const {label}=useLocale(); const pathname=usePathname(); const [role,setRole]=useState("");
  useEffect(()=>{try{const u=JSON.parse(localStorage.getItem("workdrive_user")||"{}");setRole(u.role||"")}catch{}} ,[]);
  return <nav className="zoho-sidebar-nav" aria-label={label("nav.workspace")}>
    <div className="zoho-nav-section-title">{label("nav.workspace")}</div>
    {workspaceNavItems().map(item=><Link key={item.href} href={item.href} className={isWorkspaceHref(pathname,item.href)?"zoho-side-link active":"zoho-side-link"}>
      <span className="zoho-side-icon" aria-hidden="true">{icons[item.labelKey] ?? "•"}</span><span>{label(item.labelKey)}</span>
    </Link>)}
    <div className="workflow-nav-section"><div className="zoho-nav-section-title">Workflow</div><Link href="/files/workflows/tasks" className={pathname.startsWith("/files/workflows/tasks")?"zoho-side-link active":"zoho-side-link"}><span className="zoho-side-icon">✓</span><span>My Tasks</span></Link>{role === "ADMIN" ? <><Link href="/files/workflows/mine" className={pathname.startsWith("/files/workflows/mine")?"zoho-side-link active":"zoho-side-link"}><span className="zoho-side-icon">◇</span><span>My Workflows</span></Link><Link href="/files/workflows/admin" className={pathname.startsWith("/files/workflows/admin")?"zoho-side-link active":"zoho-side-link"}><span className="zoho-side-icon">⚙</span><span>Workflow Administration</span></Link></> : null}</div><div className="zoho-sidebar-spacer" />
    <Link href="/organization" className={pathname==="/organization"?"zoho-side-link active":"zoho-side-link"}><span className="zoho-side-icon">◎</span><span>Organization</span></Link>
    <Link href="/settings" className={pathname==="/settings"?"zoho-side-link active":"zoho-side-link"}><span className="zoho-side-icon">⚙</span><span>{label("nav.settings")}</span></Link>
  </nav>;
}
