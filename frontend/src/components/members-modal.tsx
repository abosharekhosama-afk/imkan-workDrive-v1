"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useLocale } from "./locale-provider";
import { Modal } from "./modal";
import {
  addTeamFolderMember,
  listTeamFolderMembers,
  removeTeamFolderMember,
  type TeamFolderMember,
  type TeamFolderRole,
} from "../lib/api/team-folders";
import { canManageMembers } from "../lib/permissions";
import { ApiError } from "../lib/api/client";

export function MembersModal({
  teamFolderId,
  teamFolderName,
  userRole,
  onClose,
}: {
  teamFolderId: string;
  teamFolderName: string;
  userRole?: string;
  onClose: () => void;
}) {
  const { label } = useLocale();
  const [members, setMembers] = useState<TeamFolderMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [targetUserId, setTargetUserId] = useState("");
  const [targetRole, setTargetRole] = useState<TeamFolderRole>("VIEWER");

  const canManage = canManageMembers(userRole);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await listTeamFolderMembers(teamFolderId);
      setMembers(res.members);
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 401
          ? label("error.unauthenticated")
          : label("error.generic"),
      );
    }
  }, [teamFolderId, label]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onAdd(event: FormEvent) {
    event.preventDefault();
    if (!targetUserId.trim()) return;
    try {
      setError(null);
      await addTeamFolderMember(teamFolderId, targetUserId.trim(), targetRole);
      setTargetUserId("");
      await load();
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 401
          ? label("error.unauthenticated")
          : label("error.generic"),
      );
    }
  }

  async function onRemove(userId: string) {
    try {
      setError(null);
      await removeTeamFolderMember(teamFolderId, userId);
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
    <Modal title={`${label("teamFolders.members.heading")} — ${teamFolderName}`} onClose={onClose}>
      <div className="text-[length:var(--imkan-font-size-ui)]">
        {error ? <p className="mb-3 text-red-500">{error}</p> : null}
        {canManage ? (
          <form onSubmit={onAdd} className="mb-4 flex flex-wrap items-end gap-2">
            <label className="flex flex-1 flex-col gap-1 text-[length:var(--imkan-font-size-secondary)]">
              {label("teamFolders.member.email")}
              <input
                value={targetUserId}
                onChange={(e) => setTargetUserId(e.target.value)}
                placeholder="User UUID"
                className="imkan-input"
              />
            </label>
            <label className="flex flex-col gap-1 text-[length:var(--imkan-font-size-secondary)]">
              {label("teamFolders.member.role")}
              <select
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value as TeamFolderRole)}
                className="border border-[color:var(--imkan-color-muted)] bg-background px-2 py-1"
              >
                <option value="VIEWER">{label("teamFolders.role.VIEWER")}</option>
                <option value="EDITOR">{label("teamFolders.role.EDITOR")}</option>
                <option value="ORGANIZER">{label("teamFolders.role.ORGANIZER")}</option>
                <option value="ADMIN">{label("teamFolders.role.ADMIN")}</option>
              </select>
            </label>
            <button type="submit" className="imkan-button">{label("teamFolders.member.add")}</button>
          </form>
        ) : null}
        {members.length === 0 ? (
          <p className="mb-4 text-[length:var(--imkan-font-size-secondary)] text-[color:var(--imkan-color-muted)]">
            {label("teamFolders.members.empty")}
          </p>
        ) : (
          <ul className="mb-4 divide-y">
            {members.map((m) => (
              <li key={m.userId} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <span className="font-medium">{m.email || m.userId}</span>
                  <span className="ml-2 text-xs text-[color:var(--imkan-color-muted)]">
                    ({label(`teamFolders.role.${m.role}` as Parameters<typeof label>[0]) ?? m.role})
                  </span>
                </div>
                {canManage ? (
                  <button type="button" className="imkan-button-secondary" onClick={() => void onRemove(m.userId)}>
                    {label("teamFolders.member.remove")}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-end">
          <button type="button" className="imkan-button-secondary" onClick={onClose}>{label("share.cancel")}</button>
        </div>
      </div>
    </Modal>
  );
}
