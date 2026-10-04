import { apiRequest, getApiBaseUrl } from './client';
import { emitGlobalToast } from '../global-toast';
export type OrgRole = 'SUPER_ADMIN' | 'ADMIN' | 'MEMBER';
export type Organization = { id: string; name: string; createdAt: string; members: number; pendingInvitations: number; role: OrgRole };
export type OrgMember = { id: string; userId?: string; name: string | null; email: string; role: OrgRole; status?: string; joinedAt?: string | null; createdAt: string; };
export type Invitation = { id: string; email: string; role: OrgRole; expiresAt: string; acceptedAt: string | null; revokedAt: string | null; createdAt: string; invitedBy: { id: string; name: string | null; email: string } };
export type InvitationCreated = { id: string; email: string; role: OrgRole; expiresAt: string; inviteUrl: string };
export type OrganizationAccount = { id: string; email: string; name: string | null; role: OrgRole };
export type WorkspacePolicy = {
  logoDataUrl: string | null;
  defaultView: 'THUMBNAIL' | 'LIST' | 'COMPACT' | string;
  thumbnailSize: number;
  previewPanel: 'PREVIEW' | 'DETAILS' | 'COMMENTS' | 'DATA_TEMPLATE' | string;
  allowNonZohoWriter: boolean;
  allowNonZohoSheet: boolean;
  allowNonZohoShow: boolean;
  myFoldersLimitBytes: string | null;
};
export function getWorkspacePolicy() { return apiRequest<WorkspacePolicy>('/organization/workspace-policy'); }
export function getOrganization(){return apiRequest<Organization>('/organization');}
export function createOrganizationAccount(input: { name: string; email: string; password: string; role: OrgRole }): Promise<OrganizationAccount> {
  return apiRequest<OrganizationAccount>('/organization/accounts', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
export async function updateOrganization(name:string){const result=await apiRequest<{id:string;name:string;createdAt:string}>('/organization',{method:'PATCH',body:JSON.stringify({name})});emitGlobalToast({message:'Organization settings updated',messageAr:'تم تحديث إعدادات المؤسسة'});return result;}
export function listOrganizationMembers(filters?: { status?: string }){
  const status = filters?.status ? `?status=${encodeURIComponent(filters.status)}` : "";
  return apiRequest<OrgMember[]>(`/organization/members${status}`);
}
export async function updateOrganizationMember(id:string,role:OrgRole){const result=await apiRequest<OrgMember>(`/organization/members/${id}`,{method:'PATCH',body:JSON.stringify({role})});emitGlobalToast({message:'Member role updated',messageAr:'تم تحديث دور العضو'});return result;}
export async function removeOrganizationMember(id:string){const result=await apiRequest<{id:string;deleted:boolean}>(`/organization/members/${id}`,{method:'DELETE'});emitGlobalToast({message:'Member removed',messageAr:'تمت إزالة العضو'});return result;}
export function listOrganizationInvitations(){return apiRequest<Invitation[]>('/organization/invitations');}
export async function inviteOrganizationMember(email:string,role:OrgRole){const result=await apiRequest<InvitationCreated>('/organization/invitations',{method:'POST',body:JSON.stringify({email,role})});emitGlobalToast({message:'Invitation sent',messageAr:'تم إرسال الدعوة'});return result;}
export async function revokeOrganizationInvitation(id:string){const result=await apiRequest<{id:string;revoked:boolean}>(`/organization/invitations/${id}`,{method:'DELETE'});emitGlobalToast({message:'Invitation revoked',messageAr:'تم إلغاء الدعوة'});return result;}
export function acceptOrganizationInvitation(token:string){return apiRequest<{accepted:boolean;organizationId:string;role:OrgRole}>('/organization/invitations/accept',{method:'POST',body:JSON.stringify({token})});}
export function validateOrganizationInvitation(token:string){return fetch(`${getApiBaseUrl()}/organization/invitations/validate?token=${encodeURIComponent(token)}`).then(async r=>{if(!r.ok) throw new Error(await r.text());return r.json() as Promise<{email:string;role:OrgRole;expiresAt:string;organization:{id:string;name:string}}>});}

export type ManagedMember = {
  id: string; userId: string; name: string | null; email: string; avatarUrl?: string | null;
  role: OrgRole; status: string; joinedAt?: string | null; createdAt: string;
  storageUsed: string; teamFolderCount: number; groupCount: number;
};
export type MemberManagement = {
  members: ManagedMember[];
  invitations: Array<{ id: string; email: string; role: OrgRole; expiresAt: string; createdAt: string; invitedBy: { id: string; name: string | null; email: string } }> ;
  counts: { licensed: number; active: number; suspended: number; removed: number; invited: number; templateAdmins: number; teamAdmins: number };
  licenseLimit: number;
};
export type MemberDetails = {
  member: ManagedMember & { lastLoginAt?: string | null };
  teamFolders: Array<{ id: string; name: string; role: string; isPublicToOrg: boolean; source?: "DIRECT" | "GROUP"; groupNames?: string[] }>;
  groups: Array<{ id: string; name: string; description: string | null; role: string }>;
  availableTeamFolders: Array<{
    id: string; name: string; isPublicToOrg: boolean;
    files: Array<{ id: string; name: string; size: string; mimeType: string | null; fileType: string; updatedAt: string }>;
  }>;
};
export function getMemberManagement(status?: string) {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiRequest<MemberManagement>(`/organization/members/management${q}`);
}
export function getMemberDetails(id: string) {
  return apiRequest<MemberDetails>(`/organization/members/${id}/details`);
}
export async function suspendOrganizationMember(id: string) { const result=await apiRequest<{ id: string; suspended: boolean }>(`/organization/members/${id}/suspend`, { method: 'POST' }); emitGlobalToast({message:'Member suspended',messageAr:'تم تعليق العضو'}); return result; }
export async function activateOrganizationMember(id: string) { const result=await apiRequest<{ id: string; activated: boolean }>(`/organization/members/${id}/activate`, { method: 'POST' }); emitGlobalToast({message:'Member activated',messageAr:'تم تفعيل العضو'}); return result; }
export function removeOrganizationMemberWithSuccessor(id: string, successorId?: string) {
  return apiRequest<{ id: string; removed: boolean }>(`/organization/members/${id}`, {
    method: 'DELETE', body: JSON.stringify({ successorId: successorId || undefined }),
  });
}
export type GroupOption = { id: string; name: string; description: string | null; memberCount: number };
export function listGroups() { return apiRequest<GroupOption[]>('/groups'); }
export function addGroupMember(groupId: string, userId: string, role: 'ADMIN' | 'MEMBER' = 'MEMBER') {
  return apiRequest(`/groups/${groupId}/members/${userId}`, { method: 'POST', body: JSON.stringify({ role }) });
}
export function removeGroupMember(groupId: string, userId: string) {
  return apiRequest<{ groupId: string; userId: string; deleted: boolean }>(`/groups/${groupId}/members/${userId}`, { method: 'DELETE' });
}

export type GroupSummary = GroupOption & { createdAt: string; createdById: string };
export type GroupMember = { id: string; userId: string; role: 'ADMIN' | 'MEMBER'; createdAt: string; user: { id: string; name: string | null; email: string; avatarUrl?: string | null } };
export type GroupDetails = GroupSummary & { members: GroupMember[] };
export async function createGroup(name: string, description?: string) { const result=await apiRequest<GroupSummary>('/groups', { method: 'POST', body: JSON.stringify({ name, description }) }); emitGlobalToast({message:'Group created',messageAr:'تم إنشاء المجموعة'}); return result; }
export function getGroup(id: string) { return apiRequest<GroupDetails>(`/groups/${id}`); }
export async function updateGroup(id: string, body: { name?: string; description?: string | null }) { const result=await apiRequest<GroupDetails>(`/groups/${id}`, { method: 'PATCH', body: JSON.stringify(body) }); emitGlobalToast({message:'Group updated',messageAr:'تم تحديث المجموعة'}); return result; }
export async function deleteGroup(id: string) { const result=await apiRequest<{ id: string; deleted: boolean }>(`/groups/${id}`, { method: 'DELETE' }); emitGlobalToast({message:'Group deleted',messageAr:'تم حذف المجموعة'}); return result; }
export function listGroupMembers(id: string) { return apiRequest<GroupMember[]>(`/groups/${id}/members`); }
export async function updateGroupMemberRole(groupId: string, userId: string, role: 'ADMIN' | 'MEMBER') { const result=await apiRequest<GroupMember>(`/groups/${groupId}/members/${userId}`, { method: 'PATCH', body: JSON.stringify({ role }) }); emitGlobalToast({message:'Member role updated',messageAr:'تم تحديث دور العضو'}); return result; }
