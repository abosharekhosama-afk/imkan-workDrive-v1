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
  type TeamFolderMember,
  type TeamFolderRole,
} from "../lib/api/team-folders";
import {
  listOrganizationMembers,
  type OrgMember,
} from "../lib/api/organization";
import { canManageMembers } from "../lib/permissions";
import { ApiError } from "../lib/api/client";
import {
  availableOrgMembers,
  displayNameOf,
  filterMembersByQuery,
  initialsOf,
  membershipErrorKey,
} from "./members-modal-logic";

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
  const containerRef = useRef<HTMLDivElement | null>(null);

  const canManage = canManageMembers(userRole);

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

  return (
    <Modal title={`${label("teamFolders.members.heading")} — ${teamFolderName}`} onClose={onClose}>
      <div className="text-[length:var(--imkan-font-size-ui)]">
        {error ? <p className="mb-3 text-red-500">{error}</p> : null}
        {success && !error ? (
          <p className="mb-3 text-green-600">{success}</p>
        ) : null}
        {canManage ? (
          <form onSubmit={onAdd} className="mb-4 flex flex-wrap items-end gap-2">
            <div ref={containerRef} className="relative flex flex-1 flex-col gap-1 text-[length:var(--imkan-font-size-secondary)]">
              <span>{label("teamFolders.member.select.label")}</span>
              <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={dropdownOpen}
                onClick={() => setDropdownOpen((open) => !open)}
                className="imkan-input flex items-center justify-between text-start"
              >
                {selected ? (
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[color:var(--imkan-color-primary)]/10 text-xs font-medium text-[color:var(--imkan-color-primary)]">
                      {initialsOf(displayNameOf(selected))}
                    </span>
                    <span className="truncate">
                      {displayNameOf(selected)}
                      <span className="ms-1 text-[length:var(--imkan-font-size-secondary)] text-[color:var(--imkan-color-muted)]">
                        ({selected.email})
                      </span>
                    </span>
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
                <div
                  role="listbox"
                  className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded border border-[color:var(--imkan-color-muted)] bg-background p-1 shadow-lg"
                >
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
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--imkan-color-primary)]/10 text-xs font-medium text-[color:var(--imkan-color-primary)]">
                        {initialsOf(displayNameOf(option))}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{displayNameOf(option)}</span>
                        <span className="block truncate text-xs text-[color:var(--imkan-color-muted)]">
                          {option.email}
                        </span>
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
                className="border border-[color:var(--imkan-color-muted)] bg-background px-2 py-1"
              >
                <option value="VIEWER">{label("teamFolders.role.VIEWER")}</option>
                <option value="EDITOR">{label("teamFolders.role.EDITOR")}</option>
                <option value="ORGANIZER">{label("teamFolders.role.ORGANIZER")}</option>
                <option value="ADMIN">{label("teamFolders.role.ADMIN")}</option>
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
