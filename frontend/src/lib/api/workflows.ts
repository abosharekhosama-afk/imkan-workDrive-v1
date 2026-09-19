import { apiRequest } from './client';

export type WorkflowAction = { type: string; config?: Record<string, unknown> };
export type WorkflowState = { id: string; position: number; name: string; description?: string | null; terminal: boolean };
export type WorkflowTransition = { id: string; fromStateId: string; toStateId: string; name: string; description?: string | null; trigger?: string | null; condition?: Record<string, unknown> | null; actions: WorkflowAction[] };
export type WorkflowStep = { id: string; position: number; kind: string; config: { value: unknown } };
export type WorkflowCapabilities = {
  role: string;
  canViewWorkspace: boolean;
  canViewMy: boolean;
  canViewDrafts: boolean;
  canCreate: boolean;
  canEditOwnedDrafts: boolean;
  canViewWaiting: boolean;
  canViewRuns: boolean;
  canViewDynamicValues: boolean;
  canViewTemplates: boolean;
  canViewFunctions: boolean;
  canViewDiagnostics: boolean;
  canViewQueue: boolean;
  canViewAudit: boolean;
  canManageWorkflows: boolean;
};
export function listWorkflowCapabilities() { return apiRequest<WorkflowCapabilities>('/workflows/capabilities'); }

export type Workflow = { id: string; name: string; description?: string | null; mode: 'AUTOMATIC' | 'MANUAL'; resourceType: 'FILE' | 'FOLDER'; status: 'DRAFT' | 'ACTIVE'; ownerId: string; createdAt: string; updatedAt: string; activeVersionId?: string | null; calendarConfig?: Record<string, unknown> | null; isSystemDefault?: boolean; steps: WorkflowStep[]; states: WorkflowState[]; transitions: WorkflowTransition[] };

export type WorkflowParticipant = { id: string; name?: string | null; email: string; avatarUrl?: string | null };
export function listWorkflowParticipants() { return apiRequest<Array<{ user: WorkflowParticipant }>>('/workflows/participants'); }
export function listWorkflows(scope?: string) { return apiRequest<Workflow[]>(`/workflows${scope ? `?scope=${encodeURIComponent(scope)}` : ''}`); }
export function getWorkflow(id: string) { return apiRequest<Workflow>(`/workflows/${id}`); }
export function createWorkflow(input: Record<string, unknown>) { return apiRequest<Workflow>('/workflows', { method: 'POST', body: JSON.stringify(input) }); }
export function updateWorkflow(id: string, input: Record<string, unknown>) { return apiRequest<Workflow>(`/workflows/${id}`, { method: 'PATCH', body: JSON.stringify(input) }); }
export function activateWorkflow(id: string) { return apiRequest<Workflow>(`/workflows/${id}/activate`, { method: 'POST' }); }
export function deactivateWorkflow(id: string) { return apiRequest<Workflow>(`/workflows/${id}/deactivate`, { method: 'POST' }); }
export function deleteWorkflow(id: string) { return apiRequest<{ id: string; deleted: boolean }>(`/workflows/${id}`, { method: 'DELETE' }); }
export function duplicateWorkflow(id: string) { return apiRequest<Workflow>(`/workflows/${id}/duplicate`, { method: 'POST' }); }
export function startWorkflow(id: string, input: Record<string, unknown>) { return apiRequest(`/workflows/${id}/start`, { method: 'POST', body: JSON.stringify(input) }); }

