import { apiRequest } from './client';
export type ExternalStorageMount = { id:string; provider:string; name:string; connectionId:string; rootPath:string|null; readEnabled:boolean; writeEnabled:boolean; status:'ACTIVE'|'DISCONNECTED'|'ERROR'; lastTestedAt:string|null; lastTestOk:boolean|null; lastTestMessage:string|null };
export async function listExternalStorage(){ return apiRequest<ExternalStorageMount[]>('/external-storage'); }
export async function createExternalStorage(input: Partial<ExternalStorageMount> & {name:string;provider:string;connectionId:string}){ return apiRequest<ExternalStorageMount>('/external-storage',{method:'POST',body:JSON.stringify(input)}); }
export async function updateExternalStorage(id:string,input:Partial<ExternalStorageMount>){ return apiRequest<ExternalStorageMount>(`/external-storage/${id}`,{method:'PATCH',body:JSON.stringify(input)}); }
export async function deleteExternalStorage(id:string){ return apiRequest<{ok:boolean}>(`/external-storage/${id}`,{method:'DELETE'}); }
export async function testExternalStorage(id:string){ return apiRequest<{ok:boolean;message:string}>(`/external-storage/${id}/test`,{method:'POST'}); }
export async function browseExternalStorage(id:string,path?:string){ return apiRequest<{provider:string;path:string;items:any[]}>(`/external-storage/${id}/browse${path?`?path=${encodeURIComponent(path)}`:''}`); }
export async function exportOfficeToExternalStorage(id:string,input:{fileId:string;format:'docx'|'xlsx'|'pptx';remoteName?:string;remoteParentId?:string}){ return apiRequest<any>(`/external-storage/${id}/export`,{method:'POST',body:JSON.stringify(input)}); }
