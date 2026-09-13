export const WORKSPACE_HREFS = {
  files: "/files",
  teamFolders: "/files/team-folders",
  trash: "/files/trash",
  activity: "/files/activity",
  recent: "/files/recent",
  publicShare: "/share/public",
  sharedWithMe: "/files/shared-with-me",
  sharedByMe: "/files/shared-by-me",
  favorites: "/files/favorites",
} as const;

export type WorkspaceHref = (typeof WORKSPACE_HREFS)[keyof typeof WORKSPACE_HREFS];

export function workspaceNavItems(): Array<{
  href: string;
  labelKey: "nav.files" | "nav.teamFolders" | "nav.recent" | "files.trash" | "audit.heading" | "nav.sharedWithMe" | "nav.sharedByMe" | "nav.favorites";
}> {
  return [
    { href: WORKSPACE_HREFS.files, labelKey: "nav.files" },
    { href: WORKSPACE_HREFS.recent, labelKey: "nav.recent" },
    { href: WORKSPACE_HREFS.teamFolders, labelKey: "nav.teamFolders" },
    { href: WORKSPACE_HREFS.sharedWithMe, labelKey: "nav.sharedWithMe" },
    { href: WORKSPACE_HREFS.sharedByMe, labelKey: "nav.sharedByMe" },
    { href: WORKSPACE_HREFS.favorites, labelKey: "nav.favorites" },
    { href: WORKSPACE_HREFS.trash, labelKey: "files.trash" },
    { href: WORKSPACE_HREFS.activity, labelKey: "audit.heading" },
  ];
}

export function isWorkspaceHref(pathname: string, href: string): boolean {
  if (href === WORKSPACE_HREFS.files) {
    return (
      pathname === "/files" ||
      (pathname.startsWith("/files/") &&
        pathname !== "/files/trash" &&
        pathname !== "/files/activity" &&
        !pathname.startsWith("/files/team-folders"))
    );
  }
  if (href === WORKSPACE_HREFS.teamFolders) {
    return pathname === "/files/team-folders" || pathname.startsWith("/files/team-folders/");
  }
  return pathname === href;
}
