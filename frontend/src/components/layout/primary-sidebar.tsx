"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useLocale } from "../locale-provider";
import { getStorageOverview, type QuotaOverview } from "../../lib/api/quota";
import { listTeamFolders, type TeamFolderListItem } from "../../lib/api/team-folders";
import { useShell } from "./shell-context";
import { Icons } from "./icons";
import { SidebarNav } from "./sidebar-nav";
import { SidebarFooter } from "./sidebar-footer";
export function PrimarySidebar() {
  const { label } = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const { sidebarCollapsed, setMobileNavOpen } = useShell();
  const [open, setOpen] = useState(true);
  const [teams, setTeams] = useState<TeamFolderListItem[]>([]);
  const [quota, setQuota] = useState<QuotaOverview | null>(null);
  const [role, setRole] = useState("");
  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("workdrive_access_token") : null;
    if (!token) return;
    listTeamFolders().then((r) => setTeams(r.teamFolders ?? [])).catch(() => undefined);
    getStorageOverview().then(setQuota).catch(() => undefined);
    try {
      const raw = localStorage.getItem("workdrive_user");
      if (raw) setRole((JSON.parse(raw) as { role?: string }).role ?? "");
    } catch { /* noop */ }
  }, []);
  const c = sidebarCollapsed;
  const close = () => setMobileNavOpen(false);
  const teamActive = pathname.startsWith("/files/team-folders");
  return (
    <div className="flex h-full w-full flex-col bg-[#191A1F] text-slate-200">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-white/[0.07] px-3">
        <button type="button" className="rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white" title={label("nav.appSwitcher")} aria-label={label("nav.appSwitcher")}>
          <Icons.grid size={18} />
        </button>
        {c ? null : (
          <Link href="/files" onClick={close} className="flex min-w-0 flex-1 items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#1B66EA] text-[13px] font-bold text-white">I</span>
            <span className="truncate text-[13.5px] font-semibold text-white">{label("app.title")}</span>
          </Link>
        )}
      </div>
      <SidebarNav />
      {c ? null : (
        <div className="px-2 pb-1">
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] text-slate-300/90 hover:bg-white/[0.06] hover:text-white">
            <span aria-hidden="true" className="text-slate-400"><Icons.users size={17} /></span>
            <span className="min-w-0 flex-1 truncate text-start">{label("nav.teamFolders")}</span>
            <span aria-hidden="true" className={open ? "rotate-90 text-slate-500" : "text-slate-500"}><Icons.chevR size={14} /></span>
          </button>
          {open ? (
            <div className="ms-4 flex flex-col gap-0.5 border-s border-white/10 ps-2">
              {teams.length === 0 ? (
                <Link href="/files/team-folders" onClick={close} className="truncate rounded-md px-2 py-1.5 text-[12.5px] text-slate-500 hover:text-slate-200">{label("nav.general")}</Link>
              ) : teams.slice(0, 12).map((t) => (
                <Link key={t.id} href={t.rootFolderId ? `/files/${t.rootFolderId}` : "/files/team-folders"} onClick={close} title={t.name}
                  className="truncate rounded-md px-2 py-1.5 text-[12.5px] text-slate-400 hover:bg-white/[0.06] hover:text-white">{t.name}</Link>
              ))}
              <button type="button" onClick={() => router.push("/files/team-folders")} className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[12.5px] text-slate-500 hover:text-white">
                <Icons.plus size={13} /> {label("files.createFolder")}
              </button>
            </div>
          ) : null}
        </div>
      )}
      {c ? null : <SidebarFooter quota={quota} role={role} onNav={close} />}
    </div>
  );
}
