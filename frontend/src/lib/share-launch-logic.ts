/** How the Share dialog should open (Zoho WorkDrive parity). */
export type ShareLaunchMode = "link" | "invite" | "downloadLink" | "embed";

export function resolveShareLaunch(mode: ShareLaunchMode = "link"): {
  tab: "link" | "invite";
  canDownloadDefault: boolean;
  showEmbedPanel: boolean;
} {
  switch (mode) {
    case "invite":
      return { tab: "invite", canDownloadDefault: true, showEmbedPanel: false };
    case "downloadLink":
      return { tab: "link", canDownloadDefault: true, showEmbedPanel: false };
    case "embed":
      return { tab: "link", canDownloadDefault: false, showEmbedPanel: true };
    default:
      return { tab: "link", canDownloadDefault: true, showEmbedPanel: false };
  }
}

/** Build iframe embed snippet for a public share URL. */
export function buildShareEmbedCode(linkUrl: string, height = 480): string {
  return `<iframe src="${linkUrl.replace(/"/g, "&quot;")}" width="100%" height="${height}" frameborder="0" allowfullscreen></iframe>`;
}
