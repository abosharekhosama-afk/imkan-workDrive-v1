import { apiRequest } from './client';
export type Workflow = { id:string; name:string; description?:string|null; status:string; mode:string; resourceType:string; owner?:{id:string;name?:string|null;email:string}; _count?:{runs:number;tasks:number}; states?:Array<{id:string;name:string;position:number;terminal:boolean}> };
export type WorkflowTask = { id:string; workflow:{id:string;name:string}; state:{id:string;name:string;terminal:boolean}; run:{id:string;resourceType:string;resourceId:string;status:string}; dueAt?:string|null; createdAt:string };
export const workflowsApi = {
 list: () => apiRequest<Workflow[]>('/workflows'),
 mine: () => apiRequest<Workflow[]>('/workflows/mine'),
 tasks: () => apiRequest<WorkflowTask[]>('/workflows/tasks'),
 admin: () => apiRequest<{workflows:number;pendingTasks:number;activeRuns:number}>('/workflows/admin'),
 create: (body: {name:string;description?:string;resourceType?:'FILE'|'FOLDER';mode?:'MANUAL'|'AUTOMATIC'}) => apiRequest<Workflow>('/workflows',{method:'POST',body:JSON.stringify(body)}),
 activate: (id:string) => apiRequest<Workflow>(`/workflows/${id}/activate`,{method:'POST'}),
 deactivate: (id:string) => apiRequest<Workflow>(`/workflows/${id}/deactivate`,{method:'POST'}),
 run: (id:string, body:{resourceType:'FILE'|'FOLDER';resourceId:string}) => apiRequest(`/workflows/${id}/run`,{method:'POST',body:JSON.stringify(body)}),
 decide: (id:string, decision:'approve'|'reject') => apiRequest(`/workflows/tasks/${id}/${decision}`,{method:'POST'}),
};
