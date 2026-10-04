import { apiRequest } from './client';
import { emitGlobalToast } from '../global-toast';

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
export async function updateSecurityPolicy(body: any) { const result=await apiRequest<any>('/admin/enterprise/security-policy', { method: 'PATCH', body: JSON.stringify(body) }); emitGlobalToast({message:'Security policy updated',messageAr:'تم تحديث سياسة الأمان'}); return result; }
export function getRetentionPolicy() { return apiRequest<any>('/admin/enterprise/retention-policy'); }
export async function updateRetentionPolicy(body: any) { const result=await apiRequest<any>('/admin/enterprise/retention-policy', { method: 'PATCH', body: JSON.stringify(body) }); emitGlobalToast({message:'Retention policy updated',messageAr:'تم تحديث سياسة الاحتفاظ'}); return result; }
export function getEnterpriseAudit(limit = 100) { return apiRequest<any[]>(`/admin/enterprise/audit?limit=${limit}`); }
export function getExternalShares() { return apiRequest<any[]>('/admin/enterprise/external-shares'); }

export type SecurityCenter={activeSessions:number;revokedSessions:number;activeDevices:number;events:any[]};
export const getSecurityCenter=()=>apiRequest<SecurityCenter>('/admin/enterprise/security-center');
export async function revokeAdminSession(id:string){ const result=await apiRequest<{ok:boolean}>(`/admin/enterprise/sessions/${id}`,{method:'DELETE'}); emitGlobalToast({message:'Admin session revoked',messageAr:'تم إلغاء جلسة المسؤول'}); return result; }

export type DlpLabel = { id:string; name:string; description?:string|null; color?:string|null; actions:string[]; manualOnly:boolean; _count?:{files:number} };
export type DlpPolicy = { id:string; name:string; description?:string|null; enabled:boolean; scopeType:string; folderIds:string[]; keywords:string[]; extensions:string[]; sensitiveTypes:string[]; caseSensitive:boolean; labelId:string; label?:DlpLabel; createdAt?:string };
export const getDlpLabels=()=>apiRequest<DlpLabel[]>('/admin/enterprise/dlp/labels');
export async function createDlpLabel(body:any){ const result=await apiRequest<DlpLabel>('/admin/enterprise/dlp/labels',{method:'POST',body:JSON.stringify(body)}); emitGlobalToast({message:'DLP label created',messageAr:'تم إنشاء تصنيف DLP'}); return result; }
export async function updateDlpLabel(id:string,body:any){ const result=await apiRequest<DlpLabel>(`/admin/enterprise/dlp/labels/${id}`,{method:'PATCH',body:JSON.stringify(body)}); emitGlobalToast({message:'DLP label updated',messageAr:'تم تحديث تصنيف DLP'}); return result; }
export async function deleteDlpLabel(id:string){ const result=await apiRequest<{ok:boolean}>(`/admin/enterprise/dlp/labels/${id}`,{method:'DELETE'}); emitGlobalToast({message:'DLP label deleted',messageAr:'تم حذف تصنيف DLP'}); return result; }
export const getDlpLabelFiles=(id:string)=>apiRequest<Array<{id:string;fileId:string;source:string;file:{id:string;name:string;extension:string|null}|null}>>(`/admin/enterprise/dlp/labels/${id}/files`);
export const detachDlpLabelFile=(labelId:string,fileId:string)=>apiRequest<{ok:boolean}>(`/admin/enterprise/dlp/labels/${labelId}/files/${fileId}`,{method:'DELETE'});
export const getDlpPolicies=()=>apiRequest<DlpPolicy[]>('/admin/enterprise/dlp/policies');
export async function createDlpPolicy(body:any){ const result=await apiRequest<DlpPolicy>('/admin/enterprise/dlp/policies',{method:'POST',body:JSON.stringify(body)}); emitGlobalToast({message:'DLP policy created',messageAr:'تم إنشاء سياسة DLP'}); return result; }
export async function updateDlpPolicy(id:string,body:any){ const result=await apiRequest<DlpPolicy>(`/admin/enterprise/dlp/policies/${id}`,{method:'PATCH',body:JSON.stringify(body)}); emitGlobalToast({message:'DLP policy updated',messageAr:'تم تحديث سياسة DLP'}); return result; }
export async function deleteDlpPolicy(id:string){ const result=await apiRequest<{ok:boolean}>(`/admin/enterprise/dlp/policies/${id}`,{method:'DELETE'}); emitGlobalToast({message:'DLP policy deleted',messageAr:'تم حذف سياسة DLP'}); return result; }

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
export type ViewPreferences = Pick<AdminConsoleSettings, 'defaultView' | 'thumbnailSize' | 'previewPanel'>;
export const getViewPreferences = () => apiRequest<ViewPreferences>('/admin/enterprise/view-preferences');
export async function updateAdminConsoleSettings(body: Partial<AdminConsoleSettings>) { const result=await apiRequest<AdminConsoleSettings>('/admin/enterprise/settings', { method: 'PATCH', body: JSON.stringify(body) }); emitGlobalToast({message:'Admin console settings updated',messageAr:'تم تحديث إعدادات لوحة الإدارة'}); return result; }

