import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { TeamFolderRole, MembershipStatus } from '@prisma/client';
import {
  TEAM_FOLDER_ERRORS,
  isPrismaUniqueConstraintError,
} from './team-folder.errors';
import type { AccessTokenPayload } from '../auth/jwt.types';
import {
  PermissionService,
  type AccessibleResource,
} from '../permissions/permission.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateTeamFolderInput } from './create-team-folder.schema';
import type {
  AddTeamFolderMemberInput,
  UpdateTeamFolderMemberInput,
} from './membership.schema';

export type TeamFolderListItem = {
  id: string;
  name: string;
  rootFolderId: string | null;
  role: TeamFolderRole | 'ORG_ADMIN';
};

type ReadableTeamFolder = {
  folder: { id: string; orgId: string; name: string; isPublicToOrg?: boolean };
  role: TeamFolderRole | null;
  resource: AccessibleResource;
};

@Injectable()
export class TeamFoldersService {
  private readonly logger = new Logger(TeamFoldersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
  ) {}

  async create(user: AccessTokenPayload, input: CreateTeamFolderInput) {
    if (!this.permissions.canCreateTeamFolder(user)) {
      throw new ForbiddenException('Not allowed to create a Team Folder');
    }
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.teamFolder.create({
        data: {
          name: input.name,
          orgId: user.org_id,
        },
      });
      const root = await tx.folder.create({
        data: {
          name: input.name,
          orgId: user.org_id,
          teamFolderId: created.id,
          parentId: null,
          ownerId: user.sub,
        },
      });
      await tx.auditLog.create({
        data: {
          orgId: user.org_id,
          actorId: user.sub,
          action: 'TEAM_FOLDER_CREATED',
          resourceType: 'TEAM_FOLDER',
          resourceId: created.id,
        },
      });
      return {
        id: created.id,
        orgId: created.orgId,
        name: created.name,
        rootFolderId: root.id,
      };
    });
  }

  async list(
    user: AccessTokenPayload,
  ): Promise<{ teamFolders: TeamFolderListItem[] }> {
    const folders = await this.prisma.teamFolder.findMany({ where: { orgId: user.org_id } });
    const visible: TeamFolderListItem[] = [];
    for (const folder of folders) {
      const role = await this.resolveCallerRole(user, folder.id);
      if (
        !this.permissions.canRead(
          user,
          this.toAccessibleResource(folder.orgId, folder.id, role, folder.isPublicToOrg),
        )
      ) {
        continue;
      }
      visible.push({
        id: folder.id,
        name: folder.name,
        rootFolderId: await this.findRootFolderId(folder.id),
        role: (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') ? 'ORG_ADMIN' : (role as TeamFolderRole),
      });
    }
    return { teamFolders: visible };
  }

  async getById(user: AccessTokenPayload, id: string) {
    const { folder, role } = await this.requireReadableTeamFolder(user, id);
    return this.toTeamFolderResponse(folder, role, user);
  }

  async rename(user: AccessTokenPayload, id: string, name: string) {
    const { folder, role, resource } = await this.requireReadableTeamFolder(
      user,
      id,
    );
    if (!this.permissions.canManageTeamFolder(user, resource)) {
      throw new ForbiddenException('Not allowed to rename this Team Folder');
    }
    const updated = await this.prisma.teamFolder.update({
      where: { id: folder.id },
      data: { name },
    });
    await this.prisma.auditLog.create({
      data: {
        orgId: user.org_id,
        actorId: user.sub,
        action: 'TEAM_FOLDER_RENAMED',
        resourceType: 'TEAM_FOLDER',
        resourceId: folder.id,
      },
    });
    return this.toTeamFolderResponse(updated, role, user);
  }

  async remove(user: AccessTokenPayload, id: string) {
    const { folder, resource } = await this.requireReadableTeamFolder(user, id);
    if (!this.permissions.canManageTeamFolder(user, resource)) {
      throw new ForbiddenException('Not allowed to delete this Team Folder');
    }
    await this.assertTeamFolderEmpty(folder.id);
    await this.prisma.$transaction(async (tx) => {
      await tx.teamFolderMember.deleteMany({
        where: { teamFolderId: folder.id },
      });
      await tx.folder.deleteMany({ where: { teamFolderId: folder.id } });
      await tx.teamFolder.delete({ where: { id: folder.id } });
      await tx.auditLog.create({
        data: {
          orgId: user.org_id,
          actorId: user.sub,
          action: 'TEAM_FOLDER_DELETED',
          resourceType: 'TEAM_FOLDER',
          resourceId: folder.id,
        },
      });
    });
    return { id: folder.id, deleted: true };
  }

  async listMembers(user: AccessTokenPayload, id: string) {
    const { folder } = await this.requireReadableTeamFolder(user, id);
    const rows = await this.prisma.teamFolderMember.findMany({
      where: { teamFolderId: folder.id },
      include: { user: { select: { email: true } } },
    });
    return {
      members: rows.map((row) => ({
        userId: row.userId,
        email: row.user.email,
        role: row.role,
      })),
    };
  }

  async addMember(
    user: AccessTokenPayload,
    id: string,
    input: AddTeamFolderMemberInput,
  ) {
    const logContext = JSON.stringify({
      operation: 'addMember',
      actorId: user.sub,
      orgId: user.org_id,
      teamFolderId: id,
      targetUserId: input.userId,
      requestedRole: input.role,
    });
    this.logger.log(`Team Folder member assignment started ${logContext}`);
    try {
      const { folder, resource } = await this.requireReadableTeamFolder(user, id);
      this.assertCanManageMembers(user, resource);
      this.assertCanAssignRole(user, resource, input.role);
      const target = await this.requireSameOrgUser(
        user,
        folder.orgId,
        input.userId,
      );

      // Idempotency: intercept duplicate assignments up front so callers get
      // a clear MEMBER_ALREADY_EXISTS response instead of an unhandled
      // unique-constraint exception ("تعذر إكمال الطلب").
      const existing = await this.prisma.teamFolderMember.findFirst({
        where: { teamFolderId: folder.id, userId: target.id },
      });
      if (existing) {
        this.logger.warn(
          `Duplicate Team Folder membership suppressed ${JSON.stringify({ operation: 'addMember', teamFolderId: folder.id, userId: target.id })}`,
        );
        throw new ConflictException(TEAM_FOLDER_ERRORS.MEMBER_ALREADY_EXISTS);
      }

      // Atomic write: membership insert + audit entry commit or roll back
      // together, preventing half-applied membership states.
      const created = await this.prisma.$transaction(async (tx) => {
        const member = await tx.teamFolderMember.create({
          data: {
            teamFolderId: folder.id,
            userId: target.id,
            orgId: folder.orgId,
            role: input.role,
          },
        });
        await tx.auditLog.create({
          data: {
            orgId: user.org_id,
            actorId: user.sub,
            action: 'TEAM_FOLDER_MEMBER_ADDED',
            resourceType: 'TEAM_FOLDER',
            resourceId: folder.id,
          },
        });
        return member;
      });

      this.logger.log(
        `Team Folder member assigned ${JSON.stringify({ operation: 'addMember', teamFolderId: folder.id, userId: created.userId, role: created.role })}`,
      );
      return {
        teamFolderId: folder.id,
        userId: created.userId,
        role: created.role,
      };
    } catch (error) {
      if (isPrismaUniqueConstraintError(error)) {
        // Race fallback: the same membership was inserted between the
        // pre-check and the write. Surface it as a friendly conflict.
        this.logger.warn(
          `Duplicate Team Folder membership suppressed (unique constraint) ${logContext}`,
        );
        throw new ConflictException(TEAM_FOLDER_ERRORS.MEMBER_ALREADY_EXISTS);
      }
      this.logger.error(
        `Team Folder member assignment failed ${logContext} error=${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`,
      );
      throw error;
    }
  }

  async updateMember(
    user: AccessTokenPayload,
    id: string,
    userId: string,
    input: UpdateTeamFolderMemberInput,
  ) {
    const { folder, resource } = await this.requireReadableTeamFolder(user, id);
    this.assertCanManageMembers(user, resource);
    const membership = await this.requireMembership(folder.id, userId);
    this.assertCanChangeExistingRole(user, resource, membership.role);
    this.assertCanAssignRole(user, resource, input.role);
    await this.assertNotLastAdmin(folder.id, membership.role, input.role);
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const row = await tx.teamFolderMember.update({
          where: {
            teamFolderId_userId: {
              teamFolderId: folder.id,
              userId: membership.userId,
            },
          },
          data: { role: input.role },
        });
        await tx.auditLog.create({
          data: {
            orgId: user.org_id,
            actorId: user.sub,
            action: 'TEAM_FOLDER_MEMBER_UPDATED',
            resourceType: 'TEAM_FOLDER',
            resourceId: folder.id,
          },
        });
        return row;
      });
      this.logger.log(
        `Team Folder member role updated ${JSON.stringify({ operation: 'updateMember', teamFolderId: folder.id, userId: updated.userId, role: updated.role })}`,
      );
      return {
        teamFolderId: folder.id,
        userId: updated.userId,
        role: updated.role,
      };
    } catch (error) {
      if (isPrismaUniqueConstraintError(error)) {
        throw new ConflictException(TEAM_FOLDER_ERRORS.MEMBER_ALREADY_EXISTS);
      }
      this.logger.error(
        `Team Folder member role update failed ${JSON.stringify({ operation: 'updateMember', teamFolderId: folder.id, userId })} error=${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`,
      );
      throw error;
    }
  }

  async removeMember(user: AccessTokenPayload, id: string, userId: string) {
    const { folder, resource } = await this.requireReadableTeamFolder(user, id);
    this.assertCanManageMembers(user, resource);
    const membership = await this.requireMembership(folder.id, userId);
    this.assertCanChangeExistingRole(user, resource, membership.role);
    await this.assertNotLastAdmin(folder.id, membership.role, null);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.teamFolderMember.delete({
          where: {
            teamFolderId_userId: {
              teamFolderId: folder.id,
              userId: membership.userId,
            },
          },
        });
        await tx.auditLog.create({
          data: {
            orgId: user.org_id,
            actorId: user.sub,
            action: 'TEAM_FOLDER_MEMBER_REMOVED',
            resourceType: 'TEAM_FOLDER',
            resourceId: folder.id,
          },
        });
      });
      this.logger.log(
        `Team Folder member removed ${JSON.stringify({ operation: 'removeMember', teamFolderId: folder.id, userId: membership.userId })}`,
      );
    } catch (error) {
      this.logger.error(
        `Team Folder member removal failed ${JSON.stringify({ operation: 'removeMember', teamFolderId: folder.id, userId })} error=${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`,
      );
      throw error;
    }
    return {
      teamFolderId: folder.id,
      userId: membership.userId,
      deleted: true,
    };
  }

  private async requireReadableTeamFolder(
    user: AccessTokenPayload,
    id: string,
  ): Promise<ReadableTeamFolder> {
    const folder = await this.prisma.teamFolder.findFirst({ where: { id, orgId: user.org_id } });
    if (!folder) {
      throw new NotFoundException(TEAM_FOLDER_ERRORS.FOLDER_NOT_FOUND);
    }
    const role = await this.resolveCallerRole(user, folder.id);
    const resource = this.toAccessibleResource(folder.orgId, folder.id, role, folder.isPublicToOrg);
    if (!this.permissions.canRead(user, resource)) {
      throw new NotFoundException(TEAM_FOLDER_ERRORS.FOLDER_NOT_FOUND);
    }
    return { folder, role, resource };
  }

  private assertCanManageMembers(
    user: AccessTokenPayload,
    resource: AccessibleResource,
  ): void {
    if (!this.permissions.canManageMembers(user, resource)) {
      throw new ForbiddenException(TEAM_FOLDER_ERRORS.INSUFFICIENT_PERMISSIONS);
    }
  }

  private assertCanAssignRole(
    user: AccessTokenPayload,
    resource: AccessibleResource,
    role: TeamFolderRole,
  ): void {
    if (!this.permissions.canAssignTeamFolderRole(user, resource, role)) {
      throw new BadRequestException(
        TEAM_FOLDER_ERRORS.ROLE_ASSIGNMENT_FORBIDDEN,
      );
    }
  }

  private assertCanChangeExistingRole(
    user: AccessTokenPayload,
    resource: AccessibleResource,
    currentRole: TeamFolderRole,
  ): void {
    if (
      !this.permissions.canAssignTeamFolderRole(user, resource, currentRole)
    ) {
      throw new BadRequestException(
        TEAM_FOLDER_ERRORS.ROLE_ASSIGNMENT_FORBIDDEN,
      );
    }
  }

  private async requireSameOrgUser(
    user: AccessTokenPayload,
    teamFolderOrgId: string,
    userId: string,
  ) {
    const target = await this.prisma.user.findFirst({ where: { id: userId } });
    if (!target) {
      throw new NotFoundException(TEAM_FOLDER_ERRORS.USER_NOT_FOUND);
    }
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { userId: target.id, organizationId: user.org_id, status: MembershipStatus.ACTIVE },
    });
    if (!membership || membership.organizationId !== teamFolderOrgId) {
      throw new NotFoundException(TEAM_FOLDER_ERRORS.USER_NOT_IN_ORGANIZATION);
    }
    return target;
  }

  private async requireMembership(teamFolderId: string, userId: string) {
    const membership = await this.prisma.teamFolderMember.findFirst({
      where: { teamFolderId, userId },
    });
    if (!membership) {
      throw new NotFoundException(TEAM_FOLDER_ERRORS.MEMBER_NOT_FOUND);
    }
    return membership;
  }

  private async assertNotLastAdmin(
    teamFolderId: string,
    currentRole: TeamFolderRole,
    nextRole: TeamFolderRole | null,
  ): Promise<void> {
    if (currentRole !== TeamFolderRole.ADMIN) {
      return;
    }
    if (nextRole === TeamFolderRole.ADMIN) {
      return;
    }
    const adminCount = await this.prisma.teamFolderMember.count({
      where: { teamFolderId, role: TeamFolderRole.ADMIN },
    });
    if (adminCount <= 1) {
      throw new BadRequestException(TEAM_FOLDER_ERRORS.LAST_FOLDER_ADMIN);
    }
  }

  private async assertTeamFolderEmpty(teamFolderId: string): Promise<void> {
    const childFolder = await this.prisma.folder.findFirst({
      where: { teamFolderId, parentId: { not: null } },
    });
    const folders = await this.prisma.folder.findMany({
      where: { teamFolderId },
      select: { id: true },
    });
    const file =
      folders.length === 0
        ? null
        : await this.prisma.file.findFirst({
            where: { folderId: { in: folders.map((row) => row.id) } },
          });
    if (childFolder || file) {
      throw new BadRequestException('Team Folder is not empty');
    }
  }

  private async auditMemberChange(
    user: AccessTokenPayload,
    teamFolderId: string,
    action:
      | 'TEAM_FOLDER_MEMBER_ADDED'
      | 'TEAM_FOLDER_MEMBER_UPDATED'
      | 'TEAM_FOLDER_MEMBER_REMOVED',
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        orgId: user.org_id,
        actorId: user.sub,
        action,
        resourceType: 'TEAM_FOLDER',
        resourceId: teamFolderId,
      },
    });
  }

  private async toTeamFolderResponse(
    folder: { id: string; orgId: string; name: string; isPublicToOrg?: boolean },
    role: TeamFolderRole | null,
    user: AccessTokenPayload,
  ) {
    return {
      id: folder.id,
      orgId: folder.orgId,
      name: folder.name,
      rootFolderId: await this.findRootFolderId(folder.id),
      role: (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') ? 'ORG_ADMIN' : (role as TeamFolderRole),
    };
  }

  private async resolveCallerRole(
    user: AccessTokenPayload,
    teamFolderId: string,
  ): Promise<TeamFolderRole | null> {
    const membership = await this.prisma.teamFolderMember.findFirst({
      where: { teamFolderId, userId: user.sub },
    });
    return membership?.role ?? null;
  }

  private async findRootFolderId(teamFolderId: string): Promise<string | null> {
    const root = await this.prisma.folder.findFirst({
      where: { teamFolderId, parentId: null },
    });
    return root?.id ?? null;
  }

  private toAccessibleResource(
    orgId: string,
    teamFolderId: string,
    teamFolderRole: TeamFolderRole | null,
    isPublicToOrg = false,
  ): AccessibleResource {
    return {
      orgId,
      ownerId: teamFolderId,
      teamFolderId,
      teamFolderRole,
      isPublicToOrg,
    };
  }
}
