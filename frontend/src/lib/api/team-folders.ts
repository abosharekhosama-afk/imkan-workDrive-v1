import { apiRequest } from "./client.ts";
import { emitGlobalToast } from "../global-toast";

export type TeamFolderRole = "ADMIN" | "ORGANIZER" | "EDITOR" | "COMMENTER" | "VIEWER";
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
  allowEmailUploads?: boolean;
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
export type TeamFolderGroup = { groupId: string; name: string; description: string | null; memberCount: number; role: TeamFolderRole };

export async function createTeamFolder(name: string, options?: { isPublicToOrg?: boolean }): Promise<TeamFolderRecord> { const result=await apiRequest<TeamFolderRecord>("/team-folders", { method:"POST", body:JSON.stringify(options ? { name, isPublicToOrg: options.isPublicToOrg === true } : { name }) }); emitGlobalToast({message:"Team Folder created",messageAr:"تم إنشاء مجلد الفريق"}); return result; }

export function listTeamFolders(): Promise<{ teamFolders: TeamFolderListItem[] }> {
  return apiRequest<{ teamFolders: TeamFolderListItem[] }>("/team-folders");
}


export function joinTeamFolder(id: string): Promise<{ teamFolderId: string; userId: string; role: TeamFolderRole; joined: boolean; alreadyMember: boolean }> {
  return apiRequest<{ teamFolderId: string; userId: string; role: TeamFolderRole; joined: boolean; alreadyMember: boolean }>(`/team-folders/${id}/join`, { method: 'POST' });
}

export function getTeamFolder(id: string): Promise<TeamFolderRecord> {
  return apiRequest<TeamFolderRecord>(`/team-folders/${id}`);
}

export async function renameTeamFolder(id: string, name: string): Promise<TeamFolderRecord> { const result=await apiRequest<TeamFolderRecord>(`/team-folders/${id}`, { method:"PATCH", body:JSON.stringify({name}) }); emitGlobalToast({message:"Team Folder renamed",messageAr:"تمت إعادة تسمية مجلد الفريق"}); return result; }

export function updateTeamFolderSettings(
  id: string,
  settings: { isPublicToOrg?: boolean; allowExternalSharing?: boolean; allowViewerDownloads?: boolean; allowEmailUploads?: boolean },
): Promise<TeamFolderRecord> {
  return apiRequest<TeamFolderRecord>(`/team-folders/${id}/settings`, { method: "PATCH", body: JSON.stringify(settings) }).then((result) => { emitGlobalToast({message:"Team Folder settings updated",messageAr:"تم تحديث إعدادات مجلد الفريق"}); return result; });
}

export async function deleteTeamFolder(id: string): Promise<{ id: string; deleted: boolean }> { const result=await apiRequest<{ id: string; deleted: boolean }>(`/team-folders/${id}`, { method:"DELETE" }); emitGlobalToast({message:"Team Folder deleted",messageAr:"تم حذف مجلد الفريق"}); return result; }

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

export async function listTeamFolderActivity(id: string): Promise<TeamFolderActivity[]> {
  const raw = await apiRequest<unknown>(`/team-folders/${id}/activity`);
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { data?: unknown })?.data)
      ? (raw as { data: unknown[] }).data
      : [];
  return list.map((row) => {
    const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
    const actor = (r.actor && typeof r.actor === "object" ? r.actor : null) as TeamFolderActivity["actor"];
    const created = r.createdAt ?? r.created_at ?? "";
    return {
      id: String(r.id ?? `${r.resourceId ?? ""}-${created}`),
      action: String(r.action ?? ""),
      resourceType: String(r.resourceType ?? r.resource_type ?? ""),
      resourceId: String(r.resourceId ?? r.resource_id ?? ""),
      actorId: (r.actorId as string | null) ?? (r.actor_id as string | null) ?? null,
      createdAt: typeof created === "string" ? created : created instanceof Date ? created.toISOString() : String(created),
      actor,
      metadata: (r.metadata && typeof r.metadata === "object" ? r.metadata : undefined) as Record<string, unknown> | undefined,
    };
  });
}
export function listTeamFolderTrash(id: string): Promise<TeamFolderTrashItem[]> {
  return apiRequest<TeamFolderTrashItem[]>(`/team-folders/${id}/trash`);
}
export function listTeamFolderShared(id: string): Promise<TeamFolderSharedItem[]> {
  return apiRequest<TeamFolderSharedItem[]>(`/team-folders/${id}/shared`);
}

export function listTeamFolderMembers(id: string): Promise<{ members: TeamFolderMember[]; groups: TeamFolderGroup[] }> {
  return apiRequest<{ members: TeamFolderMember[]; groups: TeamFolderGroup[] }>(`/team-folders/${id}/members`);
}
export function addTeamFolderGroup(id: string, groupId: string, role: TeamFolderRole) { return apiRequest<{ teamFolderId: string; groupId: string; role: TeamFolderRole }>(`/team-folders/${id}/groups`, { method: "POST", body: JSON.stringify({ groupId, role }) }); }
export function updateTeamFolderGroup(id: string, groupId: string, role: TeamFolderRole) { return apiRequest<{ teamFolderId: string; groupId: string; role: TeamFolderRole }>(`/team-folders/${id}/groups/${groupId}`, { method: "PATCH", body: JSON.stringify({ role }) }); }
export function removeTeamFolderGroup(id: string, groupId: string) { return apiRequest<{ teamFolderId: string; groupId: string; removed: boolean }>(`/team-folders/${id}/groups/${groupId}`, { method: "DELETE" }); }

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
  try {
    const folder = await getTeamFolder(teamFolderId);
    return folder.role ?? null;
  } catch {
    return null;
  }
}
