"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useLocale } from "../../../components/locale-provider";
import { ApiError } from "../../../lib/api/client";
import { createTeamFolder, listTeamFolders, type TeamFolderListItem } from "../../../lib/api/team-folders";
import { MembersModal } from "../../../components/members-modal";
import { AlertBanner } from "../../../components/alert-banner";
import { EmptyState } from "../../../components/empty-state";
import { SkeletonLoader } from "../../../components/skeleton-loader";
import { errorMessageForStatus } from "../../../components/feedback-state-logic";

export default function TeamFoldersPage() {
  const { label } = useLocale();
  const [teamFolders, setTeamFolders] = useState<TeamFolderListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newFolderTitle, setNewFolderTitle] = useState("");
  const [activeMembersTf, setActiveMembersTf] = useState<TeamFolderListItem | null>(null);

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

  return (
    <section>
      <h1 className="mb-2 text-[length:var(--imkan-font-size-ui)] font-semibold">
        {label("teamFolders.heading")}
      </h1>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <form onSubmit={onCreate} className="flex items-end gap-2">
          <label className="flex flex-col gap-1 text-[length:var(--imkan-font-size-secondary)]">
            {label("files.folderName")}
            <input
              value={newFolderTitle}
              onChange={(event) => setNewFolderTitle(event.target.value)}
              className="imkan-input"
            />
          </label>
          <button type="submit" className="imkan-button">{label("files.createFolder")}</button>
        </form>
      </div>
      {error ? <AlertBanner message={error} action={<button type="button" className="imkan-button-secondary" onClick={() => void load()}>{label("feedback.retry")}</button>} /> : null}
      {loading ? <SkeletonLoader rows={3} columns={2} /> : teamFolders.length === 0 ? (
        <EmptyState title={label("teamFolders.empty")} description={label("teamFolders.emptyDescription")} />
      ) : (
        <ul className="divide-y text-[length:var(--imkan-font-size-ui)]">
          {teamFolders.map((tf) => (
            <li key={tf.id} className="flex items-center justify-between gap-3 py-2">
              <div>
                {tf.rootFolderId ? (
                  <Link href={`/files/${tf.rootFolderId}`} className="font-medium hover:underline">
                    {tf.name}
                  </Link>
                ) : (
                  <span className="font-medium">{tf.name}</span>
                )}
                <span className="ml-2 text-xs text-[color:var(--imkan-color-muted)]">
                  ({label(`teamFolders.role.${tf.role}` as Parameters<typeof label>[0]) ?? tf.role})
                </span>
              </div>
              <div className="flex gap-2 text-xs">
                {tf.rootFolderId ? (
                  <Link href={`/files/${tf.rootFolderId}`} className="hover:underline">
                    {label("nav.files")}
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={() => setActiveMembersTf(tf)}
                  className="hover:underline"
                >
                  {label("teamFolders.members")}
                </button>
              </div>
            </li>
          ))}
        </ul>
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
