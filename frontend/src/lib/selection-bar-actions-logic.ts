export type SelectionBarActionKey =
  | "openNewTab"
  | "share"
  | "copyPermalink"
  | "moveTo"
  | "copyTo"
  | "assignWorkflow"
  | "organize"
  | "searchInFold"
  | "download"
  | "rename"
  | "followUpdates"
  | "moreOptions"
  | "moveToTrash";

export type SelectedResource = {
  type: "FILE" | "FOLDER";
  id: string;
  name: string;
};

/** Resolve exactly one selected table row into a typed resource. */
export function resolveSelectedResource(
  selectedIds: Set<string> | Iterable<string>,
  folders: Array<{ id: string; name: string }>,
  files: Array<{ id: string; name: string }>,
): SelectedResource | null {
  const ids = selectedIds instanceof Set ? selectedIds : new Set(selectedIds);
  if (ids.size !== 1) return null;
  const id = Array.from(ids)[0]!;
  const folder = folders.find((row) => row.id === id);
  if (folder) return { type: "FOLDER", id, name: folder.name };
  const file = files.find((row) => row.id === id);
  if (file) return { type: "FILE", id, name: file.name };
  return null;
}

/** Split the current selection into file and folder id lists. */
export function partitionSelection(
  selectedIds: Set<string>,
  folders: Array<{ id: string }>,
  files: Array<{ id: string }>,
): { fileIds: string[]; folderIds: string[] } {
  const fileIds: string[] = [];
  const folderIds: string[] = [];
  for (const id of selectedIds) {
    if (folders.some((folder) => folder.id === id)) folderIds.push(id);
    else if (files.some((file) => file.id === id)) fileIds.push(id);
  }
  return { fileIds, folderIds };
}

/** Open a WorkDrive resource in a new browser tab. */
export function openResourceInNewTab(
  type: "FILE" | "FOLDER",
  id: string,
  origin: string = typeof window !== "undefined" ? window.location.origin : "",
): void {
  const url =
    type === "FOLDER"
      ? `${origin}/files/${encodeURIComponent(id)}`
      : `${origin}/files?openFileId=${encodeURIComponent(id)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}
