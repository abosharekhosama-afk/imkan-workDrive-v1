"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "../locale-provider";
import { GlobalSearch } from "../global-search";
import { ThemeToggle } from "../theme-toggle";
import { listMemberships, type OrganizationMembershipSummary } from "../../lib/api/auth";
import { listNotifications, type NotificationRecord } from "../../lib/api/notifications";
import { useShell } from "./shell-context";
import { Icons } from "./icons";
import { AccountMenu } from "./account-menu";
export function TopHeader() {
  const { label, locale, setLocale } = useLocale();
  const { setMobileNavOpen } = useShell();
  const [name, setName] = useState("");
  const [org, setOrg] = useState("");
  const [team, setTeam] = useState(false);
  const [members, setMembers] = useState<OrganizationMembershipSummary[]>([]);
  const [notes, setNotes] = useState<NotificationRecord[]>([]);
  const teamRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("workdrive_user");
      if (raw) {
        const u = JSON.parse(raw) as { name?: string; email?: string; organizationName?: string };
        setName(u.name || u.email || "");
        setOrg(u.organizationName ?? "");
      }
    } catch { /* noop */ }
    const token = typeof window !== "undefined" ? localStorage.getItem("workdrive_access_token") : null;
    if (!token) return;
    listMemberships(token).then(setMembers).catch(() => undefined);
    listNotifications().then(setNotes).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!team) return;
    const onDown = (e: MouseEvent) => { if (!teamRef.current?.contains(e.target as Node)) setTeam(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [team]);
  const unread = notes.filter((n) => !n.readAt).length;
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[color:var(--imkan-color-border)] bg-white px-3">
      <button type="button" className="rounded-md p-2 text-slate-600 hover:bg-slate-100 md:hidden" onClick={() => setMobileNavOpen(true)} aria-label={label("nav.workspace")}>
        <Icons.menu size={18} />
      </button>
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-[14px] font-semibold text-slate-900">{label("files.breadcrumb.root")}</span>
        <button type="button" className="hidden items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[12px] text-slate-600 hover:bg-slate-50 sm:inline-flex">
          {label("nav.manage")} <Icons.chevD size={13} />
        </button>
      </div>
      <div className="ms-auto flex shrink-0 items-center gap-1.5">
        <div className="relative hidden lg:block" ref={teamRef}>
          <button type="button" onClick={() => setTeam((v) => !v)} aria-expanded={team} aria-haspopup="menu" className="flex max-w-[220px] items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-100">
            <span className="flex h-6 w-6 items-center justify-center rounded bg-slate-900 text-[11px] font-bold text-white">{(org || "I").slice(0, 1).toUpperCase()}</span>
            <span className="truncate text-[13px] font-medium text-slate-800">{org || "IMKAN"}</span>
            <Icons.chevD size={14} />
          </button>
          {team ? (
            <div className="absolute end-0 top-full z-50 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-1 shadow-xl" role="menu">
              {members.map((m) => (
                <div key={m.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-[13px] hover:bg-slate-50">
                  <span className="flex h-6 w-6 items-center justify-center rounded bg-slate-200 text-[11px] font-bold">{m.organization.name.slice(0, 1).toUpperCase()}</span>
                  <span className="min-w-0 flex-1 truncate">{m.organization.name}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <div className="hidden w-56 md:block xl:w-72"><GlobalSearch /></div>
        <Link href="/notifications" className="relative rounded-md p-2 text-slate-500 hover:bg-slate-100" aria-label={label("nav.notifications")} title={label("nav.notifications")}>
          <Icons.bell size={17} />
          {unread > 0 ? <span className="absolute end-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{unread > 9 ? "9+" : unread}</span> : null}
        </Link>
        <ThemeToggle />
        <button type="button" className="rounded-md px-2 py-1.5 text-[12px] font-semibold text-slate-500 hover:bg-slate-100" onClick={() => setLocale(locale === "en" ? "ar" : "en")}>
          {locale === "en" ? "ع" : "En"}
        </button>
        <AccountMenu name={name} />
      </div>
    </header>
  );
}
