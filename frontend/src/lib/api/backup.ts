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
