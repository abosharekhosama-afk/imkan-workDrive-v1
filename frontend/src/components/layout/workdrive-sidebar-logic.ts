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
  const myActive =
    pathname === "/files" ||
    (pathname.startsWith("/files/") &&
      !pathname.startsWith("/files/recent") &&
      !pathname.startsWith("/files/favorites") &&
      !pathname.startsWith("/files/shared-with-me") &&
      !pathname.startsWith("/files/shared-links") &&
      !pathname.startsWith("/files/trash") &&
      !pathname.startsWith("/files/team-folders") &&
      !pathname.startsWith("/files/templates") &&
      !pathname.startsWith("/files/workflows"));

  return [
    { href: "/files", key: "nav.fileSuggestions", icon: "spark" },
    { href: "/notifications", key: "nav.allUnread", icon: "bell" },
    { href: "/files/recent", key: "nav.recent", icon: "clock", active: pathname.startsWith("/files/recent") },
    { href: "/files/favorites", key: "nav.favorites", icon: "star", active: pathname.startsWith("/files/favorites") },
    { href: "/files", key: "nav.labels", icon: "tag" },
    { href: "/files/shared-with-me", key: "nav.sharedWithMe", icon: "share", active: pathname.startsWith("/files/shared-with-me") },
    { href: "/files/shared-links", key: "nav.collectFiles", icon: "inbox", active: pathname.startsWith("/files/shared-links") },
    { href: "/files/templates", key: "nav.templates", icon: "layout", active: pathname.startsWith("/files/templates") },
    { href: "/files/workflows", key: "nav.workflows", icon: "flow", active: pathname.startsWith("/files/workflows") },
    { href: "/files", key: "files.breadcrumb.root", icon: "folder", active: myActive, spaced: true },
  ];
}
