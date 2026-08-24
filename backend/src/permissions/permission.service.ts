import { Inject, Injectable, Optional } from '@nestjs/common';
import { TeamFolderRole } from '@prisma/client';
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

/** @deprecated Use AccessibleResource. Kept so existing call sites keep compiling. */
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
    return user.role === 'ADMIN';
  }

  canRead(user: AccessTokenPayload, resource: AccessibleResource): boolean {
    if (!this.isSameTenant(user, resource)) {
      return false;
    }
    if (this.isOrgAdmin(user)) {
      return true;
    }
    if (!this.isTeamFolderResource(resource)) {
      return true;
    }
    return this.resolveTeamFolderRole(user, resource) !== null;
  }

  canWrite(user: AccessTokenPayload, resource: AccessibleResource): boolean {
    if (!this.isSameTenant(user, resource)) {
      return false;
    }
    if (this.isOrgAdmin(user)) {
      return true;
    }
    if (!this.isTeamFolderResource(resource)) {
      return user.role === 'MEMBER' && user.sub === resource.ownerId;
    }
    const role = this.resolveTeamFolderRole(user, resource);
    return (
      role === TeamFolderRole.ADMIN ||
      role === TeamFolderRole.ORGANIZER ||
      role === TeamFolderRole.EDITOR
    );
  }

  canShare(user: AccessTokenPayload, resource: AccessibleResource): boolean {
    return this.canWrite(user, resource);
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
    if (this.isOrgAdmin(user)) {
      return true;
    }
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
    if (this.isOrgAdmin(user)) {
      return true;
    }
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
    if (this.isOrgAdmin(user)) {
      return true;
    }
    const actorRole = this.resolveTeamFolderRole(user, resource);
    if (actorRole === TeamFolderRole.ADMIN) {
      return true;
    }
    if (actorRole === TeamFolderRole.ORGANIZER) {
      return ASSIGNABLE_BY_ORGANIZER.has(targetRole);
    }
    return false;
  }

  private isSameTenant(
    user: AccessTokenPayload,
    resource: AccessibleResource,
  ): boolean {
    return user.org_id === resource.orgId;
  }

  private isOrgAdmin(user: AccessTokenPayload): boolean {
    return user.role === 'ADMIN';
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
    void resource.isPublicToOrg;

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