export type WorkflowStepRun = { id: string; stepKind: string; stepPosition: number; status: string; input?: unknown; output?: unknown; error?: string | null; startedAt: string; finishedAt?: string | null };
export type WorkflowRun = { id: string; workflowId: string; versionId?: string | null; eventKey: string; status: string; trigger: Record<string, unknown>; result?: Record<string, unknown> | null; error?: string | null; startedAt: string; finishedAt?: string | null; currentState?: { id: string; name: string } | null; workflow: { id: string; name: string; ownerId?: string }; tasks?: Array<{ id: string; status: string; title: string }>; stepRuns?: WorkflowStepRun[] };
export type WorkflowResourceStatus = { resourceType: 'FILE' | 'FOLDER'; resourceId: string; runId: string; workflowId: string; workflowName: string; status: string; state?: { id: string; name: string; terminal: boolean } | null; startedAt: string; finishedAt?: string | null; pending: boolean; myPendingTask?: { id: string; title: string; dueAt?: string | null; priority?: string } | null };
export function listWorkflowResourceStatus(resourceType: 'FILE' | 'FOLDER', resourceIds: string[]) { const ids = [...new Set(resourceIds.filter(Boolean))].slice(0, 100); if (!ids.length) return Promise.resolve<WorkflowResourceStatus[]>([]); return apiRequest<WorkflowResourceStatus[]>(`/workflows/resource-status?resourceType=${resourceType}&resourceIds=${encodeURIComponent(ids.join(','))}`); }
export function listWorkflowRuns(params?: { workflowId?: string; status?: string; date?: string }) { const q = new URLSearchParams(); if (params?.workflowId) q.set('workflowId', params.workflowId); if (params?.status) q.set('status', params.status); if (params?.date) q.set('date', params.date); return apiRequest<WorkflowRun[]>(`/workflows/runs${q.toString() ? `?${q.toString()}` : ''}`); }
export function getWorkflowRunLogs(id: string) { return apiRequest<WorkflowRun & { jobs: Array<{ id: string; status: string; attempts: number; maxAttempts?: number; priority?: number; runAt?: string; leaseUntil?: string | null; lockedBy?: string | null; lastError?: string | null }> }>(`/workflows/runs/${id}/logs`); }
export function retryWorkflowRun(id: string) { return apiRequest<{ runId: string; queued: boolean }>(`/workflows/runs/${id}/retry`, { method: 'POST' }); }
export type WorkflowTaskParticipant = { id: string; userId: string; status: string; respondedAt?: string | null; comment?: string | null; user?: { id: string; name?: string | null; email: string } };
export type WorkflowTask = { id: string; workflowId: string; runId: string; stateId: string; transitionId?: string | null; status: string; title: string; approvalPolicy?: string; priority?: string; dueAt?: string | null; reminderAt?: string | null; createdAt: string; participants?: WorkflowTaskParticipant[]; workflow: { id: string; name: string; transitions: Array<{ id: string; fromStateId: string; toStateId: string; name: string; description?: string | null; trigger?: string | null; condition?: unknown; actions?: unknown }>; steps?: WorkflowStep[] }; state: { id: string; name: string }; run: { id: string; trigger: Record<string, unknown>; result?: Record<string, unknown> | null } };
export function listWorkflowTasks(status = 'PENDING') { return apiRequest<WorkflowTask[]>(`/workflows/tasks?status=${encodeURIComponent(status)}`); }
export function completeWorkflowTask(id: string, transitionId: string, fieldValues: Record<string, unknown> = {}, comment = "") { return apiRequest(`/workflows/tasks/${id}/complete`, { method: 'POST', body: JSON.stringify({ transitionId, fieldValues, comment }) }); }

export type WorkflowParticipantOptions = { users: WorkflowParticipant[]; groups: Array<{ id: string; name: string; description?: string | null; memberCount?: number }>; roles: string[] };
export function listWorkflowParticipantOptions() { return apiRequest<WorkflowParticipantOptions>('/workflows/participant-options'); }
export type WorkflowVersionSummary = { id: string; version: number; status: string; createdById: string; createdAt: string; publishedAt?: string | null };
export function getWorkflowVersionDetail(workflowId:string, versionId:string) { return apiRequest<WorkflowVersionSummary & { snapshot: unknown }>(`/workflows/${workflowId}/versions/${versionId}`); }
export function listWorkflowVersions(workflowId: string) { return apiRequest<WorkflowVersionSummary[]>(`/workflows/${workflowId}/versions`); }
export function rollbackWorkflowVersion(workflowId: string, versionId: string) { return apiRequest<Workflow>(`/workflows/${workflowId}/versions/${versionId}/rollback`, { method: 'POST' }); }