export type DataAdminItem = {
  id: string;
  kind: 'FILE' | 'FOLDER';
  name: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  size: number | null;
  extension: string | null;
  updatedAt: string;
  deletedAt: string | null;
  versionCount: number | null;
  location: string;
  teamFolderId: string | null;
};
export type DataAdminShare = {
  id: string;
  resourceKind: 'FILE' | 'FOLDER';
  resourceId: string;
  name: string;
  permission: string;
  canDownload: boolean;
  kind: 'team' | 'internet' | 'download';
  recipients: Array<{ id: string; name: string; email: string }>;
  ownerName: string;
  location: string;
  teamFolderId: string | null;
  createdAt: string;
};
export type DataAdminLocations = {
  teamFolders: Array<{ id: string; name: string }>;
  members: Array<{ id: string; name: string; email: string }>;
  trashDays: number;
  largeFileMinBytes: number;
};
export type DataAdminVersion = { id: string; versionNumber: number; size: number; createdAt: string; status: string; latest: boolean };

const dataQuery = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const text = search.toString();
  return text ? `?${text}` : '';
};

export const getDataAdminLocations = () => apiRequest<DataAdminLocations>('/admin/enterprise/data/locations');
export const browseDataAdmin = (params: { scope: string; id?: string; q?: string; deleted?: boolean }) =>
  apiRequest<DataAdminItem[]>(`/admin/enterprise/data/browse${dataQuery({ scope: params.scope, id: params.id, q: params.q, deleted: params.deleted ? '1' : undefined })}`);
export const recordMyFolderAccess = (body: { memberId: string; reason: string }) =>
  apiRequest<{ ok: boolean; memberId: string; emailed: boolean }>('/admin/enterprise/data/my-folder-access', { method: 'POST', body: JSON.stringify(body) });
export const getDataAdminShares = (params: { filter?: string; location?: string; q?: string }) =>
  apiRequest<DataAdminShare[]>(`/admin/enterprise/data/shared${dataQuery(params)}`);
export async function updateDataAdminShare(id: string, body: { kind: 'FILE' | 'FOLDER'; permission: string }) { const result=await apiRequest<{ id: string; permission: string }>(`/admin/enterprise/data/shares/${id}`, { method: 'PATCH', body: JSON.stringify(body) }); emitGlobalToast({message:'Share permission updated',messageAr:'تم تحديث صلاحية المشاركة'}); return result; }
export async function revokeDataAdminShare(id: string, kind: 'FILE' | 'FOLDER') { const result=await apiRequest<{ id: string; revoked: boolean }>(`/admin/enterprise/data/shares/${id}?kind=${kind}`, { method: 'DELETE' }); emitGlobalToast({message:'Share revoked',messageAr:'تم إلغاء المشاركة'}); return result; }
export const shareDataAdminItems = (body: { kind: 'FILE' | 'FOLDER'; ids: string[]; permission: string; recipientUserId?: string; canDownload: boolean }) =>
  apiRequest<{ shared: string[] }>('/admin/enterprise/data/share', { method: 'POST', body: JSON.stringify(body) });
export async function trashDataAdminFiles(ids: string[]) { const result=await apiRequest<{ trashed: string[] }>('/admin/enterprise/data/trash', { method: 'POST', body: JSON.stringify({ ids }) }); emitGlobalToast({message:'Items moved to Trash',messageAr:'تم نقل العناصر إلى سلة المهملات'}); return result; }
export async function restoreDataAdminFiles(ids: string[]) { const result=await apiRequest<{ restored: string[] }>('/admin/enterprise/data/restore', { method: 'POST', body: JSON.stringify({ ids }) }); emitGlobalToast({message:'Items restored',messageAr:'تمت استعادة العناصر'}); return result; }
export async function purgeDataAdminFiles(ids: string[]) { const result=await apiRequest<{ deleted: string[] }>('/admin/enterprise/data/purge', { method: 'POST', body: JSON.stringify({ ids }) }); emitGlobalToast({message:'Items permanently deleted',messageAr:'تم حذف العناصر نهائيًا'}); return result; }
export const transferDataAdminItems = (body: { kind: 'FILE' | 'FOLDER'; ids: string[]; targetUserId: string }) =>
  apiRequest<{ targetUserId: string }>(`/admin/enterprise/data/transfer`, { method: 'POST', body: JSON.stringify(body) });
export const getDataAdminLargeFiles = (q?: string) =>
  apiRequest<DataAdminItem[]>(`/admin/enterprise/data/large${dataQuery({ q })}`);
export const getDataAdminVersions = (fileId: string) =>
  apiRequest<{ file: { id: string; name: string; size: number }; versions: DataAdminVersion[] }>(`/admin/enterprise/data/files/${fileId}/versions`);
export const deleteDataAdminVersion = (fileId: string, versionId: string) =>
  apiRequest<{ id: string; deleted: boolean }>(`/admin/enterprise/data/files/${fileId}/versions/${versionId}`, { method: 'DELETE' });
