"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "../locale-provider";
import type { MessageKey } from "../../i18n";
import { ThemeToggle } from "../theme-toggle";
import { listMemberships, type OrganizationMembershipSummary } from "../../lib/api/auth";
import { listNotifications, type NotificationRecord } from "../../lib/api/notifications";
import { useShell, readScope, type ScopeDetail } from "./shell-context";
import { Icons } from "./icons";
import { AccountMenu } from "./account-menu";
import { ZohoMenu } from "./zoho-menu";
import { NotificationPanel } from "./notification-panel";
export function TopHeader() {
  const { label, locale, setLocale } = useLocale();
  const router = useRouter();
  const { setMobileNavOpen } = useShell();
  const [name, setName] = useState("");
  const [org, setOrg] = useState("");
  const [team, setTeam] = useState(false);
  const [members, setMembers] = useState<OrganizationMembershipSummary[]>([]);
  const [notes, setNotes] = useState<NotificationRecord[]>([]);
  const [scope, setScope] = useState<ScopeDetail>({ folderId: null, folderName: null });
  const [manageOpen, setManageOpen] = useState(false);
  const [treeOpen, setTreeOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const teamRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
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
    setScope(readScope());
    const onScope = (e: Event) => setScope((e as CustomEvent<ScopeDetail>).detail ?? { folderId: null, folderName: null });
    window.addEventListener("workdrive:scope", onScope);
    return () => window.removeEventListener("workdrive:scope", onScope);
  }, []);
  useEffect(() => {
    if (!searchOpen) return;
    searchInputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSearchOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [searchOpen]);
  useEffect(() => {
    if (!team) return;
    const onDown = (e: MouseEvent) => { if (!teamRef.current?.contains(e.target as Node)) setTeam(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [team]);
  const unread = notes.filter((n) => !n.readAt).length;
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[#EDEDED] bg-white px-3">
      <button type="button" className="wd-icon-btn md:hidden" onClick={() => setMobileNavOpen(true)} aria-label={label("nav.workspace")}>
        <Icons.menu size={18} />
      </button>
      <button id="hdr-tree-btn" type="button" onClick={() => setTreeOpen((v) => !v)} aria-expanded={treeOpen} aria-haspopup="menu" title={label("nav.manage")} aria-label={label("nav.manage")} className="wd-icon-btn hidden md:inline-flex">
        <Icons.tree size={17} />
      </button>
      <ZohoMenu open={treeOpen} onClose={() => setTreeOpen(false)} labelledBy="hdr-tree-btn"
        onSelect={(k) => {
          if (k === "root") router.push("/files");
          else if (k === "recent") router.push("/files/recent");
          else if (k === "favorites") router.push("/files/favorites");
          else if (k === "trash") router.push("/files/trash");
        }}
        items={[
          { key: "root", labelKey: "files.breadcrumb.root" },
          { key: "recent", labelKey: "nav.recent" },
          { key: "favorites", labelKey: "nav.favorites" },
          "sep",
          { key: "trash", labelKey: "files.trash" },
        ]} />
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[#F0F4FF] text-[var(--wd-primary)]" aria-hidden="true">
          <Icons.folder size={18} />
        </span>
        <span className="max-w-[30vw] truncate text-[15px] font-semibold text-[#212121]" title={scope.folderName ?? label("files.breadcrumb.root")}>
          {scope.folderName ?? label("files.breadcrumb.root")}
        </span>
        <button id="hdr-manage-btn" type="button" onClick={() => setManageOpen((v) => !v)} aria-expanded={manageOpen} aria-haspopup="menu"
          className="wd-pill-manage inline-flex items-center gap-1">
          <Icons.gear size={14} /> {label("nav.manage")} <Icons.chevD size={13} />
        </button>
        <ZohoMenu open={manageOpen} onClose={() => setManageOpen(false)} labelledBy="hdr-manage-btn"
          onSelect={(k) => {
            if (k === "search") setSearchOpen(true);
            else if (k === "trash") router.push("/files/trash");
            else if (k === "shared") router.push("/files/shared-with-me");
            else if (k === "large") router.push("/files/recent");
          }}
          items={[
            { key: "search", labelKey: "menu.searchInFold" },
            { key: "trash", labelKey: "files.trash" },
            "sep",
            { key: "shared", labelKey: "nav.sharedWithMe" },
            { key: "large", labelKey: "nav.allUnread" },
          ]} />
      </div>
      <div className="ms-auto flex shrink-0 items-center gap-1.5">
        <div className="relative hidden lg:block" ref={teamRef}>
          <button type="button" onClick={() => setTeam((v) => !v)} aria-expanded={team} aria-haspopup="menu" className="flex max-w-[220px] items-center gap-2 rounded-[16px] px-2 py-1.5 hover:bg-[#F3F5F7]">
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
        <div className="hidden w-56 md:block xl:w-72">
          <button type="button" onClick={() => setSearchOpen(true)}
            className="wd-search flex w-full items-center gap-2 text-[#4F4F4F]" aria-label={label("search.placeholder")}>
            <Icons.search size={16} />
            <span className="min-w-0 flex-1 truncate text-start">{label("search.placeholder")}</span>
            <kbd className="hidden rounded border border-[#EDEDED] bg-[#F7F8FA] px-1.5 py-0.5 text-[10.5px] font-medium text-[#4F4F4F] xl:block">Ctrl K</kbd>
          </button>
        </div>
        <button type="button" className="wd-icon-btn" aria-label={label("search.placeholder")} onClick={() => setSearchOpen(true)}>
          <Icons.search size={17} />
        </button>
        <button type="button" className="wd-icon-btn" aria-label={label("nav.notifications")} title={label("nav.notifications")}>
          <Icons.horn size={17} />
        </button>
        <button id="hdr-notif-btn" type="button" onClick={() => setNotifOpen((v) => !v)} aria-expanded={notifOpen} aria-haspopup="menu"
          className="wd-icon-btn relative" aria-label={label("nav.notifications")} title={label("nav.notifications")}>
          <Icons.bell size={17} />
          {unread > 0 ? <span className="absolute end-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#DC2626] px-1 text-[10px] font-bold text-white">{unread > 9 ? "9+" : unread}</span> : null}
        </button>
        {notifOpen ? <NotificationPanel open={notifOpen} onClose={() => setNotifOpen(false)} /> : null}
        <Link href="/settings" className="wd-icon-btn hidden sm:inline-flex" aria-label={label("nav.theme")} title={label("nav.theme")}>
          <Icons.gear size={17} />
        </Link>
        <Link href="/help" className="wd-icon-btn hidden sm:inline-flex" aria-label={label("nav.help")} title={label("nav.help")}>
          <Icons.help size={17} />
        </Link>
        <button type="button" className="wd-icon-btn hidden sm:inline-flex" title={label("nav.appSwitcher")} aria-label={label("nav.appSwitcher")}>
          <Icons.grid size={17} />
        </button>
        <ThemeToggle />
        <button type="button" className="rounded-md px-2 py-1.5 text-[12px] font-semibold text-slate-500 hover:bg-slate-100" onClick={() => setLocale(locale === "en" ? "ar" : "en")}>
          {locale === "en" ? "ع" : "En"}
        </button>
        <div className="relative">
          <span className="absolute -end-0.5 bottom-0 z-10 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" aria-hidden="true" />
          <AccountMenu name={name} />
        </div>
      </div>
      {searchOpen ? <HeaderSearchOverlay onClose={() => setSearchOpen(false)} inputRef={searchInputRef} /> : null}
    </header>
  );
}

function HeaderSearchOverlay({ onClose, inputRef }: { onClose: () => void; inputRef: React.RefObject<HTMLInputElement | null> }) {
  const { label } = useLocale();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "folders" | "files" | "recent">("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement | null>(null);
  const [rows, setRows] = useState<{ folders: { id: string; name: string }[]; files: { id: string; name: string }[] }>({ folders: [], files: [] });
  const filterOptions: Array<{ key: "all" | "folders" | "files" | "recent"; labelKey: MessageKey }> = [
    { key: "all", labelKey: "search.filter.all" },
    { key: "folders", labelKey: "search.filter.folders" },
    { key: "files", labelKey: "search.filter.files" },
    { key: "recent", labelKey: "search.filter.recent" },
  ];
  useEffect(() => {
    if (!filterOpen) return;
    const onDown = (e: MouseEvent) => { if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [filterOpen]);
  useEffect(() => {
    if (!q.trim()) { setRows({ folders: [], files: [] }); return; }
    let live = true;
    const t = window.setTimeout(() => {
      import("../../lib/api/search").then(({ searchNames }) => searchNames(q.trim(), filter).then((r) => {
        if (live) setRows({ folders: (r.folders ?? []).slice(0, 5), files: (r.files ?? []).slice(0, 7) });
      }).catch(() => undefined));
    }, 220);
    return () => { live = false; window.clearTimeout(t); };
  }, [q, filter]);
  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label={label("search.placeholder")}>
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden="true" />
      <div className="absolute start-1/2 top-20 w-[min(36rem,92vw)] -translate-x-1/2 rtl:translate-x-1/2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5">
          <Icons.search size={16} />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={label("search.placeholder")}
            aria-label={label("search.placeholder")} className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-slate-400" />
          <div className="relative" ref={filterRef}>
            <button id="hdr-search-filter-btn" type="button" onClick={() => setFilterOpen((v) => !v)} aria-expanded={filterOpen} aria-haspopup="menu"
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[12px] text-slate-600 hover:bg-slate-50">
              <Icons.funnel size={13} /> {label((filterOptions.find((o) => o.key === filter)?.labelKey ?? "search.filter.all") as MessageKey)}
            </button>
            {filterOpen ? (
              <div className="absolute top-full z-[90] mt-1 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg" role="menu">
                {filterOptions.map((o) => (
                  <button key={o.key} type="button" role="menuitem" onClick={() => { setFilter(o.key); setFilterOpen(false); }}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-start text-[13px] ${filter === o.key ? "bg-[#EEF3FE] text-[#1B66EA]" : "text-slate-700 hover:bg-slate-50"}`}>
                    <span className="w-4 text-center">{filter === o.key ? "✓" : ""}</span>
                    <span className="flex-1">{label(o.labelKey)}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10.5px] text-slate-400">ESC</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-1.5">
          {rows.folders.map((f) => (
            <a key={f.id} href={`/files/${f.id}`} onClick={onClose} className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] hover:bg-[#EEF3FE]">
              <span className="text-[#1B66EA]"><Icons.folder size={16} /></span>
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
            </a>
          ))}
          {rows.files.map((f) => (
            <button key={f.id} type="button" onClick={() => { onClose(); window.dispatchEvent(new CustomEvent("workdrive:preview-by-id", { detail: { id: f.id } })); }}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-start text-[13.5px] hover:bg-[#EEF3FE]">
              <span className="text-slate-400"><Icons.doc size={16} /></span>
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
            </button>
          ))}
          {!q.trim() ? <p className="px-3 py-4 text-center text-[13px] text-slate-400">{label("search.placeholder")}</p> : null}
        </div>
      </div>
    </div>
  );
}
