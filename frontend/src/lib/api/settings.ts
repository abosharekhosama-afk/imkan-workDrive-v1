import { getApiBaseUrl } from './client'; import { getToken } from './jwt';
export type SessionRecord={id:string;createdAt:string;lastSeenAt:string;expiresAt:string};
async function request<T>(path:string,init:RequestInit={}):Promise<T>{const token=getToken();const response=await fetch(`${getApiBaseUrl()}${path}`,{...init,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})}});if(!response.ok)throw new Error((await response.text())||'Request failed');return response.json() as Promise<T>}
export const updateProfile=(name:string)=>request<{id:string;name:string|null;email:string;org_id:string;role:string}>('/auth/profile',{method:'POST',body:JSON.stringify({name})});
export const changePassword=(currentPassword:string,newPassword:string)=>request<{ok:boolean}>('/auth/change-password',{method:'POST',body:JSON.stringify({currentPassword,newPassword})});
export const listSessions=()=>request<SessionRecord[]>('/auth/sessions'); export const revokeSession=(id:string)=>request<{ok:boolean}>(`/auth/sessions/${id}`,{method:'DELETE'}); export const logoutAllSessions=()=>request<{ok:boolean}>('/auth/logout-all',{method:'POST'});