export type WorkflowDataTemplateVersion = {
  id: string;
  version: number;
  template: string;
  format: string;
  variables?: unknown;
  createdById?: string;
  createdAt?: string;
};
export type WorkflowDataTemplate = {
  id: string;
  name: string;
  description?: string | null;
  template: string;
  format: string;
  status?: 'ACTIVE' | 'DRAFT' | 'ARCHIVED' | string;
  activeVersionId?: string | null;
  activeVersion?: { id: string; version: number; createdAt?: string } | WorkflowDataTemplateVersion | null;
  versions?: WorkflowDataTemplateVersion[];
  createdAt?: string;
  updatedAt?: string;
};
export function listWorkflowTemplates() { return apiRequest<WorkflowDataTemplate[]>('/workflows/templates'); }
export function createWorkflowTemplate(input: {name:string;description?:string;template:string;format?:string}) { return apiRequest<WorkflowDataTemplate>('/workflows/templates', { method:'POST', body: JSON.stringify(input) }); }
export function updateWorkflowTemplate(id:string, input: {name?:string;description?:string;template?:string;format?:string;status?:string}) { return apiRequest<WorkflowDataTemplate>(`/workflows/templates/${id}`, { method:'PATCH', body: JSON.stringify(input) }); }
export function deleteWorkflowTemplate(id:string) { return apiRequest<{id:string;deleted:boolean}>(`/workflows/templates/${id}`, { method:'DELETE' }); }
export function listWorkflowTemplateVersions(id:string) { return apiRequest<WorkflowDataTemplateVersion[]>(`/workflows/templates/${id}/versions`); }
export function previewWorkflowTemplate(id:string, input: {versionId?:string;workflowId?:string;event?:Record<string,unknown>;fields?:Record<string,unknown>}) { return apiRequest<{templateId:string;version:number;format:string;rendered:string;variables:string[];unresolvedVariables:string[]}>(`/workflows/templates/${id}/preview`, { method:'POST', body: JSON.stringify(input) }); }
export function rollbackWorkflowTemplateVersion(id:string, versionId:string) { return apiRequest<WorkflowDataTemplate>(`/workflows/templates/${id}/versions/${versionId}/rollback`, { method:'POST' }); }
export function ensureWorkflowDefaults() { return apiRequest('/workflows/defaults/ensure', { method: 'POST' }); }
export type WorkflowFunction = { id:string; name:string; key:string; description?:string|null; kind:string; enabled:boolean; activeVersionId?:string|null; activeVersion?: { id:string; version:number; status:string; runtime:string; timeoutMs:number; memoryLimitMb:number } | null };
export type WorkflowFunctionVersion = { id:string; version:number; status:string; runtime:string; timeoutMs:number; memoryLimitMb:number; createdAt:string; publishedAt?:string|null; definition:unknown };
export function listWorkflowFunctions() { return apiRequest<{builtIns:Array<{key:string;name:string;description:string}>;custom:WorkflowFunction[]}>('/workflows/functions'); }
export function createWorkflowFunction(input: Record<string,unknown>) { return apiRequest<WorkflowFunction>('/workflows/functions',{method:'POST',body:JSON.stringify(input)}); }
export function listWorkflowFunctionVersions(id:string) { return apiRequest<WorkflowFunctionVersion[]>(`/workflows/functions/${id}/versions`); }
export function publishWorkflowFunctionVersion(id:string,versionId:string) { return apiRequest<WorkflowFunction>(`/workflows/functions/${id}/versions/${versionId}/publish`,{method:'POST'}); }
export function testWorkflowFunction(id:string,input:Record<string,unknown>) { return apiRequest(`/workflows/functions/${id}/test`,{method:'POST',body:JSON.stringify({input})}); }

