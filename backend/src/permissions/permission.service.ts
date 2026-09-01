import { Inject, Injectable, Optional } from '@nestjs/common';
import { TeamFolderRole, OrgRole } from '@prisma/client';
import type { AccessTokenPayload } from '../auth/jwt.types';

export const TEAM_FOLDER_MEMBERSHIP = 'TEAM_FOLDER_MEMBERSHIP';

export type TeamFolderMembershipQuery = {
  userId: string;
  orgId: string;
  teamFolderId: string;
};

export type TeamFolderMembershipPort = {
  findRole(query: TeamFolderMembershipQuery): TeamFolderRole | null;
};

export type AccessibleResource = {
  orgId: string;
  ownerId: string;
  teamFolderId?: string | null;
  teamFolderRole?: TeamFolderRole | null;
  isPublicToOrg?: boolean;
};

export type ShareableResource = AccessibleResource;

const ASSIGNABLE_BY_ORGANIZER: ReadonlySet<TeamFolderRole> = new Set([
  TeamFolderRole.EDITOR,
  TeamFolderRole.VIEWER,
]);

@Injectable()
export class PermissionService {
  constructor(
    @Optional()
    @Inject(TEAM_FOLDER_MEMBERSHIP)
    private readonly membership: TeamFolderMembershipPort | null = null,
  ) {}

  canCreateTeamFolder(user: AccessTokenPayload): boolean {
    return user.role === OrgRole.ADMIN || user.role === OrgRole.SUPER_ADMIN;
  }

  canRead(user: AccessTokenPayload, resource: AccessibleResource): boolean {
    if (!this.isSameTenant(user, resource)) {
      return false;
    }
    // Privacy invariant (P0): personal (non-team-folder) resources are strictly
    // owner-only. Organization admins and super admins must NOT implicitly
    // read them — they only gain visibility through explicit shares or team
    // folder (workspace) membership.
    if (!this.isTeamFolderResource(resource)) {
      return user.sub === resource.ownerId;
    }
    if (this.isOrgSuperAdmin(user) || this.isOrgAdmin(user)) return true;
    return this.resolveTeamFolderRole(user, resource) !== null;
  }




  canWrite(user: AccessTokenPayload, resource: AccessibleResource): boolean {
  if (!this.isSameTenant(user, resource)) {
    return false;
  }

  // 1. الملفات الشخصية: المالك يملك صلاحية التعديل والحذف دائماً مهما كانت رتبته
  if (!this.isTeamFolderResource(resource)) {
    return user.sub === resource.ownerId;
  }

  // 2. ملفات الفرق: الأدمنز والسوبر أدمنز يملكون الصلاحية دائماً
  if (this.isOrgSuperAdmin(user) || this.isOrgAdmin(user)) {
    return true;
  }

  // 3. باقي الأعضاء في مجلدات الفرق حسب الأدوار المحددة
  const role = this.resolveTeamFolderRole(user, resource);
  return (
    role === TeamFolderRole.ADMIN ||
    role === TeamFolderRole.ORGANIZER ||
    role === TeamFolderRole.EDITOR
  );
}


  
  /*
  canWrite(user: AccessTokenPayload, resource: AccessibleResource): boolean {
    if (!this.isSameTenant(user, resource)) {
      return false;
    }
    // Personal resources are strictly owner-only (privacy invariant) — even
    // super admins cannot modify them unless explicitly shared/team-foldered.
    if (!this.isTeamFolderResource(resource)) {
      return (user.role === OrgRole.MEMBER || user.role === OrgRole.ADMIN) && user.sub === resource.ownerId;
    }
    if (this.isOrgSuperAdmin(user)) return true;
    if (this.isOrgAdmin(user)) return true;
    const role = this.resolveTeamFolderRole(user, resource);
    return (
      role === TeamFolderRole.ADMIN ||
      role === TeamFolderRole.ORGANIZER ||
      role === TeamFolderRole.EDITOR
    );
  }*/

