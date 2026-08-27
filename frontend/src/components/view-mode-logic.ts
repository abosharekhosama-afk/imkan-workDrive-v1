/** View mode preference for the dual file browser (list/table vs grid). */
export type ViewMode = "list" | "grid";

export const VIEW_MODE_STORAGE_KEY = "workdrive_view_mode";

export function isViewMode(value: unknown): value is ViewMode {
  return value === "list" || value === "grid";
}

export function sanitizeViewMode(value: unknown): ViewMode {
  return isViewMode(value) ? value : "list";
}

export function readStoredViewMode(storage: Pick<Storage, "getItem"> | null | undefined): ViewMode {
  if (!storage) return "list";
  try {
    return sanitizeViewMode(storage.getItem(VIEW_MODE_STORAGE_KEY));
  } catch {
    return "list";
  }
}

export function persistViewMode(storage: Pick<Storage, "setItem"> | null | undefined, mode: ViewMode): void {
  if (!storage) return;
  try {
    storage.setItem(VIEW_MODE_STORAGE_KEY, mode);
  } catch {
    // Storage unavailable (private mode / SSR) — preference stays in-memory only.
  }
}

/** Sidebar sections required by the enterprise shell spec. */
export const SIDEBAR_SECTIONS = [
  { key: "myFolder", href: "/files", match: (path: string) => path === "/files" || path.startsWith("/files/folder/") },
  { key: "teamFolders", href: "/files/team-folders", match: (path: string) => path.startsWith("/files/team-folders") },
  { key: "sharedWithMe", href: "/files/shared-with-me", match: (path: string) => path.startsWith("/files/shared-with-me") },
  { key: "trash", href: "/files/trash", match: (path: string) => path.startsWith("/files/trash") },
] as const;

export type SidebarSectionKey = (typeof SIDEBAR_SECTIONS)[number]["key"];

export function activeSidebarSection(pathname: string): SidebarSectionKey {
  for (const section of [...SIDEBAR_SECTIONS].sort((a, b) => b.href.length - a.href.length)) {
    if (section.match(pathname)) return section.key;
  }
  return "myFolder";
}

/**
 * Debounce helper for instant-search: returns a cancelable timer handle so the
 * global search box fires one request per pause in typing.
 */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, waitMs: number): ((...args: A) => void) & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const wrapped = (...args: A): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, waitMs);
  };
  wrapped.cancel = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return wrapped;
}

/** BroadcastChannel channel name used to sync org switches across tabs. */
export const ORG_SYNC_CHANNEL = "workdrive-org-switch";

export type OrgSwitchMessage = { type: "org-switched"; organizationId: string };

export function parseOrgSwitchMessage(data: unknown): OrgSwitchMessage | null {
  if (typeof data !== "object" || data === null) return null;
  const candidate = data as { type?: unknown; organizationId?: unknown };
  if (candidate.type !== "org-switched") return null;
  if (typeof candidate.organizationId !== "string" || candidate.organizationId.length === 0) return null;
  return { type: "org-switched", organizationId: candidate.organizationId };
}
