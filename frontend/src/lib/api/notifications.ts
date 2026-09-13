import { getApiBaseUrl } from './client';
import { getToken } from './jwt';
export type NotificationRecord = { id: string; type: string; title: string; body: string | null; resourceType: 'FILE' | 'FOLDER' | null; resourceId: string | null; readAt: string | null; createdAt: string };
async function request<T>(path: string, init: RequestInit = {}): Promise<T> { const token=getToken(); const response=await fetch(`${getApiBaseUrl()}${path}`,{...init,headers:{...(init.body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{}) ,...(init.headers||{})}}); if(!response.ok) throw new Error((await response.text())||'Request failed'); return response.json() as Promise<T>; }
export const listNotifications=()=>request<NotificationRecord[]>('/notifications');
export const markNotificationRead=(id:string)=>request<{ok:boolean}>(`/notifications/${id}/read`,{method:'POST'});
export const markAllNotificationsRead=()=>request<{ok:boolean}>('/notifications/read-all',{method:'POST'});