  canShare(user: AccessTokenPayload, resource: AccessibleResource): boolean {
    if (!this.isSameTenant(user, resource)) return false;
    // Personal resources: only the owner (non-VIEWER) may share.
    if (!this.isTeamFolderResource(resource)) return user.role !== 'VIEWER' && user.sub === resource.ownerId;
    if (this.isOrgSuperAdmin(user)) return true;
    if (this.isOrgAdmin(user)) return true;
    const role = this.resolveTeamFolderRole(user, resource);
    return role === TeamFolderRole.ADMIN || role === TeamFolderRole.ORGANIZER || role === TeamFolderRole.EDITOR;
  }

  canComment(user: AccessTokenPayload, resource: AccessibleResource): boolean {
    if (!this.canRead(user, resource)) return false;
    if (!this.isTeamFolderResource(resource)) return user.sub === resource.ownerId;
    const role = this.resolveTeamFolderRole(user, resource);
    return role === TeamFolderRole.ADMIN || role === TeamFolderRole.ORGANIZER || role === TeamFolderRole.EDITOR || role === TeamFolderRole.COMMENTER;
  }

  canManageTeamFolder(
    user: AccessTokenPayload,
    resource: AccessibleResource,
  ): boolean {
    if (
      !this.isSameTenant(user, resource) ||
      !this.isTeamFolderResource(resource)
    ) {
      return false;
    }
    if (this.isOrgSuperAdmin(user) || this.isOrgAdmin(user)) return true;
    return this.resolveTeamFolderRole(user, resource) === TeamFolderRole.ADMIN;
  }

  canManageMembers(
    user: AccessTokenPayload,
    resource: AccessibleResource,
  ): boolean {
    if (
      !this.isSameTenant(user, resource) ||
      !this.isTeamFolderResource(resource)
    ) {
      return false;
    }
    if (this.isOrgSuperAdmin(user) || this.isOrgAdmin(user)) return true;
    const role = this.resolveTeamFolderRole(user, resource);
    return role === TeamFolderRole.ADMIN || role === TeamFolderRole.ORGANIZER;
  }

  canAssignTeamFolderRole(
    user: AccessTokenPayload,
    resource: AccessibleResource,
    targetRole: TeamFolderRole,
  ): boolean {
    if (!this.canManageMembers(user, resource)) {
      return false;
    }
    if (this.isOrgSuperAdmin(user) || this.isOrgAdmin(user)) return true;
    const actorRole = this.resolveTeamFolderRole(user, resource);
    if (actorRole === TeamFolderRole.ADMIN) {
      return true;
    }
    if (actorRole === TeamFolderRole.ORGANIZER) {
      return ASSIGNABLE_BY_ORGANIZER.has(targetRole);
    }
    return false;
  }

  isOrgAdmin(user: AccessTokenPayload): boolean {
    return user.role === OrgRole.ADMIN;
  }

  isOrgSuperAdmin(user: AccessTokenPayload): boolean {
    return user.role === OrgRole.SUPER_ADMIN;
  }

  isOrgAdminOrSuperAdmin(user: AccessTokenPayload): boolean {
    return user.role === OrgRole.ADMIN || user.role === OrgRole.SUPER_ADMIN;
  }

  private isSameTenant(
    user: AccessTokenPayload,
    resource: AccessibleResource,
  ): boolean {
    return user.org_id === resource.orgId;
  }

  private isTeamFolderResource(resource: AccessibleResource): boolean {
    return (
      typeof resource.teamFolderId === 'string' &&
      resource.teamFolderId.length > 0
    );
  }

  private resolveTeamFolderRole(
    user: AccessTokenPayload,
    resource: AccessibleResource,
  ): TeamFolderRole | null {
    if (Object.prototype.hasOwnProperty.call(resource, 'teamFolderRole')) {
      return resource.teamFolderRole ?? null;
    }
    if (!resource.teamFolderId || !this.membership) {
      return null;
    }
    return this.membership.findRole({
      userId: user.sub,
      orgId: user.org_id,
      teamFolderId: resource.teamFolderId,
    });
  }
}
