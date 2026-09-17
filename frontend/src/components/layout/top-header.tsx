"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "../locale-provider";
import { ThemeToggle } from "../theme-toggle";
import { listNotifications, type NotificationRecord } from "../../lib/api/notifications";
import { getTeamFolder, listTeamFolderMembers, type TeamFolderRecord } from "../../lib/api/team-folders";
import { readScope, type ScopeDetail } from "./shell-context";
import { Icons } from "./icons";
import { AccountMenu } from "./account-menu";
import { NotificationPanel } from "./notification-panel";
import { OrgSwitcher } from "../org-switcher";
export function TopHeader() {
  const { label, locale, setLocale } = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [name, setName] = useState("");
  const [org, setOrg] = useState("");
  const [role, setRole] = useState("");
  const [notes, setNotes] = useState<NotificationRecord[]>([]);
  const [scope, setScope] = useState<ScopeDetail>({ folderId: null, folderName: null });
  const [teamFolder, setTeamFolder] = useState<TeamFolderRecord | null>(null);
  const [teamMemberCount, setTeamMemberCount] = useState(0);
  const [manageOpen, setManageOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("workdrive_user");
      if (raw) {
        const u = JSON.parse(raw) as { name?: string; email?: string; organizationName?: string; role?: string };
        setName(u.name || u.email || "");
        setOrg(u.organizationName ?? "");
        setRole(u.role ?? "");
      }
    } catch { /* noop */ }
    const token = typeof window !== "undefined" ? localStorage.getItem("workdrive_access_token") : null;
    if (!token) return;
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
  const isTeamManageRoute = /^\/files\/team-folders\/[^/]+\/manage/.test(pathname);
  const isTeamFoldersDirectory = pathname === "/files/team-folders";
  const isFolderRoute = /^\/files\/[^/]+$/.test(pathname);
  const teamContext = isTeamManageRoute || (isFolderRoute && Boolean(scope.folderId));

  useEffect(() => {
    let live = true;
    const loadTeamContext = async () => {
      try {
        let candidate: TeamFolderRecord | null = null;
        if (isTeamManageRoute) {
          const id = pathname.split('/')[3];
          if (id) candidate = await getTeamFolder(decodeURIComponent(id));
        } else if (isFolderRoute && scope.folderId) {
          const { getFolder } = await import('../../lib/api/folders');
          const folder = await getFolder(scope.folderId);
          if (folder.teamFolderId) candidate = await getTeamFolder(folder.teamFolderId);
        }
        if (!live) return;
        setTeamFolder(candidate);
        if (candidate) {
          if (typeof candidate.memberCount === "number") {
            if (live) setTeamMemberCount(candidate.memberCount);
          } else {
            const memberRes = await listTeamFolderMembers(candidate.id);
            if (live) setTeamMemberCount(memberRes.members.length);
          }
        } else {
          setTeamMemberCount(0);
        }
      } catch {
        if (live) { setTeamFolder(null); setTeamMemberCount(0); }
      }
    };
    void loadTeamContext();
    return () => { live = false; };
  }, [isFolderRoute, isTeamManageRoute, pathname, scope.folderId]);

  const unread = notes.filter((n) => !n.readAt).length;
  const teamTabs = [
    ['details', 'Team Folder Details'], ['members', 'Members'], ['settings', 'Settings'],
    ['trash', 'Trash'], ['activity', 'Activity'], ['shared', 'Shared Items'], ['templates', 'Data Templates'],
  ] as const;

  if (isTeamFoldersDirectory) {
    return (
      <header className="team-context-header">
        <div className="team-context-title"><span className="team-context-folder"><Icons.folder size={23} /></span><span className="team-context-name">Team Folders</span></div>
        <div className="team-context-actions">
          <OrgSwitcher organizationName={org || "IMKAN"} userRole={role} />
          <button type="button" className="wd-icon-btn" aria-label={label("search.placeholder")} onClick={() => setSearchOpen(true)}><Icons.search size={17} /></button>
          <button type="button" className="wd-icon-btn" aria-label="Announcements"><Icons.horn size={17} /></button>
          <button type="button" className="wd-icon-btn" aria-label={label("nav.notifications")} onClick={() => setNotifOpen((v) => !v)}><Icons.bell size={17} /></button>
          <AccountMenu name={name} />
          <button type="button" className="wd-icon-btn" aria-label={label("nav.appSwitcher")}><Icons.grid size={17} /></button>
        </div>
        {searchOpen ? <HeaderSearchOverlay onClose={() => setSearchOpen(false)} inputRef={searchInputRef} /> : null}
      </header>
    );
  }

  if (teamContext && teamFolder) {
    const roleLabel = teamFolder.role === 'ORG_ADMIN' ? 'Admin' : teamFolder.role || 'Member';
    return (
      <header className={`team-context-header ${isTeamManageRoute ? 'team-context-header--manage' : ''}`}>
        <div className="team-context-title">
          <span className="team-context-folder"><Icons.folder size={23} /></span>
          <span className="team-context-name" title={teamFolder.name}>{teamFolder.name}</span>
          <span className="team-context-lock" aria-hidden="true"><Icons.shield size={13} /></span>
          <span className="team-context-role">{roleLabel}</span>
          <span className="team-context-members"><Icons.users size={14} /> {teamMemberCount}</span>
          <div className="relative">
            <button id="team-context-manage" type="button" onClick={() => setManageOpen((v) => !v)} aria-expanded={manageOpen} aria-haspopup="menu" className="team-context-manage">
              <Icons.gear size={14} /> Manage <Icons.chevD size={12} />
            </button>
            {manageOpen ? (
              <div className="team-context-menu" role="menu">
                {teamTabs.map(([key, text]) => (
                  <button key={key} type="button" role="menuitem" onClick={() => {
                    setManageOpen(false);
                    if (key === 'details') router.push(`/files/team-folders/${encodeURIComponent(teamFolder.id)}/manage?tab=details`);
                    else router.push(`/files/team-folders/${encodeURIComponent(teamFolder.id)}/manage?tab=${key}`);
                  }}>{text}</button>
                ))}
                <div className="team-context-menu-sep" />
                <button type="button" role="menuitem" onClick={() => { setManageOpen(false); router.push(teamFolder.rootFolderId ? `/files/${teamFolder.rootFolderId}` : '/files/team-folders'); }}>Open files</button>
              </div>
            ) : null}
          </div>
          {!isTeamManageRoute ? <button type="button" className="wd-icon-btn" title="Pin" aria-label="Pin"><Icons.pin size={16} /></button> : null}
        </div>
        {!isTeamManageRoute ? (
          <div className="team-context-actions">
            <OrgSwitcher organizationName={org || "IMKAN"} userRole={role} />
            <button type="button" className="wd-icon-btn" aria-label={label('search.placeholder')} onClick={() => setSearchOpen(true)}><Icons.search size={17} /></button>
            <button type="button" className="wd-icon-btn" aria-label="Announcements"><Icons.horn size={17} /></button>
            <button type="button" className="wd-icon-btn relative" aria-label={label('nav.notifications')} onClick={() => setNotifOpen((v) => !v)}><Icons.bell size={17} />{unread > 0 ? <span className="absolute end-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#DC2626] px-1 text-[10px] font-bold text-white">{unread > 9 ? '9+' : unread}</span> : null}</button>
            {notifOpen ? <NotificationPanel open={notifOpen} onClose={() => setNotifOpen(false)} /> : null}
            <AccountMenu name={name} />
            <button type="button" className="wd-icon-btn" aria-label={label('nav.appSwitcher')}><Icons.grid size={17} /></button>
          </div>
        ) : null}
        <Link href={isTeamManageRoute ? '/files/team-folders' : '/files'} className="team-context-close" aria-label="Close">×</Link>
        {searchOpen ? <HeaderSearchOverlay onClose={() => setSearchOpen(false)} inputRef={searchInputRef} /> : null}
      </header>
    );
  }

  return (
    <header className="wd-default-topbar flex h-12 shrink-0 items-center gap-2 border-b border-[#EDEDED] bg-white px-4">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[#F0F4FF] text-[var(--wd-primary)]"><Icons.folder size={18} /></span>
        <span className="max-w-[32vw] truncate text-[15px] font-semibold text-[#212121]">{scope.folderName ?? label("files.breadcrumb.root")}</span>
      </div>
      <div className="ms-auto flex min-w-0 shrink-0 items-center gap-1.5">
        <OrgSwitcher organizationName={org || "IMKAN"} userRole={role} />
        <button type="button" className="wd-icon-btn" aria-label={label("search.placeholder")} onClick={() => setSearchOpen(true)}><Icons.search size={17} /></button>
        <button type="button" className="wd-icon-btn" aria-label="Announcements"><Icons.horn size={17} /></button>
        <button type="button" className="wd-icon-btn relative" aria-label={label("nav.notifications")} onClick={() => setNotifOpen((v) => !v)}><Icons.bell size={17} />{unread > 0 ? <span className="absolute end-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#DC2626] px-1 text-[10px] font-bold text-white">{unread > 9 ? "9+" : unread}</span> : null}</button>
        {notifOpen ? <NotificationPanel open={notifOpen} onClose={() => setNotifOpen(false)} /> : null}
        <ThemeToggle /><button type="button" className="rounded-md px-2 py-1.5 text-[12px] font-semibold text-slate-500 hover:bg-slate-100" onClick={() => setLocale(locale === "en" ? "ar" : "en")}>{locale === "en" ? "ع" : "En"}</button><AccountMenu name={name} />
      </div>
      {searchOpen ? <HeaderSearchOverlay onClose={() => setSearchOpen(false)} inputRef={searchInputRef} /> : null}
    </header>
  );

}

function HeaderSearchOverlay({ onClose, inputRef }: { onClose: () => void; inputRef: React.RefObject<HTMLInputElement | null> }) {
  const { label } = useLocale();
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<"all" | "folders" | "files">("all");
  const [fileType, setFileType] = useState<"all" | "documents" | "images" | "pdf">("all");
  const [dateRange, setDateRange] = useState<"all" | "today" | "week" | "month">("all");
  const [createdBy, setCreatedBy] = useState<"all" | "me">("all");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [openFilter, setOpenFilter] = useState<"scope" | "fileType" | "date" | "createdBy" | null>(null);
  const [rows, setRows] = useState<{ folders: Array<{ id: string; name: string; ownerId?: string; teamFolderId?: string | null }>; files: Array<{ id: string; name: string; ownerId?: string; mimeType?: string | null; updatedAt?: string | null }> }>({ folders: [], files: [] });
  useEffect(() => {
    try {
      const raw = localStorage.getItem("workdrive_user");
      const user = raw ? JSON.parse(raw) as { id?: string; userId?: string } : null;
      setCurrentUserId(user?.id ?? user?.userId ?? null);
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    if (!openFilter) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target?.closest("[data-search-filter]")) setOpenFilter(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [openFilter]);

  useEffect(() => {
    if (!q.trim()) {
      setRows({ folders: [], files: [] });
      return;
    }
    let live = true;
    const t = window.setTimeout(() => {
      import("../../lib/api/search").then(({ searchNames }) => searchNames(q.trim(), scope === "folders" ? "folders" : scope === "files" ? "files" : "all").then((r) => {
        if (!live) return;
        let files = (r.files ?? []);
        const now = Date.now();
        if (dateRange !== "all") {
          const days = dateRange === "today" ? 1 : dateRange === "week" ? 7 : 30;
          files = files.filter((f) => f.updatedAt ? now - new Date(f.updatedAt).getTime() <= days * 86400000 : false);
        }
        if (fileType !== "all") {
          files = files.filter((f) => {
            const m = (f.mimeType ?? "").toLowerCase();
            if (fileType === "images") return m.startsWith("image/");
            if (fileType === "pdf") return m === "application/pdf";
            return m.includes("document") || m.includes("word") || m.includes("text") || m.includes("spreadsheet") || m.includes("presentation");
          });
        }
        const folders = scope === "files" ? [] : (r.folders ?? []).filter((f) => createdBy !== "me" || !currentUserId || f.ownerId === currentUserId).slice(0, 8);
        files = files.filter((f) => createdBy !== "me" || !currentUserId || f.ownerId === currentUserId);
        setRows({
          folders,
          files: scope === "folders" ? [] : files.slice(0, 12),
        });
      }).catch(() => {
        if (live) setRows({ folders: [], files: [] });
      }));
    }, 180);
    return () => { live = false; window.clearTimeout(t); };
  }, [q, scope, fileType, dateRange, createdBy, currentUserId]);

  const clearFilters = () => {
    setScope("all");
    setFileType("all");
    setDateRange("all");
    setCreatedBy("all");
    setOpenFilter(null);
  };

  const FilterChip = ({
    kind,
    icon,
    children,
  }: {
    kind: "scope" | "fileType" | "date" | "createdBy";
    icon: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <div className="relative" data-search-filter>
      <button
        type="button"
        className={`search-filter-chip ${openFilter === kind ? "is-open" : ""}`}
        onClick={() => setOpenFilter((v) => v === kind ? null : kind)}
        aria-expanded={openFilter === kind}
      >
        {icon}<span>{children}</span><Icons.chevD size={12} />
      </button>
      {openFilter === kind ? (
        <div className="search-filter-popover" role="menu">
          {kind === "scope" ? ([
            ["all", "Search All"], ["folders", "Folders"], ["files", "Files"],
          ] as const).map(([k, text]) => (
            <button key={k} type="button" className={scope === k ? "is-selected" : ""} onClick={() => { setScope(k); setOpenFilter(null); }}>
              <span>{text}</span>{scope === k ? <span>✓</span> : null}
            </button>
          )) : null}
          {kind === "fileType" ? ([
            ["all", "All File Types"], ["documents", "Documents"], ["images", "Images"], ["pdf", "PDF"],
          ] as const).map(([k, text]) => (
            <button key={k} type="button" className={fileType === k ? "is-selected" : ""} onClick={() => { setFileType(k); setOpenFilter(null); }}>
              <span>{text}</span>{fileType === k ? <span>✓</span> : null}
            </button>
          )) : null}
          {kind === "date" ? ([
            ["all", "All Dates"], ["today", "Today"], ["week", "Last 7 days"], ["month", "Last 30 days"],
          ] as const).map(([k, text]) => (
            <button key={k} type="button" className={dateRange === k ? "is-selected" : ""} onClick={() => { setDateRange(k); setOpenFilter(null); }}>
              <span>{text}</span>{dateRange === k ? <span>✓</span> : null}
            </button>
          )) : null}
          {kind === "createdBy" ? (
            <button type="button" className={createdBy === "me" ? "is-selected" : ""} onClick={() => { setCreatedBy(createdBy === "me" ? "all" : "me"); setOpenFilter(null); }}>
              <span>Me</span>{createdBy === "me" ? <span>✓</span> : null}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  const hasFilters = scope !== "all" || fileType !== "all" || dateRange !== "all" || createdBy !== "all";

  return (
    <div className="search-overlay" role="dialog" aria-modal="true" aria-label={label("search.placeholder")}>
      <div className="search-overlay-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="search-overlay-panel">
        <div className="search-mainbar">
          <FilterChip kind="scope" icon={<Icons.search size={15} />}>{scope === "all" ? "Search All" : scope === "folders" ? "Folders" : "Files"}</FilterChip>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, keyword, object, and more"
            aria-label={label("search.placeholder")}
          />
          <span className="search-mainbar-label">Search across Zoho</span>
          <button type="button" className="search-overlay-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="search-filters-row">
          <FilterChip kind="fileType" icon={<Icons.doc size={14} />}>{fileType === "all" ? "All File Types" : fileType === "pdf" ? "PDF" : fileType[0].toUpperCase() + fileType.slice(1)}</FilterChip>
          <FilterChip kind="date" icon={<Icons.clock size={14} />}>{dateRange === "all" ? "All Dates" : dateRange === "today" ? "Today" : dateRange === "week" ? "Last 7 days" : "Last 30 days"}</FilterChip>
          <FilterChip kind="createdBy" icon={<Icons.users size={14} />}>{createdBy === "all" ? "Created by" : "Me"}</FilterChip>
          {hasFilters ? <button type="button" className="search-clear-filters" onClick={clearFilters}>Clear Filters</button> : null}
        </div>

        <div className="search-results">
          {!q.trim() ? (
            <div className="search-empty-prompt">{label("search.placeholder")}</div>
          ) : (
            <>
              {rows.folders.length > 0 ? (
                <section>
                  <div className="search-section-title">TEAM FOLDERS</div>
                  {rows.folders.map((f) => (
                    <Link key={f.id} href={`/files/${f.id}`} onClick={onClose} className="search-result-row">
                      <span className="search-result-icon"><Icons.folder size={19} /></span>
                      <span className="search-result-copy"><strong>{f.name}</strong><small>Team Folder</small></span>
                    </Link>
                  ))}
                </section>
              ) : null}
              {rows.files.length > 0 ? (
                <section>
                  <div className="search-section-title">FILES</div>
                  {rows.files.map((f) => (
                    <button key={f.id} type="button" onClick={() => { onClose(); window.dispatchEvent(new CustomEvent("workdrive:preview-by-id", { detail: { id: f.id } })); }} className="search-result-row">
                      <span className="search-result-icon file"><Icons.doc size={19} /></span>
                      <span className="search-result-copy"><strong>{f.name}</strong><small>{f.updatedAt ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(f.updatedAt)) : "File"}</small></span>
                    </button>
                  ))}
                </section>
              ) : (
                <div className="search-no-results">No results found</div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
