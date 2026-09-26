import { apiRequest } from "./client.ts";
import { getCurrentUserId } from "./jwt.ts";

export type TeamFolderRole = "ADMIN" | "ORGANIZER" | "EDITOR" | "VIEWER";
export type TeamFolderUserRole = TeamFolderRole | "ORG_ADMIN";

export type TeamFolderRecord = {
  id: string;
  orgId?: string;
  name: string;
  rootFolderId: string | null;
  role?: TeamFolderUserRole;
  isPublicToOrg?: boolean;
  allowExternalSharing?: boolean;
  allowViewerDownloads?: boolean;
  memberCount?: number;
  updatedAt?: string | null;
  totalSize?: number | null;
};

export type TeamFolderListItem = {
  id: string;
  name: string;
  rootFolderId: string | null;
  role: TeamFolderUserRole | null;
  memberCount: number;
  isMember: boolean;
  isPublicToOrg: boolean;
  /** Latest activity across the folder tree (folders + active files). */
  updatedAt?: string | null;
  /** Summed byte size of active files in the folder tree. */
  totalSize?: number | null;
};

export type TeamFolderMember = {
  userId: string;
  email: string;
  role: TeamFolderRole;
};

export function createTeamFolder(name: string, options?: { isPublicToOrg?: boolean }): Promise<TeamFolderRecord> {
  return apiRequest<TeamFolderRecord>("/team-folders", {
    method: "POST",
    body: JSON.stringify(options ? { name, isPublicToOrg: options.isPublicToOrg === true } : { name }),
  });
}

export function listTeamFolders(): Promise<{ teamFolders: TeamFolderListItem[] }> {
  return apiRequest<{ teamFolders: TeamFolderListItem[] }>("/team-folders");
}


export function joinTeamFolder(id: string): Promise<{ teamFolderId: string; userId: string; role: TeamFolderRole; joined: boolean; alreadyMember: boolean }> {
  return apiRequest<{ teamFolderId: string; userId: string; role: TeamFolderRole; joined: boolean; alreadyMember: boolean }>(`/team-folders/${id}/join`, { method: 'POST' });
}

export function getTeamFolder(id: string): Promise<TeamFolderRecord> {
  return apiRequest<TeamFolderRecord>(`/team-folders/${id}`);
}

export function renameTeamFolder(id: string, name: string): Promise<TeamFolderRecord> {
  return apiRequest<TeamFolderRecord>(`/team-folders/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export function updateTeamFolderSettings(
  id: string,
  settings: { isPublicToOrg?: boolean; allowExternalSharing?: boolean; allowViewerDownloads?: boolean },
): Promise<TeamFolderRecord> {
  return apiRequest<TeamFolderRecord>(`/team-folders/${id}/settings`, {
    method: "PATCH",
    body: JSON.stringify(settings),
  });
}

export function deleteTeamFolder(id: string): Promise<{ id: string; deleted: boolean }> {
  return apiRequest<{ id: string; deleted: boolean }>(`/team-folders/${id}`, {
    method: "DELETE",
  });
}

export type TeamFolderActivity = {
  id: string; action: string; resourceType: string; resourceId: string; actorId: string | null; createdAt: string;
  actor?: { id: string; name: string | null; email: string } | null; metadata?: Record<string, unknown>;
};
export type TeamFolderTrashItem = {
  id: string; fileId: string | null; folderId: string | null; deletedAt: string; expiresAt: string;
  file?: { id: string; name: string; size: number; mimeType: string | null } | null;
  folder?: { id: string; name: string } | null;
};
export type TeamFolderSharedItem = {
  id: string; resourceType: "FILE" | "FOLDER"; resourceId: string; name: string; mimeType?: string | null; size?: number; permission: string; canDownload: boolean; expiresAt: string | null; createdAt: string;
  recipients: Array<{ id: string; name: string | null; email: string }>;
};

export function listTeamFolderActivity(id: string): Promise<TeamFolderActivity[]> {
  return apiRequest<TeamFolderActivity[]>(`/team-folders/${id}/activity`);
}
export function listTeamFolderTrash(id: string): Promise<TeamFolderTrashItem[]> {
  return apiRequest<TeamFolderTrashItem[]>(`/team-folders/${id}/trash`);
}
export function listTeamFolderShared(id: string): Promise<TeamFolderSharedItem[]> {
  return apiRequest<TeamFolderSharedItem[]>(`/team-folders/${id}/shared`);
}

export function listTeamFolderMembers(id: string): Promise<{ members: TeamFolderMember[] }> {
  return apiRequest<{ members: TeamFolderMember[] }>(`/team-folders/${id}/members`);
}

export function addTeamFolderMember(
  id: string,
  userId: string,
  role: TeamFolderRole,
): Promise<{ teamFolderId: string; userId: string; role: TeamFolderRole }> {
  return apiRequest<{ teamFolderId: string; userId: string; role: TeamFolderRole }>(
    `/team-folders/${id}/members`,
    {
      method: "POST",
      body: JSON.stringify({ userId, role }),
    },
  );
}

export function updateTeamFolderMember(
  id: string,
  userId: string,
  role: TeamFolderRole,
): Promise<{ teamFolderId: string; userId: string; role: TeamFolderRole }> {
  return apiRequest<{ teamFolderId: string; userId: string; role: TeamFolderRole }>(
    `/team-folders/${id}/members/${userId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ role }),
    },
  );
}

export function removeTeamFolderMember(
  id: string,
  userId: string,
): Promise<{ teamFolderId: string; userId: string; deleted: boolean }> {
  return apiRequest<{ teamFolderId: string; userId: string; deleted: boolean }>(
    `/team-folders/${id}/members/${userId}`,
    {
      method: "DELETE",
    },
  );
}

export async function getCurrentUserTeamFolderRole(teamFolderId: string): Promise<TeamFolderUserRole | null> {
  const userId = getCurrentUserId();
  if (!userId) return null;
  try {
    const { members } = await listTeamFolderMembers(teamFolderId);
    const membership = members.find((m) => m.userId === userId);
    return membership?.role ?? null;
  } catch {
    return null;
  }
}
