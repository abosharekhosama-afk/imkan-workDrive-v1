"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useId } from "react";
import { usePathname } from "next/navigation";
import { useLocale } from "../../../components/locale-provider";
import { useConfirmAction } from "../../../components/confirm-action-modal";
import { ApiError } from "../../../lib/api/client";
import { deleteTeamFolder, joinTeamFolder, listTeamFolders, renameTeamFolder, type TeamFolderListItem } from "../../../lib/api/team-folders";
import { formatBytes } from "../../../lib/api/quota";
import { MembersModal } from "../../../components/members-modal";
import { AlertBanner } from "../../../components/alert-banner";
import { EmptyState } from "../../../components/empty-state";
import { SkeletonLoader } from "../../../components/skeleton-loader";
import { ViewModePicker } from "../../../components/view-mode-picker";
import { TeamFolderActionMenu } from "../../../components/team-folder-action-menu";
import { ToolbarAnchoredPanel } from "../../../components/layout/toolbar-anchored-panel";
import { errorMessageForStatus } from "../../../components/feedback-state-logic";
import { persistViewMode, readStoredViewMode, type ViewMode } from "../../../components/view-mode-logic";

function FolderGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h4l1.8 2.2H18.5a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M3.5 10h17" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
function SearchIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>;
}
function FilterIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>;
}
function PinIcon({ filled = false }: { filled?: boolean }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m9 4 6 0 1 5 3 3v1h-5v6l-2 2-2-2v-6H5v-1l3-3Z" /></svg>;
}
function MembersIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="9" cy="8" r="3" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0M17 11a3 3 0 0 0 0-6M16.5 15a4.8 4.8 0 0 1 4 5" /></svg>;
}
function MoreIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>;
}

