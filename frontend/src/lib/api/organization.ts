import { apiRequest, getApiBaseUrl } from './client';
export type OrgRole = 'SUPER_ADMIN' | 'ADMIN' | 'MEMBER';
export type Organization = { id: string; name: string; createdAt: string; members: number; pendingInvitations: number; role: OrgRole };
export type OrgMember = { id: string; userId?: string; name: string | null; email: string; role: OrgRole; status?: string; joinedAt?: string | null; createdAt: string; };
export type Invitation = { id: string; email: string; role: OrgRole; expiresAt: string; acceptedAt: string | null; revokedAt: string | null; createdAt: string; invitedBy: { id: string; name: string | null; email: string } };
export type InvitationCreated = { id: string; email: string; role: OrgRole; expiresAt: string; inviteUrl: string };
export type OrganizationAccount = { id: string; email: string; name: string | null; role: OrgRole };
export function getOrganization(){return apiRequest<Organization>('/organization');}
export function createOrganizationAccount(input: { name: string; email: string; password: string; role: OrgRole }): Promise<OrganizationAccount> {
  return apiRequest<OrganizationAccount>('/organization/accounts', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
export function updateOrganization(name:string){return apiRequest<{id:string;name:string;createdAt:string}>('/organization',{method:'PATCH',body:JSON.stringify({name})});}
export function listOrganizationMembers(){return apiRequest<OrgMember[]>('/organization/members');}
export function updateOrganizationMember(id:string,role:OrgRole){return apiRequest<OrgMember>(`/organization/members/${id}`,{method:'PATCH',body:JSON.stringify({role})});}
export function removeOrganizationMember(id:string){return apiRequest<{id:string;deleted:boolean}>(`/organization/members/${id}`,{method:'DELETE'});}
export function listOrganizationInvitations(){return apiRequest<Invitation[]>('/organization/invitations');}
export function inviteOrganizationMember(email:string,role:OrgRole){return apiRequest<InvitationCreated>('/organization/invitations',{method:'POST',body:JSON.stringify({email,role})});}
export function revokeOrganizationInvitation(id:string){return apiRequest<{id:string;revoked:boolean}>(`/organization/invitations/${id}`,{method:'DELETE'});}
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
  teamFolders: Array<{ id: string; name: string; role: string; isPublicToOrg: boolean }>;
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
export function suspendOrganizationMember(id: string) {
  return apiRequest<{ id: string; suspended: boolean }>(`/organization/members/${id}/suspend`, { method: 'POST' });
}
export function activateOrganizationMember(id: string) {
  return apiRequest<{ id: string; activated: boolean }>(`/organization/members/${id}/activate`, { method: 'POST' });
}
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
