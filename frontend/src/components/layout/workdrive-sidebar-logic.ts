import type { MessageKey } from "@/i18n";

export type WorkdriveSidebarItem = {
  href: string;
  key: MessageKey;
  icon: "spark" | "bell" | "clock" | "star" | "tag" | "share" | "inbox" | "layout" | "flow" | "folder";
  active?: boolean;
  spaced?: boolean;
};

/** Zoho WorkDrive left panel: file workspace only — org admin surfaces live in Admin Console. */
export function buildWorkdriveSidebarItems(pathname: string): WorkdriveSidebarItem[] {
  // My Folder active only when browsing a folder path under /files/:id (not reserved sections)
  const myFolderActive =
    pathname.startsWith("/files/") &&
    !pathname.startsWith("/files/recent") &&
    !pathname.startsWith("/files/favorites") &&
    !pathname.startsWith("/files/labels") &&
    !pathname.startsWith("/files/shared-with-me") &&
    !pathname.startsWith("/files/shared-links") &&
    !pathname.startsWith("/files/shared-by-me") &&
    !pathname.startsWith("/files/collections") &&
    !pathname.startsWith("/files/trash") &&
    !pathname.startsWith("/files/team-folders") &&
    !pathname.startsWith("/files/templates") &&
    !pathname.startsWith("/files/workflows") &&
    !pathname.startsWith("/files/activity");

  return [
    { href: "/files", key: "nav.fileSuggestions", icon: "spark", active: pathname === "/files" },
    { href: "/notifications", key: "nav.allUnread", icon: "bell", active: pathname.startsWith("/notifications") },
    { href: "/files/recent", key: "nav.recent", icon: "clock", active: pathname.startsWith("/files/recent") },
    { href: "/files/favorites", key: "nav.favorites", icon: "star", active: pathname.startsWith("/files/favorites") },
    { href: "/files/labels", key: "nav.labels", icon: "tag", active: pathname.startsWith("/files/labels") },
    { href: "/files/shared-with-me", key: "nav.sharedWithMe", icon: "share", active: pathname.startsWith("/files/shared-with-me") },
    { href: "/files/shared-links", key: "nav.sharedLinks", icon: "share", active: pathname.startsWith("/files/shared-links") },
    { href: "/files/collections", key: "nav.collectFiles", icon: "inbox", active: pathname.startsWith("/files/collections") },
    { href: "/files/templates", key: "nav.templates", icon: "layout", active: pathname.startsWith("/files/templates") },
    { href: "/files/workflows", key: "nav.workflows", icon: "flow", active: pathname.startsWith("/files/workflows") },
    { href: "/files", key: "files.breadcrumb.root", icon: "folder", active: myFolderActive, spaced: true },
  ];
}
