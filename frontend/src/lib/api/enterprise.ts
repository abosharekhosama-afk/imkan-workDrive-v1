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

export type SecurityCenter={activeSessions:number;revokedSessions:number;activeDevices:number;events:any[]};
export const getSecurityCenter=()=>apiRequest<SecurityCenter>('/admin/enterprise/security-center');
export const revokeAdminSession=(id:string)=>apiRequest<{ok:boolean}>(`/admin/enterprise/sessions/${id}`,{method:'DELETE'});

export type DlpLabel = { id:string; name:string; description?:string|null; color?:string|null; actions:string[]; manualOnly:boolean; _count?:{files:number} };
export type DlpPolicy = { id:string; name:string; description?:string|null; enabled:boolean; scopeType:string; folderIds:string[]; keywords:string[]; extensions:string[]; caseSensitive:boolean; labelId:string; label?:DlpLabel };
export const getDlpLabels=()=>apiRequest<DlpLabel[]>('/admin/enterprise/dlp/labels');
export const createDlpLabel=(body:any)=>apiRequest<DlpLabel>('/admin/enterprise/dlp/labels',{method:'POST',body:JSON.stringify(body)});
export const deleteDlpLabel=(id:string)=>apiRequest<{ok:boolean}>(`/admin/enterprise/dlp/labels/${id}`,{method:'DELETE'});
export const getDlpPolicies=()=>apiRequest<DlpPolicy[]>('/admin/enterprise/dlp/policies');
export const createDlpPolicy=(body:any)=>apiRequest<DlpPolicy>('/admin/enterprise/dlp/policies',{method:'POST',body:JSON.stringify(body)});
export const updateDlpPolicy=(id:string,body:any)=>apiRequest<DlpPolicy>(`/admin/enterprise/dlp/policies/${id}`,{method:'PATCH',body:JSON.stringify(body)});
export const deleteDlpPolicy=(id:string)=>apiRequest<{ok:boolean}>(`/admin/enterprise/dlp/policies/${id}`,{method:'DELETE'});

export type AdminConsoleSettings = {
  id?: string;
  orgId?: string;
  logoDataUrl?: string | null;
  customDomain?: string | null;
  defaultView: 'THUMBNAIL' | 'LIST' | 'COMPACT';
  thumbnailSize: number;
  previewPanel: 'PREVIEW' | 'DETAILS' | 'COMMENTS' | 'DATA_TEMPLATE';
  convertOnUpload: boolean;
  allowNonZohoWriter: boolean;
  allowNonZohoSheet: boolean;
  allowNonZohoShow: boolean;
  saveNewFilesAsDrafts: boolean;
  ocrLanguage: string;
  allowDirectEmailSharing: boolean;
  directSharingScope: 'ANY_EXTERNAL_USER' | 'SPECIFIC_DOMAINS';
  allowExternalShareLinks: boolean;
  enforceSharePasswords: boolean;
  defaultShareExpiryDays: number | null;
  collectExternalUserInfo: boolean;
  allowDownloadLinks: boolean;
  downloadLinkExpiryDays: number | null;
  allowPermalinkEmbeds: boolean;
  allowEmbedDownloadPrint: boolean;
  allowCollections: boolean;
  collectionManagerScope: 'ANYONE_ON_TEAM' | 'TEAM_ADMINS_ONLY';
  collectionExternalName: 'COLLECTION' | 'TEAM_NAME';
  myFoldersLimitBytes: string | null;
  versionMode: 'ALL' | 'LIMITED';
  versionLimit: number | null;
  publicTeamFolderCreator: 'ANYONE' | 'ADMINS_ONLY';
  privateTeamFolderCreator: 'ANYONE' | 'ADMINS_ONLY';
  sameDomainJoinEnabled: boolean;
};
export const getAdminConsoleSettings = () => apiRequest<AdminConsoleSettings>('/admin/enterprise/settings');
export const updateAdminConsoleSettings = (body: Partial<AdminConsoleSettings>) => apiRequest<AdminConsoleSettings>('/admin/enterprise/settings', { method: 'PATCH', body: JSON.stringify(body) });
