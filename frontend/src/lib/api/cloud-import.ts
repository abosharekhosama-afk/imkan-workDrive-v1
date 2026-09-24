import { apiRequest } from './client';

export type CloudProvider = 'google' | 'dropbox' | 'onedrive';
export type CloudProviderState = { provider: CloudProvider; connected: boolean; connectionId: string | null; connectionName: string | null; connections?: Array<{ id: string; name: string; updatedAt: string; expiresAt: string | null }>; updatedAt: string | null };
export type CloudRemoteFile = { id: string; name: string; size: number | null; mimeType: string; modifiedAt?: string | null; kind?: 'file' | 'folder' };
export type CloudImportJob = { id: string; provider: CloudProvider; remoteName: string; status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'; progress: number; bytesDone: number; totalBytes: number | null; error: string | null; fileId: string | null; createdAt: string; updatedAt: string };

export const listCloudProviders = () => apiRequest<CloudProviderState[]>('/cloud-import/providers');
export const cloudOAuthStart = (provider: CloudProvider, folderId: string | null, connectionId?: string | null) => { const q = new URLSearchParams(); if (folderId) q.set('folderId', folderId); if (connectionId) q.set('connectionId', connectionId); const suffix = q.toString() ? `?${q}` : ''; return apiRequest<{ url: string }>(`/cloud-import/oauth/${provider}/start${suffix}`); };
export const listCloudFiles = (provider: CloudProvider, connectionId?: string | null) => apiRequest<CloudRemoteFile[]>(`/cloud-import/${provider}/files${connectionId ? `?connectionId=${encodeURIComponent(connectionId)}` : ''}`);
export const createCloudImports = (provider: CloudProvider, folderId: string | null, files: Array<{ id: string; name?: string }>, connectionId?: string | null) => apiRequest<CloudImportJob[]>(`/cloud-import/${provider}/import`, { method: 'POST', body: JSON.stringify({ folderId, files, connectionId: connectionId || null }) });
export const listCloudImportJobs = (ids?: string[]) => apiRequest<CloudImportJob[]>(`/cloud-import/jobs/list${ids?.length ? `?ids=${ids.map(encodeURIComponent).join(',')}` : ''}`);

export const retryCloudImport = (id: string) => apiRequest<CloudImportJob>(`/cloud-import/jobs/${encodeURIComponent(id)}/retry`, { method: 'POST' });
