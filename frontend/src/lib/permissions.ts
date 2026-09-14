export type UserRole = "ORG_ADMIN" | "ADMIN" | "ORGANIZER" | "EDITOR" | "VIEWER" | string;

export function canMutateContent(role?: UserRole | null, readOnly?: boolean): boolean {
  if (readOnly) return false;
  if (!role) return true; // Personal folders
  return role !== "VIEWER";
}

export function canShareContent(role?: UserRole | null, readOnly?: boolean): boolean {
  if (readOnly) return false;
  if (!role) return true; // Personal folders
  return role !== "VIEWER";
}

export function canManageMembers(role?: UserRole | null, readOnly?: boolean): boolean {
  if (readOnly) return false;
  if (!role) return false; // Personal folders have no members
  return role === "ADMIN" || role === "ORG_ADMIN" || role === "ORGANIZER";
}
