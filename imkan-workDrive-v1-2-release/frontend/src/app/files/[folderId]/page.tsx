import { FileBrowser } from "../../../components/file-browser";
import { getFolder } from "../../../lib/api/folders";
import { getCurrentUserTeamFolderRole } from "../../../lib/api/team-folders";
import { isUnauthorizedError, redirectToLoginOnExpiredSession } from "../../../lib/api/client";

export default async function FolderPage({
  params,
}: {
  params: Promise<{ folderId: string }>;
}) {
  const { folderId } = await params;
  try {
    const folder = await getFolder(folderId);
    const teamFolderId = folder?.teamFolderId ?? null;
    const role = teamFolderId ? await getCurrentUserTeamFolderRole(teamFolderId) : undefined;
    return <FileBrowser folderId={folderId} role={role ?? undefined} />;
  } catch (cause) {
    // An expired session during SSR must land on the login screen, not the
    // error boundary; the redirect throws internally on success.
    if (isUnauthorizedError(cause)) {
      await redirectToLoginOnExpiredSession();
    }
    throw cause;
  }
}
