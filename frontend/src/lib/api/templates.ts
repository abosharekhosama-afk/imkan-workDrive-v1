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
  return apiRequest<{ file_id: string; name: string; folder_id: string | null; file_type: string; office?: { documentId: string; type: 'WRITER'|'SHEET'|'SHOW'; nativeFormat: string; revision: number } | null }>(`/templates/${id}/use`, { method: 'POST', body: JSON.stringify(input) });
}


export function createTemplateFromBlank(input: { name: string; description?: string; type: TemplateType; library?: TemplateLibrary; categoryId?: string | null }) {
  return apiRequest<{ template: TemplatePreview; file_id: string }>('/templates/from-blank', { method: 'POST', body: JSON.stringify(input) });
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
export function publishTemplateContent(id: string, input: { fileId: string; versionNote?: string | null }) { return apiRequest<{ templateId: string; templateVersionId: string; version: number; fileId: string; officeDocumentId: string; revision: number; extension: string; mimeType: string; size: number; versionNote: string | null }>(`/templates/${id}/publish-content`, { method: 'POST', body: JSON.stringify(input) }); }
export function duplicateTemplate(id: string, name?: string) { return apiRequest<TemplatePreview>(`/templates/${id}/duplicate`, { method: 'POST', body: JSON.stringify(name ? { name } : {}) }); }
export function deleteTemplate(id: string) { return apiRequest<{ success: boolean }>(`/templates/${id}`, { method: 'DELETE' }); }


export type TemplateVersion = { id: string; version: number; size: number; mimeType: string; extension: string | null; createdAt: string; createdBy: { id: string; name: string | null; email: string }; preview_url: string; expires_in_seconds: number };
export type TrashedTemplate = { id: string; name: string; description: string | null; type: TemplateType; library: TemplateLibrary; category: { id: string; name: string } | null; version: number; deletedAt: string | null; canManage: boolean };
export function listTemplateVersions(id: string) { return apiRequest<TemplateVersion[]>(`/templates/${id}/versions`); }
export type TemplateActivity = { id: string; action: string; createdAt: string; actor: { id: string; name: string | null; email: string } | null; metadata: unknown };
export function listTemplateActivity(id: string, limit = 50) { return apiRequest<TemplateActivity[]>(`/templates/${id}/activity?limit=${Math.min(Math.max(limit, 1), 200)}`); }
export type TemplateVersionComparison = { templateId: string; templateName: string; left: TemplateVersion & { sha256Hash: string }; right: TemplateVersion & { sha256Hash: string }; sameContent: boolean; changes: { sizeDelta: number; mimeChanged: boolean; extensionChanged: boolean; hashChanged: boolean } };
export function compareTemplateVersions(id: string, left: string, right: string) { return apiRequest<TemplateVersionComparison>(`/templates/${id}/versions/compare?left=${encodeURIComponent(left)}&right=${encodeURIComponent(right)}`); }
export function restoreTemplateVersion(id: string, versionId: string) { return apiRequest<{ templateId: string; restoredFromVersionId: string; restoredFromVersion: number; templateVersionId: string; version: number }>(`/templates/${id}/versions/${versionId}/restore`, { method: 'POST' }); }
export function useTemplateVersion(id: string, versionId: string, input: { name: string; folderId?: string | null }) { return apiRequest<{ file_id: string; name: string; folder_id: string | null; file_type: string; office?: { documentId: string; type: 'WRITER'|'SHEET'|'SHOW'; nativeFormat: string; revision: number } | null }>(`/templates/${id}/versions/${versionId}/use`, { method: 'POST', body: JSON.stringify(input) }); }
export function listTemplateTrash() { return apiRequest<TrashedTemplate[]>('/templates/trash'); }
export function restoreTemplate(id: string) { return apiRequest<{ success: boolean }>(`/templates/${id}/restore`, { method: 'POST' }); }
export function permanentlyDeleteTemplate(id: string) { return apiRequest<{ success: boolean }>(`/templates/${id}/permanent`, { method: 'DELETE' }); }


export type TemplateVariableType = 'TEXT'|'NUMBER'|'DATE'|'BOOLEAN'|'EMAIL'|'URL'|'CURRENCY'|'IMAGE'|'USER'|'FILE'|'CHOICE';
export type TemplateVariable = {
  id: string;
  templateId: string;
  name: string;
  label: string;
  type: TemplateVariableType;
  defaultValue: string | null;
  required: boolean;
  description: string | null;
  options?: string[] | null;
  format?: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export function listTemplateVariables(templateId: string) {
  return apiRequest<TemplateVariable[]>(`/templates/${templateId}/variables`);
}
export function createTemplateVariable(templateId: string, input: Omit<TemplateVariable, 'id'|'templateId'|'createdAt'|'updatedAt'>) {
  return apiRequest<TemplateVariable>(`/templates/${templateId}/variables`, { method: 'POST', body: JSON.stringify(input) });
}
export function updateTemplateVariable(templateId: string, variableId: string, input: Omit<TemplateVariable, 'id'|'templateId'|'createdAt'|'updatedAt'>) {
  return apiRequest<TemplateVariable>(`/templates/${templateId}/variables/${variableId}`, { method: 'PATCH', body: JSON.stringify(input) });
}
export function deleteTemplateVariable(templateId: string, variableId: string) {
  return apiRequest<{ success: boolean }>(`/templates/${templateId}/variables/${variableId}`, { method: 'DELETE' });
}

export type TemplateBuilderField = { id: string; kind: string; label: string; variableId?: string | null; sectionId?: string | null; required?: boolean; position?: number; [key: string]: unknown };
export type TemplateBuilderConfig = {
  version: 1;
  fields: TemplateBuilderField[];
  sections: Array<{ id: string; name: string; description?: string; layout?: string; position?: number; [key: string]: unknown }>;
  tables: Array<{ id: string; name: string; columns: Array<{ id: string; label: string; type?: string; variableId?: string | null }>; position?: number; [key: string]: unknown }>;
  images: Array<{ id: string; name: string; sourceType: string; source: string; alt?: string; position?: number; [key: string]: unknown }>;
  branding: { companyName: string; logoFileId: string; primaryColor: string; secondaryColor: string; fontFamily: string; [key: string]: unknown };
  header: { enabled: boolean; content: string; align: string; [key: string]: unknown };
  footer: { enabled: boolean; content: string; align: string; [key: string]: unknown };
  rules: Array<{ id: string; name: string; when: Record<string, unknown>; action: Record<string, unknown>; [key: string]: unknown }>;
  preview: { mode: string; [key: string]: unknown };
};

export type TemplateBuilderState = {
  id: string;
  templateId: string;
  draft: TemplateBuilderConfig;
  published: TemplateBuilderConfig | null;
  publishedAt: string | null;
  publishedBy: { id: string; name: string | null; email: string } | null;
  updatedAt: string;
  canEdit: boolean;
  canPublish: boolean;
};

export function getTemplateBuilder(templateId: string) { return apiRequest<TemplateBuilderState>(`/templates/${templateId}/builder`); }
export function saveTemplateBuilder(templateId: string, config: TemplateBuilderConfig) { return apiRequest<TemplateBuilderState>(`/templates/${templateId}/builder`, { method: 'PUT', body: JSON.stringify(config) }); }
export function publishTemplateBuilder(templateId: string) { return apiRequest<TemplateBuilderState>(`/templates/${templateId}/builder/publish`, { method: 'POST' }); }
export function unpublishTemplateBuilder(templateId: string) { return apiRequest<TemplateBuilderState>(`/templates/${templateId}/builder/unpublish`, { method: 'POST' }); }


export type TemplateAutomationRun = { id: string; status: 'PENDING'|'RUNNING'|'SUCCEEDED'|'FAILED'; name: string; templateId: string; templateVersionId: string | null; fileId: string | null; pdfFileId: string | null; error: string | null; startedAt: string | null; completedAt: string | null; createdAt: string };
export function validateTemplateAutomation(templateId: string, values: Record<string, unknown>) { return apiRequest<{ valid: boolean; templateId: string; templateVersionId: string; templateVersion: number; values: Record<string, unknown>; errors: Array<{ variable: string; message: string }>; variables: Array<{ name: string; label: string; type: string; required: boolean; defaultValue: string | null; options?: unknown }> }>(`/templates/${templateId}/automation/validate`, { method: 'POST', body: JSON.stringify({ values }) }); }
export function runTemplateAutomation(templateId: string, input: { name: string; folderId?: string | null; values: Record<string, unknown>; generatePdf?: boolean; pdfFolderId?: string | null }) { return apiRequest<{ runId: string; templateId: string; templateVersionId: string; fileId: string; name: string; office: { documentId: string; revision: number; type: 'WRITER'|'SHEET'|'SHOW' } | null; pdf: { fileId: string; name: string } | null }>(`/templates/${templateId}/automation/run`, { method: 'POST', body: JSON.stringify(input) }); }
export type TemplateAutomationJob = { id: string; type: 'TEMPLATE_AUTOMATION'; status: 'QUEUED'|'RUNNING'|'SUCCEEDED'|'FAILED'|'DEAD_LETTER'; attempts: number; maxAttempts: number; result: unknown; error: string | null; runAt: string; completedAt: string | null; createdAt: string; updatedAt: string };
export function queueTemplateAutomation(templateId: string, input: { name: string; folderId?: string | null; values: Record<string, unknown>; generatePdf?: boolean; pdfFolderId?: string | null }) { return apiRequest<{ jobId: string; status: TemplateAutomationJob['status']; type: 'TEMPLATE_AUTOMATION'; queuedAt: string }>(`/templates/${templateId}/automation/queue`, { method: 'POST', body: JSON.stringify(input) }); }
export function getTemplateAutomationJob(jobId: string) { return apiRequest<TemplateAutomationJob>(`/templates/automation/jobs/${jobId}`); }
export function listTemplateAutomationRuns(templateId: string, limit = 20) { return apiRequest<TemplateAutomationRun[]>(`/templates/${templateId}/automation/runs?limit=${limit}`); }
export type TemplateCertification = { status: 'CERTIFIED'|'CERTIFIED_WITH_WARNINGS'|'FAILED'; templateId: string; templateVersionId: string; templateVersion: number; templateType: string; extension: string; nativeOfficeType: 'WRITER'|'SHEET'|'SHOW'|null; placeholderCount: number; checks: Array<{ key: string; status: 'PASS'|'WARNING'|'FAIL'; message: string; details?: Record<string, unknown> }>; generatedAt: string };
export function certifyTemplate(templateId: string) { return apiRequest<TemplateCertification>(`/templates/${templateId}/certify`, { method: 'POST', body: JSON.stringify({}) }); }
