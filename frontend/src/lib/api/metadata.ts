import { apiRequest } from "./client";

export type DataTemplateField = { key: string; label: string; type: "text"|"multiline"|"email"|"number"|"date"|"datetime"|"boolean"|"select"|"radio"; required?: boolean; searchable?: boolean; options?: string[]; description?: string };
export type DataTemplate = {
  id: string; name: string; description?: string | null; schema: DataTemplateField[]; fields?: DataTemplateField[];
  requiredFields?: string[]; active: boolean; associationScope: "ALL_EDIT"|"SPECIFIC";
  allowedMemberIds?: string[]; allowedGroupIds?: string[]; searchableFieldKeys?: string[];
  fieldCount?: number; searchableFieldCount?: number; associationCount?: number;
};
export type DataTemplateBinding = { id: string; templateId: string; fileId?: string | null; folderId?: string | null; customFields?: Record<string, unknown> | null; template: DataTemplate };

export function listDataTemplates(includeDisabled = true) { return apiRequest<DataTemplate[]>(`/metadata/templates${includeDisabled ? "?includeDisabled=true" : ""}`); }
export function getDataTemplate(id: string) { return apiRequest<DataTemplate>(`/metadata/templates/${encodeURIComponent(id)}`); }
export function createDataTemplate(body: { name: string; description?: string; schema: DataTemplateField[]; associationScope?: "ALL_EDIT"|"SPECIFIC"; allowedMemberIds?: string[]; allowedGroupIds?: string[] }) { return apiRequest<DataTemplate>("/metadata/templates", { method: "POST", body: JSON.stringify(body) }); }
export function updateDataTemplate(id: string, body: Partial<Parameters<typeof createDataTemplate>[0]> & { active?: boolean }) { return apiRequest<DataTemplate>(`/metadata/templates/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) }); }
export function deleteDataTemplate(id: string) { return apiRequest<{ id: string; deleted: boolean }>(`/metadata/templates/${encodeURIComponent(id)}`, { method: "DELETE" }); }
export function listFileDataTemplateBindings(fileId: string) { return apiRequest<DataTemplateBinding[]>(`/metadata/files/${encodeURIComponent(fileId)}/associations`); }
export function associateFileDataTemplate(fileId: string, templateId: string, customFields: Record<string, unknown>) { return apiRequest<DataTemplateBinding>(`/metadata/files/${encodeURIComponent(fileId)}/associations`, { method: "POST", body: JSON.stringify({ templateId, customFields }) }); }
export function updateFileDataTemplateBinding(fileId: string, templateId: string, customFields: Record<string, unknown>) { return apiRequest<DataTemplateBinding>(`/metadata/files/${encodeURIComponent(fileId)}/associations/${encodeURIComponent(templateId)}`, { method: "PATCH", body: JSON.stringify({ customFields }) }); }
export function disassociateFileDataTemplate(fileId: string, templateId: string) { return apiRequest(`/metadata/files/${encodeURIComponent(fileId)}/associations/${encodeURIComponent(templateId)}`, { method: "DELETE" }); }
export function listFolderDataTemplateBindings(folderId: string) { return apiRequest<DataTemplateBinding[]>(`/metadata/folders/${encodeURIComponent(folderId)}/associations`); }
export function associateFolderDataTemplate(folderId: string, templateId: string, customFields: Record<string, unknown>) { return apiRequest<DataTemplateBinding>(`/metadata/folders/${encodeURIComponent(folderId)}/associations`, { method: "POST", body: JSON.stringify({ templateId, customFields }) }); }
export function updateFolderDataTemplateBinding(folderId: string, templateId: string, customFields: Record<string, unknown>) { return apiRequest<DataTemplateBinding>(`/metadata/folders/${encodeURIComponent(folderId)}/associations/${encodeURIComponent(templateId)}`, { method: "PATCH", body: JSON.stringify({ customFields }) }); }
export function disassociateFolderDataTemplate(folderId: string, templateId: string) { return apiRequest(`/metadata/folders/${encodeURIComponent(folderId)}/associations/${encodeURIComponent(templateId)}`, { method: "DELETE" }); }
export function getTeamFolderDataTemplateMandate(teamFolderId: string) { return apiRequest<{ enabled: boolean; target: "FILES"|"FOLDERS"|"BOTH"; template: DataTemplate | null }>(`/metadata/team-folders/${encodeURIComponent(teamFolderId)}/mandate`); }
export function setTeamFolderDataTemplateMandate(teamFolderId: string, body: { templateId: string | null; target?: "FILES"|"FOLDERS"|"BOTH" }) { return apiRequest(`/metadata/team-folders/${encodeURIComponent(teamFolderId)}/mandate`, { method: "PUT", body: JSON.stringify(body) }); }
