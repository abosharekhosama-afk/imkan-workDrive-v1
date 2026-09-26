import { apiRequest } from './client';

export type AuditScopeMember = { id: string; name: string | null; email: string; status: string };
export type AuditScopeTeamFolder = { id: string; name: string; isPublicToOrg: boolean; archivedAt: string | null };
export type AuditScopes = { members: AuditScopeMember[]; teamFolders: AuditScopeTeamFolder[] };

export type AuditReportCriteria = {
  locationType: 'ORGANIZATION' | 'MY_FOLDERS' | 'TEAM_FOLDER';
  locationId?: string | null;
  actorId?: string | null;
  range: 'TODAY' | 'YESTERDAY' | 'LAST_7_DAYS' | 'LAST_30_DAYS' | 'CUSTOM';
  from?: string;
  to?: string;
  actions: string[];
  limit?: number;
};

export type AuditReportRow = {
  id: string;
  actor: { id: string | null; name: string | null; email: string | null };
  createdAt: string;
  action: string;
  actionLabel: string;
  resourceType: string;
  resourceId: string;
  resourceName: string | null;
  teamFolderName: string | null;
  location: string;
  metadata?: unknown;
};

export type AuditReport = { generatedAt: string; criteria: AuditReportCriteria & { from: string; to: string }; total: number; rows: AuditReportRow[] };

export const getAuditScopes = () => apiRequest<AuditScopes>('/admin/enterprise/audit/scopes');
export const generateAuditReport = (body: AuditReportCriteria) => apiRequest<AuditReport>('/admin/enterprise/audit/reports', { method: 'POST', body: JSON.stringify(body) });