export default function TeamFoldersPage() {
  const { label, locale } = useLocale();
  const { requestConfirm, confirmModal } = useConfirmAction();
  const pathname = usePathname();
  const isAdminConsole = pathname.startsWith("/admin/team-folders");
  const adminTeamFoldersBase = "/admin/team-folders";
  const [teamFolders, setTeamFolders] = useState<TeamFolderListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeMembersTf, setActiveMembersTf] = useState<TeamFolderListItem | null>(null);
  const [detailsTf, setDetailsTf] = useState<TeamFolderListItem | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState<"joined" | "all" | "public" | "private">("joined");
  const [filterOpen, setFilterOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<TeamFolderListItem | null>(null);
  const [renameName, setRenameName] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const filterButtonId = useId().replace(/:/g, "");

  useEffect(() => {
    setViewMode(readStoredViewMode(window.localStorage, "list"));
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await listTeamFolders();
      setTeamFolders(res.teamFolders);
    } catch (cause) {
      setError(errorMessageForStatus(cause instanceof ApiError ? cause.status : undefined, {
        unauthenticated: label("error.unauthenticated"),
        forbidden: label("error.forbidden"),
        generic: label("error.generic"),
      }));
    } finally {
      setLoading(false);
    }
  }, [label]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    let live = true;
    import("../../../lib/api/favorites").then(({ listFavorites }) => listFavorites().then((rows) => {
      if (!live) return;
      const rootIds = new Set(teamFolders.map((tf) => tf.rootFolderId).filter(Boolean) as string[]);
      const pinned = rows.filter((row) => row.resourceType === "FOLDER" && rootIds.has(row.resourceId));
      setPinnedIds(new Set(
        pinned
          .map((row) => teamFolders.find((tf) => tf.rootFolderId === row.resourceId)?.id)
          .filter(Boolean) as string[],
      ));
    }).catch(() => undefined));
    return () => { live = false; };
  }, [teamFolders]);

  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener("workdrive:team-folders-changed", refresh);
    return () => window.removeEventListener("workdrive:team-folders-changed", refresh);
  }, [load]);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      if (!event.target.closest("[data-team-folder-menu], [data-team-folder-menu-trigger]")) {
        setMenuId(null);
        setMenuAnchor(null);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const visibleFolders = useMemo(() => {
    const q = search.trim().toLocaleLowerCase();
    return [...teamFolders]
      .filter((tf) => !q || tf.name.toLocaleLowerCase().includes(q))
      .filter((tf) => scopeFilter === "all" || (scopeFilter === "joined" ? tf.isMember : scopeFilter === "public" ? tf.isPublicToOrg : !tf.isPublicToOrg))
      .sort((a, b) => Number(pinnedIds.has(b.id)) - Number(pinnedIds.has(a.id)) || a.name.localeCompare(b.name));
  }, [teamFolders, search, pinnedIds, scopeFilter]);

  const createHref = isAdminConsole ? `${adminTeamFoldersBase}/create` : "/files/team-folders/create";

  const openRename = (tf: TeamFolderListItem) => {
    setMenuId(null);
    setMenuAnchor(null);
    setRenameTarget(tf);
    setRenameName(tf.name);
  };

  const remove = (tf: TeamFolderListItem) => {
    setMenuId(null);
    setMenuAnchor(null);
    requestConfirm({
      title: locale === "ar" ? "حذف مجلد الفريق" : "Delete team folder",
      description: locale === "ar" ? `هل تريد حذف مجلد الفريق «${tf.name}»؟` : `Delete team folder “${tf.name}”?`,
      confirmLabel: locale === "ar" ? "حذف" : "Delete",
      run: async () => {
      setActionBusy(true);
      setError(null);
      try {
        await deleteTeamFolder(tf.id);
        setPinnedIds((prev) => { const next = new Set(prev); next.delete(tf.id); return next; });
        await load();
      } catch (cause) {
        setError(cause instanceof ApiError ? cause.message : label("error.generic"));
      } finally {
        setActionBusy(false);
      }
      },
    });
  };

  const join = async (tf: TeamFolderListItem) => {
    if (!tf.isPublicToOrg || tf.isMember) return;
    setActionBusy(true);
    setError(null);
    try {
      await joinTeamFolder(tf.id);
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : label("error.generic"));
    } finally {
      setActionBusy(false);
    }
  };

  const togglePin = async (tf: TeamFolderListItem) => {
    const pinned = pinnedIds.has(tf.id);
    if (!tf.rootFolderId) return;
    setActionBusy(true);
    setError(null);
    try {
      const { addFavorite, removeFavorite } = await import("../../../lib/api/favorites");
      if (pinned) {
        await removeFavorite("FOLDER", tf.rootFolderId);
        setPinnedIds((prev) => {
          const next = new Set(prev);
          next.delete(tf.id);
          return next;
        });
      } else {
        await addFavorite("FOLDER", tf.rootFolderId);
        setPinnedIds((prev) => new Set(prev).add(tf.id));
      }
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : label("error.generic"));
    } finally {
      setActionBusy(false);
    }
  };

  const menuTf = useMemo(() => visibleFolders.find((tf) => tf.id === menuId) ?? null, [visibleFolders, menuId]);

  const toggleMenu = (tf: TeamFolderListItem, event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (menuId === tf.id) {
      setMenuId(null);
      setMenuAnchor(null);
      return;
    }
    setMenuId(tf.id);
    setMenuAnchor(event.currentTarget);
  };

  return (
    <section className="team-folders-page flex min-h-[calc(100dvh-56px)] w-full min-w-0 flex-1 flex-col bg-[var(--wd-bg,#fff)]">
      {confirmModal}
      <div className="team-folders-toolbar flex shrink-0 items-center border-b border-slate-100 px-5" data-team-folders-toolbar>
        <div className="relative shrink-0" data-team-folder-filter>
          <button id={filterButtonId} type="button" onClick={() => setFilterOpen((v) => !v)} className={`team-filter-trigger ${scopeFilter !== "joined" ? "is-active" : ""}`} aria-expanded={filterOpen} aria-haspopup="menu">
            <FilterIcon />
            <span>{scopeFilter === "joined" ? (locale === "ar" ? "مشترك" : "Joined") : scopeFilter === "public" ? "Public" : scopeFilter === "private" ? "Private" : "All"}</span>
            <span className="team-filter-chevron">⌄</span>
          </button>
          <ToolbarAnchoredPanel open={filterOpen} onClose={() => setFilterOpen(false)} anchorId={filterButtonId} align="start" width={180} className="p-1.5 [&_button]:flex [&_button]:w-full [&_button]:min-h-[34px] [&_button]:items-center [&_button]:justify-between [&_button]:rounded-[7px] [&_button]:border-0 [&_button]:bg-transparent [&_button]:px-[9px] [&_button]:text-[12px] [&_button]:text-[#41474d] [&_button:hover]:bg-[#f5f7f9] [&_button.is-selected]:bg-[#eef4ff] [&_button.is-selected]:font-medium [&_button.is-selected]:text-[#1b66ea]">
            {([["joined", locale === "ar" ? "مشترك" : "Joined"], ["all", locale === "ar" ? "الكل" : "All"], ["public", "Public"], ["private", "Private"]] as const).map(([key, text]) => (
              <button key={key} type="button" role="menuitem" className={scopeFilter === key ? "is-selected" : ""} onClick={() => { setScopeFilter(key); setFilterOpen(false); }}>
                <span>{text}</span>{scopeFilter === key ? <span aria-hidden="true">✓</span> : null}
              </button>
            ))}
          </ToolbarAnchoredPanel>
        </div>

        <label className="team-folders-search">
          <SearchIcon />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={locale === "ar" ? "بحث" : "Search"} aria-label={locale === "ar" ? "بحث في مجلدات الفريق" : "Search Team Folders"} />
          {search ? <button type="button" className="team-search-clear" onClick={() => setSearch("")} aria-label={locale === "ar" ? "مسح البحث" : "Clear search"}>×</button> : null}
        </label>

        <div className="ms-auto flex items-center gap-2">
          <Link href={createHref} className="team-create-button"><span aria-hidden="true">+</span>{locale === "ar" ? "إنشاء مجلد فريق" : "Create Team Folder"}</Link>
          <ViewModePicker
            view={viewMode}
            onView={(next) => {
              setViewMode(next);
              persistViewMode(window.localStorage, next);
            }}
            align="end"
          />
        </div>
      </div>

      {error ? <AlertBanner message={error} action={<button type="button" className="imkan-button-secondary" onClick={() => void load()}>{label("feedback.retry")}</button>} /> : null}

      {loading ? (
        <div className="team-folders-list-loading"><SkeletonLoader rows={4} columns={1} /></div>
      ) : visibleFolders.length === 0 ? (
        <div className="flex min-h-[calc(100vh-220px)] w-full flex-1 items-center justify-center self-stretch bg-[var(--wd-bg,#fff)] px-6 py-12">
          <EmptyState
            title={search ? (locale === "ar" ? "لا توجد نتائج" : "No matching Team Folders") : label("teamFolders.empty")}
            description={search ? undefined : label("teamFolders.emptyDescription")}
            action={!search ? <Link href={createHref} className="imkan-button">{locale === "ar" ? "إنشاء مجلد فريق" : "Create Team Folder"}</Link> : undefined}
          />
        </div>
      ) : viewMode === "grid" ? (
        <div className="team-folders-grid-wrap min-h-0 min-w-0 flex-1 overflow-auto p-5">
          <div className="team-folders-grid">
            {visibleFolders.map((tf) => {
              const pinned = pinnedIds.has(tf.id);
              const href = tf.rootFolderId ? (isAdminConsole ? `${adminTeamFoldersBase}/${encodeURIComponent(tf.id)}/manage` : `/files/${encodeURIComponent(tf.rootFolderId)}`) : createHref;
              return (
                <article key={tf.id} className="team-folder-card">
                  {tf.isMember ? (
                    <Link href={href} className="team-folder-card-main">
                      <span className="team-folder-glyph"><FolderGlyph /></span>
                      <span className="team-folder-name truncate">{tf.name}</span>
                    </Link>
                  ) : (
                    <div className="team-folder-card-main">
                      <span className="team-folder-glyph"><FolderGlyph /></span>
                      <span className="team-folder-name truncate">{tf.name}</span>
                    </div>
                  )}
                  <div className="team-folder-card-meta">
                    <span>{tf.memberCount} {locale === "ar" ? "عضو" : tf.memberCount === 1 ? "Member" : "Members"}</span>
                    {pinned ? <span>{locale === "ar" ? "مثبت" : "Pinned"}</span> : null}
                  </div>
                  <div className="team-folder-card-actions">
                    {tf.isMember ? (
                      <span className="team-folder-members" aria-label={`${tf.memberCount} ${locale === "ar" ? "عضو" : tf.memberCount === 1 ? "Member" : "Members"}`}><MembersIcon /><span>{tf.memberCount} {locale === "ar" ? "عضو" : tf.memberCount === 1 ? "Member" : "Members"}</span></span>
                    ) : (
                      <button type="button" className="team-folder-members" disabled={actionBusy} onClick={() => void join(tf)}><span className="text-[11px] font-semibold text-blue-600">{locale === "ar" ? "انضمام" : "Join"}</span></button>
                    )}
                    <button type="button" data-team-folder-menu-trigger aria-expanded={menuId === tf.id} className="team-folder-more" onClick={(event) => toggleMenu(tf, event)} aria-label={locale === "ar" ? "المزيد" : "More"}><MoreIcon /></button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="team-folders-table-wrap min-h-0 min-w-0 flex-1 overflow-auto">
          <div className="team-folders-table min-w-[720px]">
            {visibleFolders.map((tf, index) => {
              const pinned = pinnedIds.has(tf.id);
              return (
                <div key={tf.id} className={`team-folder-row group ${index === 0 && pinned ? "is-pinned" : ""}`} data-selected={detailsTf?.id === tf.id || undefined}>
                  {tf.isMember ? (
                    <Link href={tf.rootFolderId ? (isAdminConsole ? `${adminTeamFoldersBase}/${encodeURIComponent(tf.id)}/manage` : `/files/${encodeURIComponent(tf.rootFolderId)}`) : createHref} className="team-folder-main">
                      <span className="team-folder-glyph"><FolderGlyph /></span>
                      <span className="team-folder-copy">
                        <span className="team-folder-name">
                          <span className="truncate">{tf.name}</span>
                          {!tf.isPublicToOrg ? <span className="team-folder-lock" title={locale === "ar" ? "مجلد خاص" : "Private Team Folder"} aria-label={locale === "ar" ? "خاص" : "Private"}>●</span> : null}
                        </span>
                      </span>
                    </Link>
                  ) : (
                    <div className="team-folder-main" aria-label={locale === "ar" ? "مجلد فريق عام" : "Public Team Folder"}>
                      <span className="team-folder-glyph"><FolderGlyph /></span>
                      <span className="team-folder-copy">
                        <span className="team-folder-name"><span className="truncate">{tf.name}</span><span className="text-[10px] text-[color:var(--wd-text-muted,#94a3b8)]">Public</span></span>
                      </span>
                    </div>
                  )}

                  {tf.isMember ? <span className="team-folder-members" aria-label={`${tf.memberCount} ${locale === "ar" ? "عضو" : tf.memberCount === 1 ? "Member" : "Members"}`}>
                    <MembersIcon /><span>{tf.memberCount} {locale === "ar" ? "عضو" : tf.memberCount === 1 ? "Member" : "Members"}</span>
                  </span> : <button type="button" className="team-folder-members" disabled={actionBusy} onClick={() => void join(tf)} title={locale === "ar" ? "الانضمام إلى مجلد الفريق العام" : "Join public Team Folder"}><span className="text-[11px] font-semibold text-blue-600">{locale === "ar" ? "انضمام" : "Join"}</span></button>}

                  <div className="team-folder-row-actions" data-team-folder-menu>
                    <button type="button" className={`team-folder-pin ${pinned ? "is-pinned" : ""}`} aria-pressed={pinned} disabled={actionBusy || !tf.rootFolderId} onClick={(e) => { e.preventDefault(); e.stopPropagation(); void togglePin(tf); }} title={pinned ? (locale === "ar" ? "إلغاء التثبيت" : "Unpin") : (locale === "ar" ? "تثبيت" : "Pin")}>
                      <PinIcon filled={pinned} /><span className="team-folder-pin-label">{pinned ? (locale === "ar" ? "إلغاء التثبيت" : "Unpin") : (locale === "ar" ? "تثبيت" : "Pin")}</span>
                    </button>
                    <div className="relative">
                      <button type="button" data-team-folder-menu-trigger aria-expanded={menuId === tf.id} className="team-folder-more" onClick={(event) => toggleMenu(tf, event)} aria-label={locale === "ar" ? "المزيد" : "More"}><MoreIcon /></button>
                    </div>
                  </div>

                  {detailsTf?.id === tf.id ? (
                    <div className="team-folder-details-card">
                      <div className="flex items-center gap-2 border-b border-slate-100 pb-2"><span className="text-[color:var(--wd-text,#334155)]"><FolderGlyph /></span><strong className="truncate text-[13px]">{tf.name}</strong></div>
                      <div className="grid grid-cols-2 gap-y-2 pt-3 text-[11px] text-[color:var(--wd-text-muted,#64748b)]">
                        <span>{locale === "ar" ? "الدور" : "Role"}</span><span className="text-end text-[color:var(--wd-text,#334155)]">{tf.role}</span>
                        <span>{locale === "ar" ? "الأعضاء" : "Members"}</span><span className="text-end text-[color:var(--wd-text,#334155)]">{tf.memberCount}</span>
                        <span>{locale === "ar" ? "آخر تعديل" : "Modified"}</span><span className="text-end text-[color:var(--wd-text,#334155)]">{tf.updatedAt ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(tf.updatedAt)) : "—"}</span>
                        <span>{locale === "ar" ? "الحجم" : "Size"}</span><span className="text-end text-[color:var(--wd-text,#334155)]">{formatBytes(tf.totalSize ?? 0)}</span>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {renameTarget ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30 px-4" role="dialog" aria-modal="true">
          <div className="w-[min(420px,100%)] rounded-xl border border-[color:var(--wd-line,#e2e8f0)] bg-[var(--wd-bg,#fff)] p-4 shadow-2xl">
            <h2 className="text-sm font-semibold text-slate-800">{locale === "ar" ? "إعادة تسمية مجلد الفريق" : "Rename Team Folder"}</h2>
            <input autoFocus value={renameName} onChange={(e) => setRenameName(e.target.value)} className="imkan-input mt-3 w-full" disabled={actionBusy} onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              const name = renameName.trim();
              if (!name) return;
              setActionBusy(true);
              void renameTeamFolder(renameTarget.id, name).then(() => { setRenameTarget(null); return load(); }).catch((cause) => setError(cause instanceof ApiError ? cause.message : label("error.generic"))).finally(() => setActionBusy(false));
            }} />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="imkan-button-secondary" onClick={() => setRenameTarget(null)} disabled={actionBusy}>{locale === "ar" ? "إلغاء" : "Cancel"}</button>
              <button type="button" className="imkan-button" disabled={actionBusy || !renameName.trim()} onClick={() => {
                const name = renameName.trim();
                if (!name) return;
                setActionBusy(true);
                void renameTeamFolder(renameTarget.id, name).then(() => { setRenameTarget(null); return load(); }).catch((cause) => setError(cause instanceof ApiError ? cause.message : label("error.generic"))).finally(() => setActionBusy(false));
              }}>{actionBusy ? "…" : locale === "ar" ? "حفظ" : "Save"}</button>
            </div>
          </div>
        </div>
      ) : null}

      {menuTf ? (
        <TeamFolderActionMenu open={Boolean(menuId)} anchorEl={menuAnchor} onClose={() => { setMenuId(null); setMenuAnchor(null); }}>
          {!menuTf.isMember && menuTf.isPublicToOrg ? <button type="button" disabled={actionBusy} onClick={() => { setMenuId(null); setMenuAnchor(null); void join(menuTf); }}>{locale === "ar" ? "انضمام" : "Join"}</button> : null}
          <button type="button" onClick={() => { setDetailsTf(menuTf); setMenuId(null); setMenuAnchor(null); }}>{locale === "ar" ? "التفاصيل" : "Details"}</button>
          {menuTf.isMember ? <><button type="button" onClick={() => { setActiveMembersTf(menuTf); setMenuId(null); setMenuAnchor(null); }}>{locale === "ar" ? "الأعضاء" : "Members"}</button><button type="button" onClick={() => openRename(menuTf)}>{label("files.rename")}</button><button type="button" className="danger" onClick={() => remove(menuTf)}>{label("files.delete")}</button></> : null}
        </TeamFolderActionMenu>
      ) : null}

      {activeMembersTf ? <MembersModal teamFolderId={activeMembersTf.id} teamFolderName={activeMembersTf.name} userRole={activeMembersTf.role} onClose={() => setActiveMembersTf(null)} /> : null}
    </section>
  );
}
