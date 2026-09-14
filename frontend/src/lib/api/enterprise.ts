import { apiRequest } from './client';

export type EnterpriseDashboard = {
  storage: { usedBytes: number; files: number };
  users: { active: number; suspended: number };
  externalShares: number;
  largeFiles: Array<{ id: string; name: string; size: string | number; ownerId: string; updatedAt: string }>;
  recentAudit: Array<{ id: string; action: string; resourceType: string; resourceId: string; actorId: string | null; createdAt: string }>;
  controls: string[];
};

export function getEnterpriseDashboard() { return apiRequest<EnterpriseDashboard>('/admin/enterprise/dashboard'); }
export function getGroups() { return apiRequest<any[]>('/admin/enterprise/groups'); }
export function getSecurityPolicy() { return apiRequest<any>('/admin/enterprise/security-policy'); }
export function updateSecurityPolicy(body: any) { return apiRequest<any>('/admin/enterprise/security-policy', { method: 'PATCH', body: JSON.stringify(body) }); }
export function getRetentionPolicy() { return apiRequest<any>('/admin/enterprise/retention-policy'); }
export function updateRetentionPolicy(body: any) { return apiRequest<any>('/admin/enterprise/retention-policy', { method: 'PATCH', body: JSON.stringify(body) }); }
export function getEnterpriseAudit(limit = 100) { return apiRequest<any[]>(`/admin/enterprise/audit?limit=${limit}`); }
export function getExternalShares() { return apiRequest<any[]>('/admin/enterprise/external-shares'); }
