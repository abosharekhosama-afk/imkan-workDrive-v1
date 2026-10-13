"use client";

export type WorkdrivePrefs = {
  defaultView: "thumbnail" | "list" | "compact";
  defaultSort: "lastModified" | "name" | "timeCreated";
  sortOrder: "newest" | "az";
  defaultLanding: "suggestions" | "recent" | "favorites" | "myFolders" | "lastOpened";
  teamFolderListing: "all" | "integrated" | "pinned" | "none";
  includeMyFoldersInSuggestions: boolean;
  convertOnUpload: boolean;
  optionalColumns: { lastModified: boolean; timeCreated: boolean; size: boolean; type: boolean; extension: boolean };
  columnOrder: string[];
  notifications: Record<string, { email: boolean; web: boolean; mobile: boolean }>;
};

export const PREFS_KEY = "imkan_workdrive_preferences_v1";
export const PREFS_EVENT = "imkan:preferences-changed";

export const defaultPrefs: WorkdrivePrefs = {
  defaultView: "list",
  defaultSort: "lastModified",
  sortOrder: "newest",
  defaultLanding: "myFolders",
  teamFolderListing: "integrated",
  includeMyFoldersInSuggestions: true,
  convertOnUpload: false,
  optionalColumns: { lastModified: true, timeCreated: false, size: false, type: false, extension: false },
  columnOrder: ["name", "lastModified", "size", "type", "extension", "timeCreated"],
  notifications: {
    mentions: { email: true, web: true, mobile: true },
    sharedWithMe: { email: true, web: true, mobile: true },
    sharedToGroup: { email: true, web: true, mobile: true },
    addedToTeam: { email: false, web: true, mobile: true },
    roleChanges: { email: false, web: true, mobile: true },
    accessRequests: { email: true, web: true, mobile: true },
    newPublicTeam: { email: false, web: true, mobile: true },
  },
};

export function loadPrefs(): WorkdrivePrefs {
  if (typeof window === "undefined") return defaultPrefs;
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return defaultPrefs;
    const parsed = JSON.parse(raw);
    return {
      ...defaultPrefs,
      ...parsed,
      optionalColumns: { ...defaultPrefs.optionalColumns, ...(parsed.optionalColumns || {}) },
      columnOrder: Array.isArray(parsed.columnOrder) ? parsed.columnOrder : defaultPrefs.columnOrder,
    };
  } catch {
    return defaultPrefs;
  }
}

export function savePrefs(next: WorkdrivePrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(PREFS_EVENT, { detail: next }));
  } catch { /* ignore */ }
}

export function patchPrefs(partial: Partial<WorkdrivePrefs>) {
  const current = loadPrefs();
  const next: WorkdrivePrefs = {
    ...current,
    ...partial,
    optionalColumns: partial.optionalColumns
      ? { ...current.optionalColumns, ...partial.optionalColumns }
      : current.optionalColumns,
  };
  savePrefs(next);
  return next;
}
