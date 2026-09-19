import { apiRequest } from './client';

export type TemplateLibrary = 'PERSONAL' | 'ORGANIZATION' | 'PUBLIC';
export type TemplateType = 'DOCUMENT' | 'SPREADSHEET' | 'PRESENTATION';

export type TemplateRecord = {
  id: string;
  name: string;
  description: string | null;
  type: TemplateType;
  library: TemplateLibrary;
  category: { id: string; name: string } | null;
  owner: { id: string; name: string | null; email: string } | null;
  version: number;
  size: number;
  mimeType: string | null;
  extension: string | null;
  updatedAt: string;
  canManage: boolean;
  permissions: TemplatePermissions;
};

export type TemplatePermissions = {
  canUse: boolean;
  canDuplicate: boolean;
  canEdit: boolean;
  canCreateVersion: boolean;
  canDelete: boolean;
  canManage: boolean;
  canViewVersions: boolean;
};

export type TemplateLibraryCapabilities = {
  library: TemplateLibrary;
  canManage: boolean;
  canCreate: boolean;
  canCreateCategory: boolean;
  canRenameCategory: boolean;
  canDeleteCategory: boolean;
};

export type TemplatePreview = {
  id: string;
  name: string;
  description: string | null;
  type: TemplateType;
  library: TemplateLibrary;
  category: { id: string; name: string } | null;
  owner: { id: string; name: string | null; email: string } | null;
  version: number;
  mimeType: string | null;
  extension: string | null;
  preview_url: string;
  expires_in_seconds: number;
  permissions: TemplatePermissions;
};

export type TemplateCategory = { id: string; name: string; position: number };

export function listTemplates(params: { library?: TemplateLibrary; categoryId?: string; type?: TemplateType; q?: string; sort?: 'name' | 'name_desc' | 'updated' | 'updated_asc' }) {
  const query = new URLSearchParams();
  if (params.library) query.set('library', params.library);
  if (params.categoryId) query.set('categoryId', params.categoryId);
  if (params.type) query.set('type', params.type);
  if (params.q) query.set('q', params.q);
  if (params.sort) query.set('sort', params.sort);
  return apiRequest<TemplateRecord[]>(`/templates${query.toString() ? `?${query}` : ''}`);
}

export function getTemplate(id: string) { return apiRequest<TemplatePreview>(`/templates/${id}`); }

export function useTemplate(id: string, input: { name: string; folderId?: string | null }) {
  return apiRequest<{ file_id: string; name: string; folder_id: string | null; file_type: string }>(`/templates/${id}/use`, { method: 'POST', body: JSON.stringify(input) });
}

export function saveFileAsTemplate(input: { fileId: string; name: string; description?: string; library?: TemplateLibrary; categoryId?: string | null }) {
  return apiRequest<TemplatePreview>('/templates/from-file', { method: 'POST', body: JSON.stringify(input) });
}

export function getTemplateCapabilities(library: TemplateLibrary) { return apiRequest<TemplateLibraryCapabilities>(`/templates/capabilities?library=${library}`); }
export function listTemplateCategories(library: TemplateLibrary) { return apiRequest<TemplateCategory[]>(`/templates/categories?library=${library}`); }
export function createTemplateCategory(library: TemplateLibrary, name: string) { return apiRequest<TemplateCategory>(`/templates/categories?library=${library}`, { method: 'POST', body: JSON.stringify({ name }) }); }
export function renameTemplateCategory(id: string, name: string) { return apiRequest<TemplateCategory>(`/templates/categories/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }); }
export function deleteTemplateCategory(id: string) { return apiRequest<{ success: boolean }>(`/templates/categories/${id}`, { method: 'DELETE' }); }

export function updateTemplate(id: string, input: { name?: string; description?: string; categoryId?: string | null }) { return apiRequest<TemplatePreview>(`/templates/${id}`, { method: 'PATCH', body: JSON.stringify(input) }); }
export function updateTemplateFromFile(id: string, input: { fileId: string; name: string; description?: string; library?: TemplateLibrary; categoryId?: string | null }) { return apiRequest<TemplatePreview>(`/templates/${id}/from-file`, { method: 'POST', body: JSON.stringify(input) }); }
export function duplicateTemplate(id: string, name?: string) { return apiRequest<TemplatePreview>(`/templates/${id}/duplicate`, { method: 'POST', body: JSON.stringify(name ? { name } : {}) }); }
export function deleteTemplate(id: string) { return apiRequest<{ success: boolean }>(`/templates/${id}`, { method: 'DELETE' }); }


export type TemplateVersion = { id: string; version: number; size: number; mimeType: string; extension: string | null; createdAt: string; createdBy: { id: string; name: string | null; email: string }; preview_url: string; expires_in_seconds: number };
export type TrashedTemplate = { id: string; name: string; description: string | null; type: TemplateType; library: TemplateLibrary; category: { id: string; name: string } | null; version: number; deletedAt: string | null; canManage: boolean };
export function listTemplateVersions(id: string) { return apiRequest<TemplateVersion[]>(`/templates/${id}/versions`); }
export function useTemplateVersion(id: string, versionId: string, input: { name: string; folderId?: string | null }) { return apiRequest<{ file_id: string; name: string; folder_id: string | null; file_type: string }>(`/templates/${id}/versions/${versionId}/use`, { method: 'POST', body: JSON.stringify(input) }); }
export function listTemplateTrash() { return apiRequest<TrashedTemplate[]>('/templates/trash'); }
export function restoreTemplate(id: string) { return apiRequest<{ success: boolean }>(`/templates/${id}/restore`, { method: 'POST' }); }
export function permanentlyDeleteTemplate(id: string) { return apiRequest<{ success: boolean }>(`/templates/${id}/permanent`, { method: 'DELETE' }); }
