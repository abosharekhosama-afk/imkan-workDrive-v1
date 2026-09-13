import { apiRequest } from './client';

export type WorkflowAction = { type: string; config?: Record<string, unknown> };
export type WorkflowState = { id: string; position: number; name: string; description?: string | null; terminal: boolean };
export type WorkflowTransition = { id: string; fromStateId: string; toStateId: string; name: string; description?: string | null; trigger?: string | null; condition?: Record<string, unknown> | null; actions: WorkflowAction[] };
export type WorkflowStep = { id: string; position: number; kind: string; config: { value: unknown } };
export type Workflow = { id: string; name: string; description?: string | null; mode: 'AUTOMATIC' | 'MANUAL'; resourceType: 'FILE' | 'FOLDER'; status: 'DRAFT' | 'ACTIVE'; ownerId: string; createdAt: string; updatedAt: string; steps: WorkflowStep[]; states: WorkflowState[]; transitions: WorkflowTransition[] };

export function listWorkflows(scope?: string) { return apiRequest<Workflow[]>(`/workflows${scope ? `?scope=${encodeURIComponent(scope)}` : ''}`); }
export function getWorkflow(id: string) { return apiRequest<Workflow>(`/workflows/${id}`); }
export function createWorkflow(input: Record<string, unknown>) { return apiRequest<Workflow>('/workflows', { method: 'POST', body: JSON.stringify(input) }); }
export function updateWorkflow(id: string, input: Record<string, unknown>) { return apiRequest<Workflow>(`/workflows/${id}`, { method: 'PATCH', body: JSON.stringify(input) }); }
export function activateWorkflow(id: string) { return apiRequest<Workflow>(`/workflows/${id}/activate`, { method: 'POST' }); }
export function deactivateWorkflow(id: string) { return apiRequest<Workflow>(`/workflows/${id}/deactivate`, { method: 'POST' }); }
export function deleteWorkflow(id: string) { return apiRequest<{ id: string; deleted: boolean }>(`/workflows/${id}`, { method: 'DELETE' }); }
export function startWorkflow(id: string, input: Record<string, unknown>) { return apiRequest(`/workflows/${id}/start`, { method: 'POST', body: JSON.stringify(input) }); }

export type WorkflowRun = { id: string; workflowId: string; eventKey: string; status: string; trigger: Record<string, unknown>; result?: Record<string, unknown> | null; error?: string | null; startedAt: string; finishedAt?: string | null; currentState?: { id: string; name: string } | null; workflow: { id: string; name: string }; tasks?: Array<{ id: string; status: string; title: string }> };
export function listWorkflowRuns(params?: { workflowId?: string; status?: string }) { const q = new URLSearchParams(); if (params?.workflowId) q.set('workflowId', params.workflowId); if (params?.status) q.set('status', params.status); return apiRequest<WorkflowRun[]>(`/workflows/runs${q.toString() ? `?${q.toString()}` : ''}`); }
export type WorkflowTask = { id: string; workflowId: string; runId: string; stateId: string; status: string; title: string; createdAt: string; workflow: { id: string; name: string; transitions: Array<{ id: string; fromStateId: string; toStateId: string; name: string }> }; state: { id: string; name: string }; run: { id: string; trigger: Record<string, unknown> } };
export function listWorkflowTasks(status = 'PENDING') { return apiRequest<WorkflowTask[]>(`/workflows/tasks?status=${encodeURIComponent(status)}`); }
export function completeWorkflowTask(id: string, transitionId: string) { return apiRequest(`/workflows/tasks/${id}/complete`, { method: 'POST', body: JSON.stringify({ transitionId }) }); }
