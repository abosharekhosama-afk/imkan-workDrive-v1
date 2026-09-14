import { FileBrowser } from "../../../../components/file-browser";
import { getFolder } from "../../../../lib/api/folders";
import { getCurrentUserTeamFolderRole } from "../../../../lib/api/team-folders";
import { getPreviewUrl } from "../../../../lib/api/preview";

export const dynamic = "force-dynamic";

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ fileId: string }>;
}) {
  const { fileId } = await params;

  const previewUrl = await getPreviewUrl(fileId);

  const folder = await getFolder(fileId);

  const teamFolderId = folder?.teamFolderId ?? null;

  const role = teamFolderId
    ? await getCurrentUserTeamFolderRole(teamFolderId)
    : null;

  return (
    <FileBrowser
      folderId={folder?.id}
      role={role ?? undefined}
    />
  );
}