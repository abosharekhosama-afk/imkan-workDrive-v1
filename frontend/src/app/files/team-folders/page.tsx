"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "../../../components/locale-provider";
import { ApiError } from "../../../lib/api/client";
import { deleteTeamFolder, listTeamFolders, renameTeamFolder, type TeamFolderListItem } from "../../../lib/api/team-folders";
import { formatBytes } from "../../../lib/api/quota";
import { MembersModal } from "../../../components/members-modal";
import { FileIcon } from "../../../components/file-icon";
import { AlertBanner } from "../../../components/alert-banner";
import { EmptyState } from "../../../components/empty-state";
import { SkeletonLoader } from "../../../components/skeleton-loader";
import { errorMessageForStatus } from "../../../components/feedback-state-logic";
import { ActionDropdown } from "../../../components/action-dropdown";
import { ActionToolbar, type ColumnKey, type SortDir } from "../../../components/layout/action-toolbar";

export default function TeamFoldersPage() {
  const { label, locale } = useLocale();
  const [teamFolders, setTeamFolders] = useState<TeamFolderListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeMembersTf, setActiveMembersTf] = useState<TeamFolderListItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<ColumnKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [renameTarget, setRenameTarget] = useState<TeamFolderListItem | null>(null);
  const [renameName, setRenameName] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  const load = useCallback(async () => {
    await Promise.resolve();
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

  useEffect(() => {
    void load();
  }, [load]);


  const handleSelectRow = (id: string, isSelected: boolean) => {
    const newSelection = new Set(selectedIds);
    if (isSelected) {
      newSelection.add(id);
    } else {
      newSelection.delete(id);
    }
    setSelectedIds(newSelection);
  };

  const handleSelectAll = (isSelected: boolean) => {
    const newSelection = new Set<string>();
    if (isSelected) {
      teamFolders.forEach((tf) => newSelection.add(tf.id));
    }
    setSelectedIds(newSelection);
  };

  const formatDate = (value?: string | null) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value)) : "—";
  const sortedTeamFolders = useMemo(() => {
    const rows = [...teamFolders];
    rows.sort((a, b) => {
      let result = 0;
      if (sortField === "name") result = a.name.localeCompare(b.name);
      else if (sortField === "lastModified") result = Date.parse(a.updatedAt ?? "") - Date.parse(b.updatedAt ?? "");
      else if (sortField === "size") result = (a.totalSize ?? 0) - (b.totalSize ?? 0);
      return sortDir === "asc" ? result : -result;
    });
    return rows;
  }, [teamFolders, sortDir, sortField]);

  const selectedTeamFolder = sortedTeamFolders.find((tf) => selectedIds.has(tf.id));

  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener("workdrive:team-folders-changed", refresh);
    return () => window.removeEventListener("workdrive:team-folders-changed", refresh);
  }, [load]);

  return (
    <section className="min-w-0 w-full">
      <div className="flex min-w-0 flex-col border-b border-slate-100 bg-white">
        <ActionToolbar
          context="teamFolders"
          view="list" onView={() => undefined}
          sortField={sortField} onSortField={setSortField}
          sortDir={sortDir} onSortDir={setSortDir}
          filter="all" onFilter={() => undefined}
          currentFolderId={selectedTeamFolder?.rootFolderId ?? undefined}
          recordDisabled={!selectedTeamFolder?.rootFolderId}
        />
      </div>

      {error ? <AlertBanner message={error} action={<button type="button" className="imkan-button-secondary" onClick={() => void load()}>{label("feedback.retry")}</button>} /> : null}

      {loading ? (
        <SkeletonLoader rows={5} columns={5} />
      ) : teamFolders.length === 0 ? (
        <EmptyState title={label("teamFolders.empty")} description={label("teamFolders.emptyDescription")} />
      ) : (
        <div className="relative w-full max-w-full overflow-x-hidden">
          <div className="overflow-x-auto w-full max-w-full">
            <table className="imkan-table min-w-[48rem] w-full table-auto">
              <thead>
                <tr className="wd-list-head">
                  <th scope="col" className="w-10 ps-[13px] text-start font-medium">
                    <input
                      type="checkbox"
                      className="wd-check"
                      checked={selectedIds.size === teamFolders.length && teamFolders.length > 0}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                    />
                  </th>
                  <th scope="col" className="px-3 text-start font-medium">
                    <button
                      type="button"
                      className="imkan-focusable rounded-[16px] px-3 py-2.5"
                      onClick={() => {
                        setSortField("name");
                        setSortDir((d) => sortField === "name" ? (d === "asc" ? "desc" : "asc") : "asc");
                      }}
                    >
                      {label("files.column.name")} {sortField === "name" ? (sortDir === "asc" ? "↑" : "↓") : "↑"}
                    </button>
                  </th>
                  <th scope="col" className="px-3 text-start font-medium">{label("files.column.owner")}</th>
                  <th scope="col" className="px-3 text-start font-medium">
                    <button
                      type="button"
                      className="imkan-focusable rounded-[16px] px-3 py-2.5"
                      onClick={() => {
                        setSortField("lastModified");
                        setSortDir((d) => sortField === "lastModified" ? (d === "asc" ? "desc" : "asc") : "desc");
                      }}
                    >
                      {label("files.column.modified")} {sortField === "lastModified" ? (sortDir === "asc" ? "↑" : "↓") : "↓"}
                    </button>
                  </th>
                  <th scope="col" className="px-3 text-start font-medium">
                    <button
                      type="button"
                      className="imkan-focusable rounded-[16px] px-3 py-2.5"
                      onClick={() => {
                        setSortField("size");
                        setSortDir((d) => sortField === "size" ? (d === "asc" ? "desc" : "asc") : "desc");
                      }}
                    >
                      {label("files.column.size")} {sortField === "size" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                    </button>
                  </th>
                  <th scope="col" className="px-4 text-end font-medium">
                    <span className="sr-only">{label("files.actions")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedTeamFolders.map((tf) => (
                  <tr
                    key={tf.id}
                    className="wd-list-row group"
                    data-selected={selectedIds.has(tf.id) || undefined}
                    onDoubleClick={() => tf.rootFolderId && window.location.assign(`/files/${tf.rootFolderId}`)}
                  >
                    <td className="ps-[13px]">
                      <input
                        type="checkbox"
                        className="wd-check"
                        checked={selectedIds.has(tf.id)}
                        onChange={(e) => handleSelectRow(tf.id, e.target.checked)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td className="max-w-[18rem] truncate px-2">
                      {tf.rootFolderId ? (
                        <Link
                          href={`/files/${tf.rootFolderId}`}
                          className="imkan-focusable inline-flex max-w-full items-center gap-4 truncate rounded-sm"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <FileIcon kind="folder" label={label("files.type.folder")} />
                          <span className="min-w-0 truncate">
                            <span className="wd-list-name block truncate">{tf.name}</span>
                            <span className="wd-list-meta block truncate">
                              {label(`teamFolders.role.${tf.role}` as Parameters<typeof label>[0]) ?? tf.role}
                            </span>
                          </span>
                        </Link>
                      ) : (
                        <span className="inline-flex max-w-full items-center gap-4 truncate">
                          <FileIcon kind="folder" label={label("files.type.folder")} />
                          <span className="wd-list-name truncate">{tf.name}</span>
                        </span>
                      )}
                    </td>
                    <td className="wd-list-meta whitespace-nowrap px-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                          style={{
                            background: "color-mix(in srgb, var(--wd-primary) 14%, transparent)",
                            color: "var(--wd-primary)",
                          }}
                          aria-hidden="true"
                        >
                          <span className="text-[10px] font-semibold">IM</span>
                        </span>
                        <span className="truncate">IMKAN Workspace</span>
                      </div>
                    </td>
                    <td className="wd-list-meta whitespace-nowrap px-3">{formatDate(tf.updatedAt)}</td>
                    <td className="wd-list-meta whitespace-nowrap px-3">{formatBytes(tf.totalSize)}</td>
                    <td className="px-3 py-2 text-end">
                      <div
                        className="inline-flex"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <ActionDropdown
                          label={label("files.actions")}
                          items={[
                            {
                              label: label("nav.files"),
                              onSelect: () => tf.rootFolderId && window.location.assign(`/files/${tf.rootFolderId}`),
                              icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>,
                            },
                            {
                              label: label("teamFolders.members"),
                              onSelect: () => setActiveMembersTf(tf),
                              icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
                            },
                            {
                              label: label("files.rename"),
                              onSelect: () => { setRenameTarget(tf); setRenameName(tf.name); },
                              icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /><path d="m15 5 4 4" /></svg>,
                            },
                            {
                              label: label("files.delete"),
                              onSelect: () => {
                                void (async () => {
                                  if (!window.confirm(locale === "ar" ? `هل تريد حذف مجلد الفريق «${tf.name}»؟` : `Delete team folder “${tf.name}”?`)) return;
                                  setActionBusy(true);
                                  setError(null);
                                  try {
                                    await deleteTeamFolder(tf.id);
                                    setSelectedIds((prev) => {
                                      const next = new Set(prev);
                                      next.delete(tf.id);
                                      return next;
                                    });
                                    await load();
                                  } catch (cause) {
                                    setError(cause instanceof ApiError ? cause.message : label("error.generic"));
                                  } finally {
                                    setActionBusy(false);
                                  }
                                })();
                              },
                              destructive: true,
                              icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>,
                            },
                          ]}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {renameTarget ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30 px-4" role="dialog" aria-modal="true">
          <div className="w-[min(420px,100%)] rounded-xl border border-slate-200 bg-white p-4 shadow-2xl">
            <h2 className="text-sm font-semibold">{locale === "ar" ? "إعادة تسمية مجلد الفريق" : "Rename team folder"}</h2>
            <input autoFocus value={renameName} onChange={(e) => setRenameName(e.target.value)} className="imkan-input mt-3 w-full" disabled={actionBusy} onKeyDown={(e) => { if (e.key === "Enter") void (async () => { const name = renameName.trim(); if (!name) return; setActionBusy(true); try { await renameTeamFolder(renameTarget.id, name); setRenameTarget(null); await load(); } catch (cause) { setError(cause instanceof ApiError ? cause.message : label("error.generic")); } finally { setActionBusy(false); } })(); }} />
            {error ? <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="imkan-button-secondary" disabled={actionBusy} onClick={() => setRenameTarget(null)}>{locale === "ar" ? "إلغاء" : "Cancel"}</button>
              <button type="button" className="imkan-button" disabled={actionBusy || !renameName.trim()} onClick={() => void (async () => { const name = renameName.trim(); if (!name) return; setActionBusy(true); try { await renameTeamFolder(renameTarget.id, name); setRenameTarget(null); await load(); } catch (cause) { setError(cause instanceof ApiError ? cause.message : label("error.generic")); } finally { setActionBusy(false); } })()}>{actionBusy ? "…" : (locale === "ar" ? "حفظ" : "Save")}</button>
            </div>
          </div>
        </div>
      ) : null}

      {activeMembersTf ? (
        <MembersModal
          teamFolderId={activeMembersTf.id}
          teamFolderName={activeMembersTf.name}
          userRole={activeMembersTf.role}
          onClose={() => setActiveMembersTf(null)}
        />
      ) : null}
    </section>
  );
}
