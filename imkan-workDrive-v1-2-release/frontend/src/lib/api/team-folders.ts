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
};

export type TeamFolderListItem = {
  id: string;
  name: string;
  rootFolderId: string | null;
  role: TeamFolderUserRole;
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

export function createTeamFolder(name: string): Promise<TeamFolderRecord> {
  return apiRequest<TeamFolderRecord>("/team-folders", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function listTeamFolders(): Promise<{ teamFolders: TeamFolderListItem[] }> {
  return apiRequest<{ teamFolders: TeamFolderListItem[] }>("/team-folders");
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

export function deleteTeamFolder(id: string): Promise<{ id: string; deleted: boolean }> {
  return apiRequest<{ id: string; deleted: boolean }>(`/team-folders/${id}`, {
    method: "DELETE",
  });
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