export type WorkflowDynamicValue = { path: string; label: string; type: string; example?: string };
export function listWorkflowDynamicValues(workflowId?: string) { return apiRequest<{ version: number; values: WorkflowDynamicValue[] }>(`/workflows/dynamic-values${workflowId ? `?workflowId=${encodeURIComponent(workflowId)}` : ''}`); }
export type WorkflowDiagnostics = { generatedAt: string; durationMs: number; summary: { workflowCount: number; activeCount: number; queued: number; running: number; waiting: number; failed: number; deadLetter: number }; checks: Array<{ key: string; label: string; status: 'PASS' | 'WARN' | 'FAIL'; detail: string; latencyMs?: number }> };
export function getWorkflowDiagnostics() { return apiRequest<WorkflowDiagnostics>('/workflows/diagnostics'); }
export type WorkflowQueueJob = { id:string; workflowId:string; runId:string; status:string; attempts:number; maxAttempts:number; runAt:string; leaseUntil?:string|null; lockedBy?:string|null; priority:number; lastError?:string|null; createdAt:string; updatedAt:string; workflow?:{id:string;name:string}; run?:{id:string;status:string} };
export function listWorkflowQueue(status?: string) { const q=status?`?status=${encodeURIComponent(status)}`:''; return apiRequest<WorkflowQueueJob[]>(`/workflows/queue${q}`); }
export function workflowQueueAction(id:string, action:'retry'|'requeue'|'dead-letter'|'recover') { return apiRequest(`/workflows/queue/${id}/${action}`,{method:'POST'}); }
export function getWorkflowQueueJob(id:string) { return apiRequest<WorkflowQueueJob>(`/workflows/queue/${id}`); }
export type WorkflowAuditEntry = { id:string; action:string; resourceType:string; resourceId:string; actorId?:string|null; metadata?:unknown; createdAt:string; actor?:{id:string;name?:string|null;email:string}|null };
export function listWorkflowAudit(params?: { action?:string; resourceType?:string }) { const q=new URLSearchParams(); if(params?.action) q.set('action',params.action); if(params?.resourceType) q.set('resourceType',params.resourceType); return apiRequest<WorkflowAuditEntry[]>(`/workflows/audit${q.toString()?`?${q}`:''}`); }


