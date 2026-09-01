"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useLocale } from "../../../components/locale-provider";
import { ApiError } from "../../../lib/api/client";
import { createTeamFolder, listTeamFolders, type TeamFolderListItem } from "../../../lib/api/team-folders";
import { formatBytes } from "../../../lib/api/quota";
import { MembersModal } from "../../../components/members-modal";
import { FileTypeIcon } from "../../../components/file-icon";
import { AlertBanner } from "../../../components/alert-banner";
import { EmptyState } from "../../../components/empty-state";
import { SkeletonLoader } from "../../../components/skeleton-loader";
import { errorMessageForStatus } from "../../../components/feedback-state-logic";
import { ActionDropdown } from "../../../components/action-dropdown";

export default function TeamFoldersPage() {
  const { label } = useLocale();
  const [teamFolders, setTeamFolders] = useState<TeamFolderListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newFolderTitle, setNewFolderTitle] = useState("");
  const [activeMembersTf, setActiveMembersTf] = useState<TeamFolderListItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!newFolderTitle.trim()) return;
    try {
      await createTeamFolder(newFolderTitle.trim());
      setNewFolderTitle("");
      await load();
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 401
          ? label("error.unauthenticated")
          : label("error.generic"),
      );
    }
  }

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

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-[length:var(--imkan-font-size-ui)] font-semibold">
          {label("teamFolders.heading")}
        </h1>
        <form onSubmit={onCreate} className="flex items-end gap-2">
          <label className="flex flex-col gap-1 text-[length:var(--imkan-font-size-secondary)]">
            {label("files.folderName")}
            <input
              value={newFolderTitle}
              onChange={(event) => setNewFolderTitle(event.target.value)}
              className="imkan-input"
              placeholder={label("files.newFolderPlaceholder")}
            />
          </label>
          <button type="submit" className="imkan-button">{label("files.createFolder")}</button>
        </form>
      </div>

      {error ? <AlertBanner message={error} action={<button type="button" className="imkan-button-secondary" onClick={() => void load()}>{label("feedback.retry")}</button>} /> : null}

      {loading ? (
        <SkeletonLoader rows={5} columns={5} />
      ) : teamFolders.length === 0 ? (
        <EmptyState title={label("teamFolders.empty")} description={label("teamFolders.emptyDescription")} />
      ) : (
        <div className="relative w-full max-w-full overflow-x-hidden">
          <div className="overflow-x-auto w-full max-w-full">
            <table className="imkan-table min-w-[42rem] w-full table-auto">
              <thead>
                <tr className="imkan-table-row">
                  <th scope="col" className="px-3 py-2 text-start font-medium w-10">
                    <input
                      type="checkbox"
                      className="imkan-checkbox"
                      checked={selectedIds.size === teamFolders.length && teamFolders.length > 0}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                    />
                  </th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{label("files.column.name")}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{label("files.column.owner")}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{label("files.column.modified")}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{label("files.column.size")}</th>
                  <th scope="col" className="px-3 py-2 text-end font-medium"><span className="sr-only">{label("files.actions")}</span></th>
                </tr>
              </thead>
              <tbody>
                {teamFolders.map((tf) => (
                  <tr key={tf.id} className="imkan-table-row hover:bg-[color:var(--imkan-color-surface)] group">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        className="imkan-checkbox"
                        checked={selectedIds.has(tf.id)}
                        onChange={(e) => handleSelectRow(tf.id, e.target.checked)}
                      />
                    </td>
                    <td className="max-w-[18rem] truncate px-3 py-2">
                      <div className="inline-flex max-w-full items-center truncate rounded-sm">
                        <span className="flex-shrink-0 mr-2" aria-hidden="true">
                          <FileTypeIcon kind="folder" size={20} />
                        </span>
                        {tf.rootFolderId ? (
                          <Link href={`/files/${tf.rootFolderId}`} className="font-medium hover:underline truncate">
                            {tf.name}
                          </Link>
                        ) : (
                          <span className="font-medium truncate">{tf.name}</span>
                        )}
                      </div>
                      <span className="ml-2 text-xs text-[color:var(--imkan-color-muted)]">
                        ({label(`teamFolders.role.${tf.role}` as Parameters<typeof label>[0]) ?? tf.role})
                      </span>
                    </td>
                    <td className="imkan-muted px-3 py-2 text-[length:var(--imkan-font-size-secondary)]">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--wd-green) 14%, transparent)", color: "var(--wd-green)" }} aria-hidden="true">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l1.7 2H19a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19H4.5A1.5 1.5 0 0 1 3 17.5Z" /></svg>
                        </span>
                        <span>IMKAN Workspace</span>
                      </div>
                    </td>
                    <td className="imkan-muted px-3 py-2 text-[length:var(--imkan-font-size-secondary)]">
                      {formatDate(tf.updatedAt)}
                    </td>
                    <td className="imkan-muted px-3 py-2 text-[length:var(--imkan-font-size-secondary)]">
                      {formatBytes(tf.totalSize)}
                    </td>
                    <td className="px-3 py-2 text-end">
                      <ActionDropdown
                        label={label("files.actions")}
                        items={[
                          { label: label("nav.files"), onSelect: () => tf.rootFolderId && window.location.assign(`/files/${tf.rootFolderId}`), icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg> },
                          { label: label("teamFolders.members"), onSelect: () => setActiveMembersTf(tf), icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg> },
                          { label: label("files.rename"), onSelect: () => { /* rename logic */ }, icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /><path d="m15 5 4 4" /></svg> },
                          { label: label("files.delete"), onSelect: () => { /* delete logic */ }, destructive: true, icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg> },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
