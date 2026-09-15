import { FileBrowser } from "../../../components/file-browser";
import { getFolder } from "../../../lib/api/folders";
import { getCurrentUserTeamFolderRole } from "../../../lib/api/team-folders";

export default async function FolderPage({
  params,
}: {
  params: Promise<{ folderId: string }>;
}) {
  const { folderId } = await params;
  const folder = await getFolder(folderId);
  const teamFolderId = folder?.teamFolderId ?? null;
  const role = teamFolderId ? await getCurrentUserTeamFolderRole(teamFolderId) : undefined;
  return <FileBrowser folderId={folderId} role={role ?? undefined} />;
}