export type ConnectionScope = { value: string; label: string; description: string; group?: string; risk?: 'STANDARD'|'SENSITIVE'|'RESTRICTED' };
export type ConnectionProvider = { key: string; name: string; category?: string; authTypes: string[]; oauth?: boolean; capabilities?: string[]; configured?: boolean; baseUrl?: string; scopes?: ConnectionScope[]; defaultScopes?: string[]; scopeGroups?: string[] };
export type CustomConnectionService = { id:string; name:string; linkName:string; provider:string; authType:string; parameterKey?:string|null; parameterLabel?:string|null; parameterType?:string|null; baseUrl?:string|null; oauth:boolean; configured:boolean; oauthCallbackUrl?:string|null; scopes:ConnectionScope[]; defaultScopes:string[]; scopeGroups:string[]; createdAt:string; updatedAt:string };
export function listCustomConnectionServices() { return apiRequest<CustomConnectionService[]>('/connections/custom-services'); }
export function createCustomConnectionService(input: Record<string, unknown>) { return apiRequest<CustomConnectionService>('/connections/custom-services', { method:'POST', body: JSON.stringify(input) }); }
export function deleteCustomConnectionService(id:string) { return apiRequest<{id:string;deleted:boolean}>(`/connections/custom-services/${encodeURIComponent(id)}`, { method:'DELETE' }); }
export type Connection = { canManage: boolean; id: string; orgId: string; ownerId: string; name: string; provider: string; authType: string; visibility: 'PRIVATE' | 'ORGANIZATION'; status: 'ACTIVE' | 'REAUTH_REQUIRED' | 'DISABLED' | 'ERROR'; baseUrl?: string | null; metadata?: Record<string, unknown> | null; expiresAt?: string | null; scope?: string | null; lastTestedAt?: string | null; lastUsedAt?: string | null; errorCode?: string | null; errorMessage?: string | null; createdAt: string; updatedAt: string };
export type ConnectionUsage = { id: string; userId?: string | null; workflowId?: string | null; runId?: string | null; actionType?: string | null; status: string; durationMs?: number | null; createdAt: string };
export function listConnectionProviders() { return apiRequest<ConnectionProvider[]>('/connections/providers'); }
export function listConnections(params?: { provider?: string; status?: string; search?: string }) { const q = new URLSearchParams(); if (params?.provider) q.set('provider', params.provider); if (params?.status) q.set('status', params.status); if (params?.search) q.set('search', params.search); return apiRequest<Connection[]>(`/connections${q.toString() ? `?${q}` : ''}`); }
export function getConnection(id: string) { return apiRequest<Connection>(`/connections/${id}`); }
export function createConnection(input: Record<string, unknown>) { return apiRequest<Connection>('/connections', { method: 'POST', body: JSON.stringify(input) }); }
export function updateConnection(id: string, input: Record<string, unknown>) { return apiRequest<Connection>(`/connections/${id}`, { method: 'PATCH', body: JSON.stringify(input) }); }
export function testConnection(id: string) { return apiRequest<{ id: string; ok: boolean; status: string; missing: string[] }>(`/connections/${id}/test`, { method: 'POST' }); }
export function disableConnection(id: string) { return apiRequest<Connection>(`/connections/${id}/disable`, { method: 'POST' }); }
export function enableConnection(id: string) { return apiRequest<Connection>(`/connections/${id}/enable`, { method: 'POST' }); }
export function revokeConnection(id: string) { return apiRequest<{ id:string; revoked:boolean; status:string }>(`/connections/${id}/revoke`, { method: 'POST' }); }
export function getConnectionShares(id: string) { return apiRequest<{ ownerId:string; shares:Array<{id:string;userId:string;role:'USE'|'MANAGE';user:{id:string;name?:string|null;email:string}}> }>(`/connections/${id}/shares`); }
export function shareConnection(id: string, userId: string, role: 'USE'|'MANAGE') { return apiRequest(`/connections/${id}/shares`, { method: 'POST', body: JSON.stringify({ userId, role }) }); }
export function unshareConnection(id: string, userId: string) { return apiRequest(`/connections/${id}/shares/${encodeURIComponent(userId)}`, { method: 'DELETE' }); }
export function deleteConnection(id: string) { return apiRequest<{ id: string; deleted: boolean }>(`/connections/${id}`, { method: 'DELETE' }); }
export function getConnectionSecretVersions(id: string) { return apiRequest<{ connectionId:string; currentVersion:number|null; versions:Array<{id:string;version:number;createdById:string;createdAt:string}> }>(`/connections/${id}/secrets/versions`); }
export function rotateConnectionSecret(id:string, secrets:Record<string,string>) { return apiRequest(`/connections/${id}/secrets/rotate`,{method:"POST",body:JSON.stringify({secrets})}); }
export function rollbackConnectionSecret(id:string, version:number) { return apiRequest(`/connections/${id}/secrets/rollback`,{method:"POST",body:JSON.stringify({version})}); }
export function getConnectionDiagnostics(id: string) { return apiRequest<{ id:string; provider:string; authType:string; status:string; checks:Record<string,boolean>; lastTestedAt?:string|null; lastUsedAt?:string|null; errorCode?:string|null; errorMessage?:string|null; usageCount:number; averageDurationMs?:number|null }>(`/connections/${id}/diagnostics`); }
export function getConnectionUsage(id: string) { return apiRequest<{ count: number; recent: ConnectionUsage[]; summary: { byStatus: Array<{status:string;_count:{_all:number};_avg:{durationMs:number|null}}>; byAction: Array<{actionType:string|null;_count:{_all:number};_avg:{durationMs:number|null}}> } }>(`/connections/${id}/usage`); }

export function startConnectionOAuth(provider: string, folderId?: string, connectionId?: string) { const q = new URLSearchParams(); if (folderId) q.set('folderId', folderId); if (connectionId) q.set('connectionId', connectionId); return apiRequest<{url:string;provider:string;connectionId?:string|null;scopes?:string[]}>(`/connections/oauth/${encodeURIComponent(provider)}/start${q.toString() ? `?${q}` : ''}`); }
export function reconnectConnection(id: string) { return apiRequest<{url:string}>(`/connections/${id}/reconnect`, { method: "POST" }); }
