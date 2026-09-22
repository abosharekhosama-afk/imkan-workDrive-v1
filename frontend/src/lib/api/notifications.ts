import { getApiBaseUrl } from './client';
import { getToken } from './jwt';
export type NotificationRecord = { id: string; type: string; title: string; body: string | null; priority: 'LOW'|'NORMAL'|'HIGH'|'URGENT'; resourceType: 'FILE' | 'FOLDER' | null; resourceId: string | null; readAt: string | null; createdAt: string };
export type OfficeNotificationPreferences = { id: string; orgId: string; userId: string; collaboration: boolean; templateAutomation: boolean; exports: boolean; compliance: boolean; externalStorage: boolean; createdAt: string; updatedAt: string };
async function request<T>(path: string, init: RequestInit = {}): Promise<T> { const token=getToken(); const response=await fetch(`${getApiBaseUrl()}${path}`,{...init,headers:{...(init.body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{}) ,...(init.headers||{})}}); if(!response.ok) throw new Error((await response.text())||'Request failed'); return response.json() as Promise<T>; }
export const listNotifications=()=>request<NotificationRecord[]>('/notifications');
export const markNotificationRead=(id:string)=>request<{ok:boolean}>(`/notifications/${id}/read`,{method:'POST'});
export const markAllNotificationsRead=()=>request<{ok:boolean}>('/notifications/read-all',{method:'POST'});
export const getOfficeNotificationPreferences=()=>request<OfficeNotificationPreferences>('/notifications/office-preferences');
export const updateOfficeNotificationPreferences=(input:Partial<Omit<OfficeNotificationPreferences,'id'|'orgId'|'userId'|'createdAt'|'updatedAt'>>)=>request<OfficeNotificationPreferences>('/notifications/office-preferences',{method:'POST',body:JSON.stringify(input)});
export function subscribeToNotifications(onNotification:(notification:NotificationRecord)=>void,onError?:()=>void){
  if(typeof window==='undefined') return ()=>{};
  const token=getToken(); if(!token) return ()=>{};
  const controller=new AbortController();
  void (async()=>{
    try {
      const response=await fetch(`${getApiBaseUrl()}/notifications/stream`,{headers:{Authorization:`Bearer ${token}`},signal:controller.signal});
      if(!response.ok||!response.body) throw new Error('Notification stream unavailable');
      const reader=response.body.getReader(); const decoder=new TextDecoder(); let buffer='';
      while(!controller.signal.aborted){
        const {value,done}=await reader.read(); if(done) break; buffer+=decoder.decode(value,{stream:true});
        const frames=buffer.split('\n\n'); buffer=frames.pop() ?? '';
        for(const frame of frames){ const line=frame.split('\n').find((v)=>v.startsWith('data:')); if(!line) continue; try{ onNotification(JSON.parse(line.slice(5).trim()) as NotificationRecord); }catch{} }
      }
    } catch { if(!controller.signal.aborted) onError?.(); }
  })();
  return ()=>controller.abort();
}

export type CollaborationActivity = { id:string; action:string; createdAt:string; file:{id:string;name:string;ownerId:string}; actor:{id:string;name:string|null;email:string;avatarUrl:string|null}|null; metadata:Record<string,unknown>|null };
export const listCollaborationActivity=(limit=50)=>request<CollaborationActivity[]>(`/files/activity-feed?limit=${limit}`);
