import { apiRequest } from "./client";

export type BackupScope = "ALL" | "TEAM_FOLDERS" | "MY_FOLDERS" | "SELECTED";
export type BackupScheduleKind = "MANUAL" | "DAILY" | "WEEKLY" | "MONTHLY";
export type BackupRunStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
export type BackupRunKind = "FULL" | "INCREMENTAL";

export type BackupPolicy = {
  id: string;
  orgId: string;
  name: string;
  enabled: boolean;
  scope: BackupScope;
  scopeIds: unknown;
  scheduleKind: BackupScheduleKind;
  scheduleHourUtc: number | null;
  scheduleDay: number | null;
  retentionDays: number | null;
  excludeExtensions: unknown;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BackupRun = {
  id: string;
  orgId: string;
  policyId: string | null;
  kind: BackupRunKind;
  status: BackupRunStatus;
  snapshotAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  filesTotal: number;
  filesCopied: number;
  filesSkipped: number;
  bytesTotal: string | number;
  bytesCopied: string | number;
  errorMessage: string | null;
  manifestSha256: string | null;
  createdAt: string;
  policy?: { id: string; name: string } | null;
  _count?: { objects: number };
};

export type BackupObject = {
  id: string;
  resourceType: string;
  resourceId: string;
  name: string;
  path: string;
  mimeType: string | null;
  size: string | number;
  sha256Hash: string | null;
  createdAt: string;
};

export type BackupOverview = {
  policies: number;
  runs: number;
  lastSuccessfulRun: BackupRun | null;
  activeRun: BackupRun | null;
};

export function getBackupOverview() {
  return apiRequest<BackupOverview>("/backup/overview");
}
export function listBackupPolicies() {
  return apiRequest<BackupPolicy[]>("/backup/policies");
}
export function createBackupPolicy(body: Partial<BackupPolicy> & { name?: string }) {
  return apiRequest<BackupPolicy>("/backup/policies", { method: "POST", body: JSON.stringify(body) });
}
export function updateBackupPolicy(id: string, body: Record<string, unknown>) {
  return apiRequest<BackupPolicy>(`/backup/policies/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}
export function deleteBackupPolicy(id: string) {
  return apiRequest<{ ok: boolean }>(`/backup/policies/${encodeURIComponent(id)}`, { method: "DELETE" });
}
export function listBackupRuns(take = 30) {
  return apiRequest<BackupRun[]>(`/backup/runs?take=${take}`);
}
export function getBackupRun(id: string) {
  return apiRequest<BackupRun>(`/backup/runs/${encodeURIComponent(id)}`);
}
export function listBackupRunObjects(runId: string, q?: string) {
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  return apiRequest<BackupObject[]>(`/backup/runs/${encodeURIComponent(runId)}/objects${qs}`);
}
export function startFullBackup(policyId?: string) {
  return apiRequest<BackupRun>("/backup/runs/full", {
    method: "POST",
    body: JSON.stringify(policyId ? { policyId } : {}),
  });
}

export function startIncrementalBackup(policyId?: string) {
  return apiRequest<BackupRun>("/backup/runs/incremental", {
    method: "POST",
    body: JSON.stringify(policyId ? { policyId } : {}),
  });
}


export type BackupRestoreMode = "ORIGINAL" | "NEW_LOCATION" | "DOWNLOAD";
export type BackupRestoreStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export type BackupRestoreJob = {
  id: string;
  runId: string;
  mode: BackupRestoreMode;
  status: BackupRestoreStatus;
  itemsTotal: number;
  itemsDone: number;
  errorMessage: string | null;
  targetFolderId: string | null;
  createdAt: string;
  finishedAt: string | null;
  run?: { id: string; kind: string; snapshotAt: string; status: string } | null;
};

export function listRestoreJobs(take = 20) {
  return apiRequest<BackupRestoreJob[]>(`/backup/restore-jobs?take=${take}`);
}
export function getRestoreJob(id: string) {
  return apiRequest<BackupRestoreJob>(`/backup/restore-jobs/${encodeURIComponent(id)}`);
}
export function startRestore(body: {
  runId: string;
  mode?: BackupRestoreMode;
  objectIds?: string[];
  targetFolderId?: string | null;
}) {
  return apiRequest<BackupRestoreJob>("/backup/restore", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Parse download metadata stored on completed DOWNLOAD jobs. */
export function parseRestoreDownloadMeta(job: BackupRestoreJob): {
  downloadUrl?: string;
  expiresInSeconds?: number;
  bytes?: number;
} | null {
  if (!job.errorMessage || job.mode !== "DOWNLOAD") return null;
  try {
    const parsed = JSON.parse(job.errorMessage) as Record<string, unknown>;
    if (typeof parsed.downloadUrl === "string") {
      return {
        downloadUrl: parsed.downloadUrl,
        expiresInSeconds: typeof parsed.expiresInSeconds === "number" ? parsed.expiresInSeconds : undefined,
        bytes: typeof parsed.bytes === "number" ? parsed.bytes : undefined,
      };
    }
  } catch {
    /* not JSON */
  }
  return null;
}


export type BackupPurgeStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXECUTED" | "CANCELLED";

export type BackupPurgeRequest = {
  id: string;
  runId: string;
  status: BackupPurgeStatus;
  reason: string;
  requestedById: string;
  approvedById: string | null;
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
  executedAt: string | null;
  run?: {
    id: string;
    kind: string;
    snapshotAt: string;
    locked: boolean;
    immutableUntil: string | null;
    purgedAt: string | null;
    filesCopied: number;
    bytesCopied: string | number;
  } | null;
};

export function listPurgeRequests(take = 30) {
  return apiRequest<BackupPurgeRequest[]>(`/backup/purge-requests?take=${take}`);
}
export function requestPurge(runId: string, reason: string) {
  return apiRequest<BackupPurgeRequest>("/backup/purge-requests", {
    method: "POST",
    body: JSON.stringify({ runId, reason }),
  });
}
export function approvePurge(id: string, decisionNote?: string) {
  return apiRequest<BackupPurgeRequest>(`/backup/purge-requests/${encodeURIComponent(id)}/approve`, {
    method: "POST",
    body: JSON.stringify({ decisionNote }),
  });
}
export function rejectPurge(id: string, decisionNote?: string) {
  return apiRequest<BackupPurgeRequest>(`/backup/purge-requests/${encodeURIComponent(id)}/reject`, {
    method: "POST",
    body: JSON.stringify({ decisionNote }),
  });
}
export function executePurge(id: string) {
  return apiRequest<{ ok: boolean; objectsDeleted: number; runId: string }>(
    `/backup/purge-requests/${encodeURIComponent(id)}/execute`,
    { method: "POST", body: "{}" },
  );
}
