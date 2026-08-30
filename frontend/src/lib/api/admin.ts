import { getApiBaseUrl } from './client'; import { getToken } from './jwt';
export type AdminOverview={users:number;files:number;folders:number;shares:number;teamFolders:number}; export type AdminUser={id:string;name:string|null;email:string;role:string;status?:string;createdAt:string};
async function request<T>(path:string):Promise<T>{const token=getToken();const response=await fetch(`${getApiBaseUrl()}${path}`,{headers:token?{Authorization:`Bearer ${token}`}:{}});if(!response.ok)throw new Error((await response.text())||'Request failed');return response.json() as Promise<T>}
export const getAdminOverview=()=>request<AdminOverview>('/admin/overview'); export const listAdminUsers=()=>request<AdminUser[]>('/admin/users');
