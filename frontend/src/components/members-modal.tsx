"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useLocale } from "./locale-provider";
import { Modal } from "./modal";
import {
  addTeamFolderMember,
  listTeamFolderMembers,
  removeTeamFolderMember,
  updateTeamFolderMember,
  type TeamFolderMember,
  type TeamFolderRole,
} from "../lib/api/team-folders";
import { listOrganizationMembers, type OrgMember } from "../lib/api/organization";
import { canManageMembers } from "../lib/permissions";
import { ApiError } from "../lib/api/client";
import {
  availableOrgMembers,
  displayNameOf,
  filterMembersByQuery,
  initialsOf,
  membershipErrorKey,
} from "./members-modal-logic";

/** Visual role badges (label text is localized separately in the row). */
const ROLE_BADGES: Record<TeamFolderRole, string> = {
  ADMIN: "zoho-role-badge admin",
  ORGANIZER: "zoho-role-badge organizer",
  EDITOR: "zoho-role-badge editor",
  VIEWER: "zoho-role-badge viewer",
};

const ROLE_ORDER: TeamFolderRole[] = ["ADMIN", "ORGANIZER", "EDITOR", "VIEWER"];

/** Display labels are Owner/Admin/Member/Viewer per the Zoho role taxonomy. */
const BADGE_LABEL_KEY: Record<TeamFolderRole, "teamFolders.badge.OWNER" | "teamFolders.badge.ADMIN" | "teamFolders.badge.MEMBER" | "teamFolders.badge.VIEWER"> = {
  ORGANIZER: "teamFolders.badge.OWNER",
  ADMIN: "teamFolders.badge.ADMIN",
  EDITOR: "teamFolders.badge.MEMBER",
  VIEWER: "teamFolders.badge.VIEWER",
};

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
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [loadingOrg, setLoadingOrg] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<OrgMember | null>(null);
  const [targetRole, setTargetRole] = useState<TeamFolderRole>("VIEWER");
  const [pendingRole, setPendingRole] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const canManage = canManageMembers(userRole);

  /** Rich member profiles (name/avatar/status) resolved from org members. */
  const profileIndex = useMemo(() => {
    const index = new Map<string, OrgMember>();
    for (const orgMember of orgMembers) {
      if (orgMember.userId && !index.has(orgMember.userId)) index.set(orgMember.userId, orgMember);
      if (orgMember.id && !index.has(orgMember.id)) index.set(orgMember.id, orgMember);
    }
    return index;
  }, [orgMembers]);

  const reportError = useCallback(
    (cause: unknown) => {
      const status = cause instanceof ApiError ? cause.status : undefined;
      const code = cause instanceof ApiError ? cause.code : undefined;
      const key = membershipErrorKey(status, code);
      setError(key ? label(key as Parameters<typeof label>[0]) : label("error.generic"));
    },
    [label],
  );

  const loadFolderMembers = useCallback(async () => {
    try {
      setError(null);
      const res = await listTeamFolderMembers(teamFolderId);
      setMembers(res.members);
    } catch (cause) {
      reportError(cause);
    }
  }, [teamFolderId, reportError]);

  const loadOrgMembers = useCallback(async () => {
    setLoadingOrg(true);
    try {
      const list = await listOrganizationMembers({ status: "ACTIVE" });
      setOrgMembers(list);
    } catch (cause) {
      reportError(cause);
    } finally {
      setLoadingOrg(false);
    }
  }, [reportError]);

  useEffect(() => {
    void loadFolderMembers();
    void loadOrgMembers();
  }, [loadFolderMembers, loadOrgMembers]);

  useEffect(() => {
    if (!dropdownOpen) return;
    function handlePointer(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setDropdownOpen(false);
    }
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [dropdownOpen]);

  const available = useMemo(
    () => availableOrgMembers(orgMembers, members),
    [orgMembers, members],
  );
  const visibleOptions = useMemo(
    () => filterMembersByQuery(available, query),
    [available, query],
  );

const roleLabel = (role: TeamFolderRole) =>
    label(`teamFolders.role.${role}` as Parameters<typeof label>[0]);

  async function onAdd(event: FormEvent) {
    event.preventDefault();
    if (!selected || submitting) return;
    setError(null);
    setSuccess(null);
    if (members.some((m) => m.userId === selected.userId)) {
      setError(label("teamFolders.member.error.MEMBER_ALREADY_EXISTS"));
      return;
    }
    setSubmitting(true);
    try {
      await addTeamFolderMember(teamFolderId, selected.userId, targetRole);
      setSelected(null);
      setQuery("");
      setDropdownOpen(false);
      setSuccess(label("teamFolders.member.added"));
      await loadFolderMembers();
    } catch (cause) {
      reportError(cause);
    } finally {
      setSubmitting(false);
    }
  }

  async function onRemove(userId: string) {
    setError(null);
    setSuccess(null);
    try {
      await removeTeamFolderMember(teamFolderId, userId);
      await loadFolderMembers();
    } catch (cause) {
      reportError(cause);
    }
  }

  async function onChangeRole(userId: string, role: TeamFolderRole) {
    if (pendingRole) return;
    setError(null);
    setSuccess(null);
    setPendingRole(userId);
    try {
      await updateTeamFolderMember(teamFolderId, userId, role);
      await loadFolderMembers();
    } catch (cause) {
      reportError(cause);
    } finally {
      setPendingRole(null);
    }
  }

return (
    <Modal title={label("teamFolders.members.heading")} onClose={onClose}>
      <div className="text-[length:var(--imkan-font-size-ui)]">
        <header className="zoho-member-head">
          <div className="zoho-member-head-text">
            <h3 className="zoho-member-title">{teamFolderName}</h3>
            <span className="zoho-member-subtitle">{label("teamFolders.members")}</span>
          </div>
          <span className="zoho-member-count">{members.length}</span>
        </header>
        {error ? (
          <p className="zoho-alert-danger mb-3" role="alert">{error}</p>
        ) : null}
        {success && !error ? (
          <p className="zoho-alert-success mb-3" role="status">{success}</p>
        ) : null}
        {canManage ? (
          <form onSubmit={onAdd} className="zoho-member-add mb-4">
            <div ref={containerRef} className="relative flex flex-1 flex-col gap-1 text-[length:var(--imkan-font-size-secondary)]">
              <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={dropdownOpen}
                onClick={() => setDropdownOpen((open) => !open)}
                className="zoho-member-select"
              >
                {selected ? (
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="zoho-member-avatar sm">{initialsOf(displayNameOf(selected))}</span>
                    <span className="truncate">{displayNameOf(selected)}</span>
                    <span className="ms-1 text-[length:var(--imkan-font-size-secondary)] text-[color:var(--imkan-color-muted)]">({selected.email})</span>
                  </span>
                ) : (
                  <span className="text-[color:var(--imkan-color-muted)]">
                    {loadingOrg
                      ? label("teamFolders.member.select.loading")
                      : label("teamFolders.member.select.placeholder")}
                  </span>
                )}
                <span aria-hidden="true">▾</span>
              </button>
              {dropdownOpen ? (
                <div role="listbox" className="zoho-member-dropdown">
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={label("teamFolders.member.select.search")}
                    className="imkan-input mb-1 w-full"
                  />
                  {visibleOptions.map((option) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected?.userId === option.userId}
                      key={option.userId}
                      onClick={() => {
                        setSelected(option);
                        setQuery("");
                        setDropdownOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-start hover:bg-[color:var(--imkan-color-primary)]/5"
                    >
                      <span className="zoho-member-avatar sm">{initialsOf(displayNameOf(option))}</span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{displayNameOf(option)}</span>
                        <span className="block truncate text-xs text-[color:var(--imkan-color-muted)]">{option.email}</span>
                      </span>
                    </button>
                  ))}
                  {visibleOptions.length === 0 ? (
                    <p className="px-2 py-2 text-xs text-[color:var(--imkan-color-muted)]">
                      {loadingOrg
                        ? label("teamFolders.member.select.loading")
                        : available.length === 0 && query.trim() === ""
                          ? label("teamFolders.member.select.allAssigned")
                          : label("teamFolders.member.select.empty")}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
            <label className="flex flex-col gap-1 text-[length:var(--imkan-font-size-secondary)]">
              {label("teamFolders.member.role")}
              <select
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value as TeamFolderRole)}
                className="zoho-role-select"
              >
                {ROLE_ORDER.map((role) => (
                  <option key={role} value={role}>{roleLabel(role)}</option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={!selected || submitting} className="imkan-button disabled:opacity-50">
              {label("teamFolders.member.add")}
            </button>
          </form>
        ) : null}
        {members.length === 0 ? (
          <p className="mb-4 text-[length:var(--imkan-font-size-secondary)] text-[color:var(--imkan-color-muted)]">
            {label("teamFolders.members.empty")}
          </p>
        ) : (
          <ul className="zoho-member-list">
            {members.map((m) => {
              const profile = profileIndex.get(m.userId);
              const displayName = profile?.name || m.email.split("@")[0] || m.userId;
              const status = profile?.status?.toLowerCase() ?? "active";
              return (
                <li key={m.userId} className="zoho-member-row">
                  <span className="zoho-member-avatar-wrap">
                    {profile?.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- org avatars come from storage URLs
                      <img src={profile.avatarUrl} alt="" className="zoho-member-avatar" />
                    ) : (
                      <span className="zoho-member-avatar">{initialsOf(displayName)}</span>
                    )}
                    <span className={`zoho-member-status ${status}`} aria-hidden="true" />
                  </span>
                  <span className="zoho-member-info">
                    <strong>{displayName}</strong>
                    <small>{m.email}</small>
                  </span>
                  {canManage ? (
                    <>
                      <select
                        aria-label={label("teamFolders.members.heading")}
                        value={m.role}
                        disabled={pendingRole === m.userId}
                        onChange={(e) => void onChangeRole(m.userId, e.target.value as TeamFolderRole)}
                        className="zoho-role-select sm"
                      >
                        {ROLE_ORDER.map((role) => (
                          <option key={role} value={role}>{roleLabel(role)}</option>
                        ))}
                      </select>
                      <button type="button" className="zoho-member-remove" onClick={() => void onRemove(m.userId)} disabled={pendingRole === m.userId} aria-label={`${label("teamFolders.member.remove")}: ${displayName}`}>
                        ✕
                      </button>
                    </>
                  ) : (
                    <span className={ROLE_BADGES[m.role]}>{label(BADGE_LABEL_KEY[m.role])}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex justify-end">
          <button type="button" className="imkan-button-secondary" onClick={onClose}>{label("share.cancel")}</button>
        </div>
      </div>
    </Modal>
  );
}