/**
 * Pure decision logic for row-level file/folder actions menus.
 * Kept framework-free so it can be unit tested directly (node --test).
 */

export type FileActionId =
  | "open"
  | "preview"
  | "details"
  | "download"
  | "versions"
  | "share"
  | "rename"
  | "move"
  | "favorite"
  | "unfavorite"
  | "delete";

export interface RowActionContext {
  resourceType: "FILE" | "FOLDER";
  /** Granted share permission (null/undefined = owner context). */
  permission?: string | null;
  /** Share-level download flag; undefined = allowed. */
  canDownload?: boolean;
  /** Whether the current user may mutate this resource (role/ACL gate). */
  canMutate: boolean;
  /** Whether the share action is offered at all. */
  canShare: boolean;
  /** Whether favorite toggling is offered at all. */
  canFavorite?: boolean;
  isFavorite?: boolean;
}

/** Share permissions that implicitly grant edit rights on the resource. */
export function permissionAllowsEdit(permission?: string | null): boolean {
  if (permission == null) return true; // owner context — gated by canMutate
  return permission === "EDIT" || permission === "FULL_ACCESS" || permission === "ORGANIZE";
}

/**
 * Builds the ordered action list for a row.
 * VIEW-granted rows get open/preview/details (plus download when the share's
 * canDownload flag allows it); edit-capable rows get the full set. The
 * destructive `delete` action is always ordered last.
 */
export function buildFileRowActions(input: RowActionContext): FileActionId[] {
  const grantsEdit = input.canMutate && permissionAllowsEdit(input.permission);
  const ids: FileActionId[] = [];

  if (input.resourceType === "FILE") {
    ids.push("open", "preview", "details");
    if (input.canDownload !== false) ids.push("download");
    ids.push("versions");
  } else {
    ids.push("open");
  }

  if (input.canShare) ids.push("share");
  if (grantsEdit) ids.push("rename", "move");
  if (input.canFavorite) ids.push(input.isFavorite ? "unfavorite" : "favorite");
  if (grantsEdit) ids.push("delete");

  return ids;
}
