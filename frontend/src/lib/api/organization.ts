import { apiRequest } from './client';
export type OrgRole = 'SUPER_ADMIN' | 'ADMIN' | 'MEMBER';
export type OrgMemberStatus = 'ACTIVE' | 'SUSPENDED' | 'PENDING' | 'REMOVED';
export type Organization = { id: string; name: string; createdAt: string; members: number; pendingInvitations: number; role: OrgRole };
export type OrgMember = {
  id: string;
  userId: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  role: OrgRole;
  status: OrgMemberStatus;
  createdAt?: string;
  joinedAt: string;
};
export type Invitation = { id: string; email: string; role: OrgRole; expiresAt: string; acceptedAt: string | null; revokedAt: string | null; createdAt: string; invitedBy: { id: string; name: string | null; email: string } };
export type InvitationCreated = { id: string; email: string; role: OrgRole; expiresAt: string; inviteUrl: string };
export function getOrganization(){return apiRequest<Organization>('/organization');}
export function updateOrganization(name:string){return apiRequest<{id:string;name:string;createdAt:string}>('/organization',{method:'PATCH',body:JSON.stringify({name})});}
export function listOrganizationMembers(options?: { status?: OrgMemberStatus }): Promise<OrgMember[]> {
  const query = options?.status ? `?status=${encodeURIComponent(options.status)}` : '';
  return apiRequest<OrgMember[]>(`/organization/members${query}`);
}
/**
 * Creates a brand-new user account inside the current organization.
 * RBAC: only organization Super Admins are permitted; anything else yields a
 * 403 FORBIDDEN_NOT_SUPER_ADMIN response carrying the localized denial message.
 */
export function createOrganizationAccount(input:{name:string;email:string;password:string;role:'MEMBER'|'ADMIN'}){return apiRequest<{id:string;email:string;name:string|null;role:OrgRole}>('/organization/accounts',{method:'POST',body:JSON.stringify(input)});}
export function updateOrganizationMember(id:string,role:OrgRole){return apiRequest<OrgMember>(`/organization/members/${id}`,{method:'PATCH',body:JSON.stringify({role})});}
export function removeOrganizationMember(id:string){return apiRequest<{id:string;removed:boolean;dataTransferInitiated:boolean}>(`/organization/members/${id}`,{method:'DELETE'});}
export function listOrganizationInvitations(){return apiRequest<Invitation[]>('/organization/invitations');}
export function inviteOrganizationMember(email:string,role:OrgRole){return apiRequest<InvitationCreated>('/organization/invitations',{method:'POST',body:JSON.stringify({email,role})});}
export function revokeOrganizationInvitation(id:string){return apiRequest<{id:string;revoked:boolean}>(`/organization/invitations/${id}`,{method:'DELETE'});}
export function acceptOrganizationInvitation(token:string){return apiRequest<{accepted:boolean;organizationId:string;role:OrgRole}>('/organization/invitations/accept',{method:'POST',body:JSON.stringify({token})});}
export function validateOrganizationInvitation(token:string){return fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001'}/organization/invitations/validate?token=${encodeURIComponent(token)}`).then(async r=>{if(!r.ok) throw new Error(await r.text());return r.json() as Promise<{email:string;role:OrgRole;expiresAt:string;organization:{id:string;name:string}}>});}
