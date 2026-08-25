import { apiRequest } from "./client";
import { auditPath } from "./audit-path";

export type AuditActor = {
  id: string;
  name: string | null;
  email: string;
};

export type AuditRecord = {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string;
  actorId: string | null;
  createdAt: string;
  actor?: AuditActor | null;
  metadata?: Record<string, unknown>;
};

export function listAudit(): Promise<AuditRecord[]> {
  return apiRequest<AuditRecord[]>(auditPath());
}

export function formatAuditAction(record: AuditRecord, label: (key: string) => string): string {
  const actorName = record.actor?.name ?? record.actor?.email ?? label("audit.unknownUser");
  const actionMap: Record<string, string> = {
    CREATE: label("audit.action.created"),
    UPDATE: label("audit.action.updated"),
    DELETE: label("audit.action.deleted"),
    RESTORE: label("audit.action.restored"),
    MOVE: label("audit.action.moved"),
    COPY: label("audit.action.copied"),
    DOWNLOAD: label("audit.action.downloaded"),
    PREVIEW: label("audit.action.previewed"),
    SHARE: label("audit.action.shared"),
    UNSHARE: label("audit.action.unshared"),
    COMMENT: label("audit.action.commented"),
    UPLOAD_VERSION: label("audit.action.uploadedVersion"),
    RESTORE_VERSION: label("audit.action.restoredVersion"),
    LOGIN: label("audit.action.loggedIn"),
    LOGOUT: label("audit.action.loggedOut"),
    INVITE: label("audit.action.invited"),
    ACCEPT_INVITATION: label("audit.action.acceptedInvitation"),
    REVOKE_INVITATION: label("audit.action.revokedInvitation"),
    CHANGE_PERMISSION: label("audit.action.changedPermission"),
    FILE_UPLOAD_COMPLETE: label("audit.action.uploaded"),
    FILE_DOWNLOAD: label("audit.action.downloaded"),
    FILE_VERSION_DOWNLOAD: label("audit.action.downloadedVersion"),
    FILE_VERSION_RESTORED: label("audit.action.restoredVersion"),
    FILE_MOVED: label("audit.action.moved"),
    FILE_COPIED: label("audit.action.copied"),
    FILE_RENAMED: label("audit.action.renamed"),
    FILE_TRASHED: label("audit.action.trashed"),
    FILE_RESTORED: label("audit.action.restored"),
    FILE_PERMANENTLY_DELETED: label("audit.action.permanentlyDeleted"),
    TRASH_EMPTIED: label("audit.action.emptiedTrash"),
    FOLDER_MOVED: label("audit.action.movedFolder"),
    FOLDER_COPIED: label("audit.action.copiedFolder"),
    FOLDER_RENAMED: label("audit.action.renamedFolder"),
    FOLDER_DELETED: label("audit.action.deletedFolder"),
    FOLDER_PERMANENTLY_DELETED: label("audit.action.permanentlyDeletedFolder"),
    TEAM_FOLDER_CREATED: label("audit.action.createdTeamFolder"),
    TEAM_FOLDER_RENAMED: label("audit.action.renamedTeamFolder"),
    TEAM_FOLDER_DELETED: label("audit.action.deletedTeamFolder"),
  };
  
  const actionText = actionMap[record.action] ?? record.action;
  const resourceTypeLabel = record.resourceType === "FILE" ? label("audit.resource.file") : record.resourceType === "FOLDER" ? label("audit.resource.folder") : record.resourceType === "TEAM_FOLDER" ? label("audit.resource.teamFolder") : record.resourceType;
  
  const metadata = record.metadata as Record<string, unknown> | undefined;
  let resourceName = "";
  if (metadata?.name) {
    resourceName = String(metadata.name);
  } else if (metadata?.fileName) {
    resourceName = String(metadata.fileName);
  } else if (metadata?.folderName) {
    resourceName = String(metadata.folderName);
  }
  
  let detail = "";
  if (record.action === "MOVE" && metadata?.destinationFolderId) {
    detail = ` ${label("audit.action.to")} ${String(metadata.destinationFolderId)}`;
  } else if (record.action === "SHARE" && metadata?.permission) {
    detail = ` ${label("audit.action.withPermission")} ${String(metadata.permission)}`;
  }
  
  return `${actorName} ${actionText} ${resourceTypeLabel}${resourceName ? ` "${resourceName}"` : ""}${detail}`;
}
