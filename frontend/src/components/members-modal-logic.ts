import type { TeamFolderMember } from "../lib/api/team-folders";

export type OrgMemberOption = {
  userId: string;
  name: string | null;
  email: string;
  avatarUrl?: string | null;
  status?: string;
};

const CODE_TO_MESSAGE_KEY: Record<string, string> = {
  MEMBER_ALREADY_EXISTS: "teamFolders.member.error.MEMBER_ALREADY_EXISTS",
  USER_NOT_FOUND: "teamFolders.member.error.USER_NOT_FOUND",
  USER_NOT_IN_ORGANIZATION: "teamFolders.member.error.USER_NOT_IN_ORGANIZATION",
  INSUFFICIENT_PERMISSIONS: "teamFolders.member.error.INSUFFICIENT_PERMISSIONS",
  ROLE_ASSIGNMENT_FORBIDDEN: "teamFolders.member.error.ROLE_ASSIGNMENT_FORBIDDEN",
  FOLDER_NOT_FOUND: "teamFolders.member.error.FOLDER_NOT_FOUND",
  MEMBER_NOT_FOUND: "teamFolders.member.error.USER_NOT_FOUND",
  LAST_FOLDER_ADMIN: "teamFolders.member.error.LAST_FOLDER_ADMIN",
};

/** Extracts the machine-readable API error code from a thrown value. */
export function apiErrorCode(cause: unknown): string | null {
  if (cause && typeof cause === "object" && "code" in cause) {
    const code = (cause as { code?: unknown }).code;
    if (typeof code === "string" && code.length > 0) return code;
  }
  return null;
}

export function messageKeyForApiCode(code: string | null | undefined): string | null {
  return code ? CODE_TO_MESSAGE_KEY[code] ?? null : null;
}

export function messageKeyForStatus(status: number | undefined): string | null {
  if (status === 401) return "error.unauthenticated";
  if (status === 403) return "error.forbidden";
  return null;
}

/**
 * Resolves the best localized message key for a membership operation failure:
 * structured API codes first, then HTTP status fallbacks.
 */
export function membershipErrorKey(
  status: number | undefined,
  code: string | null | undefined,
): string | null {
  return messageKeyForApiCode(code) ?? messageKeyForStatus(status);
}

/** Active org members who are not yet assigned to the target folder. */
export function availableOrgMembers<T extends OrgMemberOption>(
  orgMembers: T[],
  assigned: readonly Pick<TeamFolderMember, "userId">[],
): T[] {
  const assignedIds = new Set(assigned.map((m) => m.userId));
  return orgMembers.filter(
    (member) =>
      (!member.status || member.status === "ACTIVE") && !assignedIds.has(member.userId),
  );
}

/** Case-insensitive substring search over display name and email. */
export function filterMembersByQuery<T extends OrgMemberOption>(
  options: T[],
  query: string,
): T[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return options;
  return options.filter(
    (member) =>
      (member.name ?? "").toLowerCase().includes(normalized) ||
      member.email.toLowerCase().includes(normalized),
  );
}

/** Display name preference: stored name, else the local part of the email. */
export function displayNameOf(member: { name: string | null; email: string }): string {
  return member.name?.trim() || member.email.split("@")[0];
}

/** Two-character avatar initials for the dropdown list items. */
export function initialsOf(value: string): string {
  const source = value.trim();
  return source ? source.slice(0, 2).toUpperCase() : "?";
}