"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "../../../components/locale-provider";
import { ApiError } from "../../../lib/api/client";
import { deleteTeamFolder, listTeamFolders, renameTeamFolder, type TeamFolderListItem } from "../../../lib/api/team-folders";
import { formatBytes } from "../../../lib/api/quota";
import { MembersModal } from "../../../components/members-modal";
import { AlertBanner } from "../../../components/alert-banner";
import { EmptyState } from "../../../components/empty-state";
import { SkeletonLoader } from "../../../components/skeleton-loader";
import { errorMessageForStatus } from "../../../components/feedback-state-logic";

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

function InfoIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 10v6M12 7.5h.01" /></svg>;
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
  const [teamFolders, setTeamFolders] = useState<TeamFolderListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeMembersTf, setActiveMembersTf] = useState<TeamFolderListItem | null>(null);
  const [detailsTf, setDetailsTf] = useState<TeamFolderListItem | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [renameTarget, setRenameTarget] = useState<TeamFolderListItem | null>(null);
  const [renameName, setRenameName] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await listTeamFolders();
      setTeamFolders(res.teamFolders);
    } catch (cause) {
      setError(errorMessageForStatus(cause instanceof ApiError ? cause.status : undefined, {
        unauthenticated: label("error.unauthenticated"), forbidden: label("error.forbidden"), generic: label("error.generic"),
      }));
    } finally {
      setLoading(false);
    }
  }, [label]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener("workdrive:team-folders-changed", refresh);
    return () => window.removeEventListener("workdrive:team-folders-changed", refresh);
  }, [load]);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      if (!event.target.closest("[data-team-folder-menu], [data-team-folder-menu-trigger]")) setMenuId(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const visibleFolders = useMemo(() => {
    const q = search.trim().toLocaleLowerCase();
    return [...teamFolders]
      .filter((tf) => !q || tf.name.toLocaleLowerCase().includes(q))
      .sort((a, b) => Number(pinnedIds.has(b.id)) - Number(pinnedIds.has(a.id)) || a.name.localeCompare(b.name));
  }, [teamFolders, search, pinnedIds]);

  const createHref = "/files/team-folders/create";
  const openRename = (tf: TeamFolderListItem) => { setMenuId(null); setRenameTarget(tf); setRenameName(tf.name); };
  const remove = (tf: TeamFolderListItem) => {
    setMenuId(null);
    void (async () => {
      if (!window.confirm(locale === "ar" ? `هل تريد حذف مجلد الفريق «${tf.name}»؟` : `Delete team folder “${tf.name}”?`)) return;
      setActionBusy(true); setError(null);
      try {
        await deleteTeamFolder(tf.id);
        setPinnedIds((prev) => { const next = new Set(prev); next.delete(tf.id); return next; });
        await load();
      } catch (cause) {
        setError(cause instanceof ApiError ? cause.message : label("error.generic"));
      } finally { setActionBusy(false); }
    })();
  };

  return (
    <section className="flex min-h-full min-w-0 flex-col bg-white">
      <header className="flex min-h-[52px] shrink-0 items-center gap-3 border-b border-slate-100 px-5">
        <span className="flex h-7 w-7 items-center justify-center text-slate-700"><FolderGlyph /></span>
        <h1 className="text-[19px] font-semibold tracking-[-0.02em] text-slate-900">{label("teamFolders.heading")}</h1>
      </header>

      <div className="flex shrink-0 items-center gap-3 border-b border-slate-100 px-5 py-3">
        <button type="button" className="flex h-[35px] items-center gap-2 rounded-[18px] border border-slate-200 bg-white px-3.5 text-[13px] font-medium text-slate-700 shadow-sm hover:bg-slate-50" aria-label={locale === "ar" ? "التصفية" : "Filter"}>
          <FilterIcon />
          <span>{locale === "ar" ? "مشترك" : "Joined"}</span>
          <span className="text-[11px] text-slate-500">⌄</span>
        </button>
        <label className="relative flex h-[35px] w-[285px] max-w-[42vw] items-center">
          <span className="absolute start-3 text-slate-400"><SearchIcon /></span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={label("files.searchPlaceholder")} className="h-full w-full rounded-[18px] border border-slate-200 bg-white ps-9 pe-3 text-[13px] text-slate-700 outline-none placeholder:text-slate-400 focus:border-[color:var(--wd-primary)] focus:ring-2 focus:ring-[color:var(--wd-primary)]/10" />
        </label>
        <div className="ms-auto flex items-center gap-2">
          <Link href={createHref} className="inline-flex h-[35px] items-center gap-1.5 rounded-[18px] bg-[color:var(--wd-primary)] px-4 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[color:var(--wd-primary-dark)]">
            <span className="text-[17px] leading-none">+</span>
            {locale === "ar" ? "إنشاء مجلد فريق" : "Create Team Folder"}
          </Link>
          <button type="button" className="wd-icon-btn" aria-label={locale === "ar" ? "عرض القائمة" : "List view"}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 6h16M4 12h16M4 18h16" /></svg></button>
        </div>
      </div>

      {error ? <AlertBanner message={error} action={<button type="button" className="imkan-button-secondary" onClick={() => void load()}>{label("feedback.retry")}</button>} /> : null}

      {loading ? <SkeletonLoader rows={5} columns={4} /> : visibleFolders.length === 0 ? (
        <EmptyState title={search ? (locale === "ar" ? "لا توجد نتائج" : "No matching Team Folders") : label("teamFolders.empty")} description={search ? undefined : label("teamFolders.emptyDescription")} action={!search ? <Link href={createHref} className="imkan-button">{locale === "ar" ? "إنشاء مجلد فريق" : "Create Team Folder"}</Link> : undefined} />
      ) : (
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="min-w-[760px] px-5">
            <div className="grid grid-cols-[minmax(320px,1fr)_72px_72px_150px_44px] items-center border-b border-slate-100 py-3 text-[12px] font-medium text-slate-500" aria-hidden="true">
              <span>{locale === "ar" ? "الاسم" : "Name"}</span><span /><span /><span>{locale === "ar" ? "الأعضاء" : "Members"}</span><span />
            </div>
            <div>
              {visibleFolders.map((tf) => (
                <div key={tf.id} className="group relative grid min-h-[58px] grid-cols-[minmax(320px,1fr)_72px_72px_150px_44px] items-center border-b border-slate-100 text-[13px] text-slate-700 transition hover:bg-slate-50" data-selected={detailsTf?.id === tf.id || undefined}>
                  <Link href={tf.rootFolderId ? `/files/${tf.rootFolderId}` : createHref} className="flex min-w-0 items-center gap-3 rounded-md py-2 outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--wd-primary)]">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700"><FolderGlyph /></span>
                    <span className="min-w-0">
                      <span className="flex min-w-0 items-center gap-1.5 font-medium text-slate-800"><span className="truncate">{tf.name}</span>{tf.role !== "ORG_ADMIN" ? <span className="shrink-0 text-slate-400" title={tf.role}>{tf.role === "VIEWER" ? "🔒" : ""}</span> : null}</span>
                      <span className="mt-0.5 block truncate text-[11px] text-slate-400">{label(`teamFolders.role.${tf.role}` as Parameters<typeof label>[0]) ?? tf.role}</span>
                    </span>
                  </Link>
                  <button type="button" className="mx-auto flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-800" onClick={() => setDetailsTf(detailsTf?.id === tf.id ? null : tf)} title={locale === "ar" ? "التفاصيل" : "Details"} aria-label={locale === "ar" ? "التفاصيل" : "Details"}><InfoIcon /></button>
                  <button type="button" className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-slate-100 ${pinnedIds.has(tf.id) ? "text-[color:var(--wd-primary)]" : "text-slate-400"}`} onClick={() => setPinnedIds((prev) => { const next = new Set(prev); if (next.has(tf.id)) next.delete(tf.id); else next.add(tf.id); return next; })} title={locale === "ar" ? "تثبيت" : "Pin"} aria-label={locale === "ar" ? "تثبيت" : "Pin"}><PinIcon filled={pinnedIds.has(tf.id)} /></button>
                  <button type="button" className="flex items-center gap-2 rounded-md px-2 py-1 text-start text-slate-600 hover:bg-slate-100" onClick={() => setActiveMembersTf(tf)} title={locale === "ar" ? "إدارة الأعضاء" : "Manage members"}><MembersIcon /><span className="truncate">1 {locale === "ar" ? "عضو" : "Member"}</span></button>
                  <div className="relative flex justify-end" data-team-folder-menu>
                    <button type="button" data-team-folder-menu-trigger aria-expanded={menuId === tf.id} className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 opacity-0 transition hover:bg-slate-100 hover:text-slate-700 group-hover:opacity-100 focus:opacity-100" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuId((id) => id === tf.id ? null : tf.id); }} aria-label={locale === "ar" ? "المزيد" : "More"}><MoreIcon /></button>
                    {menuId === tf.id ? (
                      <div className="absolute end-0 top-9 z-[100] w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_8px_28px_rgba(0,0,0,.12)]" data-team-folder-menu>
                        <button type="button" className="wd-menu-item min-h-[34px] text-start" onClick={() => { setDetailsTf(tf); setMenuId(null); }}>{locale === "ar" ? "التفاصيل" : "Details"}</button>
                        <button type="button" className="wd-menu-item min-h-[34px] text-start" onClick={() => { setActiveMembersTf(tf); setMenuId(null); }}>{locale === "ar" ? "الأعضاء" : "Members"}</button>
                        <button type="button" className="wd-menu-item min-h-[34px] text-start" onClick={() => openRename(tf)}>{label("files.rename")}</button>
                        <button type="button" className="wd-menu-item min-h-[34px] text-start text-red-600 hover:bg-red-50" onClick={() => remove(tf)}>{label("files.delete")}</button>
                      </div>
                    ) : null}
                  </div>
                  {detailsTf?.id === tf.id ? (
                    <div className="absolute end-12 top-12 z-[90] w-[280px] rounded-xl border border-slate-200 bg-white p-3 shadow-[0_8px_28px_rgba(0,0,0,.12)]">
                      <div className="flex items-center gap-2 border-b border-slate-100 pb-2"><span className="text-slate-700"><FolderGlyph /></span><strong className="truncate text-[13px]">{tf.name}</strong></div>
                      <div className="grid grid-cols-2 gap-2 pt-3 text-[11px] text-slate-500"><span>{locale === "ar" ? "الدور" : "Role"}</span><span className="text-end text-slate-700">{tf.role}</span><span>{locale === "ar" ? "آخر تعديل" : "Modified"}</span><span className="text-end text-slate-700">{tf.updatedAt ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(tf.updatedAt)) : "—"}</span><span>{locale === "ar" ? "الحجم" : "Size"}</span><span className="text-end text-slate-700">{formatBytes(tf.totalSize ?? 0)}</span></div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {renameTarget ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30 px-4" role="dialog" aria-modal="true">
          <div className="w-[min(420px,100%)] rounded-xl border border-slate-200 bg-white p-4 shadow-2xl">
            <h2 className="text-sm font-semibold text-slate-800">{locale === "ar" ? "إعادة تسمية مجلد الفريق" : "Rename Team Folder"}</h2>
            <input autoFocus value={renameName} onChange={(e) => setRenameName(e.target.value)} className="imkan-input mt-3 w-full" disabled={actionBusy} onKeyDown={(e) => { if (e.key !== "Enter") return; const name = renameName.trim(); if (!name) return; setActionBusy(true); void renameTeamFolder(renameTarget.id, name).then(() => { setRenameTarget(null); return load(); }).catch((cause) => setError(cause instanceof ApiError ? cause.message : label("error.generic"))).finally(() => setActionBusy(false)); }} />
            <div className="mt-4 flex justify-end gap-2"><button type="button" className="imkan-button-secondary" onClick={() => setRenameTarget(null)} disabled={actionBusy}>{locale === "ar" ? "إلغاء" : "Cancel"}</button><button type="button" className="imkan-button" disabled={actionBusy || !renameName.trim()} onClick={() => { const name = renameName.trim(); if (!name) return; setActionBusy(true); void renameTeamFolder(renameTarget.id, name).then(() => { setRenameTarget(null); return load(); }).catch((cause) => setError(cause instanceof ApiError ? cause.message : label("error.generic"))).finally(() => setActionBusy(false)); }}>{actionBusy ? "…" : locale === "ar" ? "حفظ" : "Save"}</button></div>
          </div>
        </div>
      ) : null}

      {activeMembersTf ? <MembersModal teamFolderId={activeMembersTf.id} teamFolderName={activeMembersTf.name} userRole={activeMembersTf.role} onClose={() => setActiveMembersTf(null)} /> : null}
    </section>
  );
}
