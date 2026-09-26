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
import type { UpdateTeamFolderSettingsInput } from './settings.schema';
import type {
  AddTeamFolderMemberInput,
  UpdateTeamFolderMemberInput,
} from './membership.schema';

export type TeamFolderListItem = {
  id: string;
  name: string;
  rootFolderId: string | null;
  role: TeamFolderRole | 'ORG_ADMIN' | null;
  memberCount: number;
  isMember: boolean;
  isPublicToOrg: boolean;
  /** Latest activity across the folder tree (folders + active files). */
  updatedAt: string | null;
  /** Summed byte size of active files in the folder tree. */
  totalSize: number | null;
};

type ReadableTeamFolder = {
  folder: { id: string; orgId: string; name: string; isPublicToOrg?: boolean; allowExternalSharing?: boolean; allowViewerDownloads?: boolean; archivedAt?: Date | null };
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
      let creatorPolicy = 'ADMINS_ONLY';
      try {
        const rows = await this.prisma.$queryRawUnsafe<any[]>(`SELECT ${input.isPublicToOrg === true ? 'public_team_folder_creator' : 'private_team_folder_creator'} AS creatorPolicy FROM admin_console_settings WHERE org_id=? LIMIT 1`, user.org_id);
        creatorPolicy = rows[0]?.creatorPolicy ?? 'ADMINS_ONLY';
      } catch { /* legacy databases fall back to the original admin-only rule */ }
      if (creatorPolicy !== 'ANYONE') throw new ForbiddenException('Not allowed to create this Team Folder');
    }
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.teamFolder.create({
        data: {
          name: input.name,
          orgId: user.org_id,
          ...(input.isPublicToOrg === true ? { isPublicToOrg: true } : {}),
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
      await tx.teamFolderMember.create({
        data: {
          teamFolderId: created.id,
          userId: user.sub,
          orgId: user.org_id,
          role: TeamFolderRole.ADMIN,
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
    const folders = await this.prisma.teamFolder.findMany({
      where: { orgId: user.org_id },
      include: { _count: { select: { members: true } } },
    });
    const visible: TeamFolderListItem[] = [];
    for (const folder of folders) {
      const role = await this.resolveCallerRole(user, folder.id);
      const isOrgAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
      const isMember = role !== null || isOrgAdmin;
      const canRead = this.permissions.canRead(
        user,
        this.toAccessibleResource(folder.orgId, folder.id, role, folder.isPublicToOrg),
      );
      // Public Team Folders are discoverable by every active organization member.
      // They remain read-protected until the member explicitly joins them.
      if (!canRead && !folder.isPublicToOrg) {
        continue;
      }
      const stats = await this.computeTeamFolderStats(folder.id);
      visible.push({
        id: folder.id,
        name: folder.name,
        rootFolderId: await this.findRootFolderId(folder.id),
        role: isOrgAdmin ? 'ORG_ADMIN' : role,
        memberCount: folder._count.members,
        isMember,
        isPublicToOrg: folder.isPublicToOrg,
        updatedAt: stats.updatedAt,
        totalSize: stats.totalSize,
      });
    }
    return { teamFolders: visible };
  }

  /**
   * Last Modified / File Size for the Team Folders table. The TeamFolder
   * model carries no timestamps, so both values derive from the folder tree:
   * the newest folder/file update and the summed size of active files.
   */
  private async computeTeamFolderStats(
    teamFolderId: string,
  ): Promise<{ updatedAt: string | null; totalSize: number | null }> {
    const folders = await this.prisma.folder.findMany({
      where: { teamFolderId },
      select: { updatedAt: true },
    });
    const fileAggregate = await this.prisma.file.aggregate({
      _max: { updatedAt: true },
      _sum: { size: true },
      where: {
        folder: { teamFolderId },
        deletedAt: null,
        status: 'ACTIVE',
      },
    });
    const candidates: Date[] = folders.map((row) => row.updatedAt);
    if (fileAggregate._max.updatedAt) candidates.push(fileAggregate._max.updatedAt);
    const latest = candidates.length > 0 ? new Date(Math.max(...candidates.map((d) => d.getTime()))) : null;
    const summedSize = fileAggregate._sum.size;
    return {
      updatedAt: latest ? latest.toISOString() : null,
      totalSize: summedSize === null ? null : Number(summedSize),
    };
  }

  /** Join a public Team Folder as a normal organization member. */
  async join(user: AccessTokenPayload, id: string) {
    const folder = await this.prisma.teamFolder.findFirst({
      where: { id, orgId: user.org_id },
    });
    if (!folder) throw new NotFoundException(TEAM_FOLDER_ERRORS.FOLDER_NOT_FOUND);
    if (folder.archivedAt) throw new ForbiddenException('Team Folder is archived and read-only');

    const organizationMembership = await this.prisma.organizationMembership.findFirst({
      where: { userId: user.sub, organizationId: user.org_id, status: MembershipStatus.ACTIVE },
    });
    if (!organizationMembership) {
      throw new ForbiddenException(TEAM_FOLDER_ERRORS.USER_NOT_IN_ORGANIZATION);
    }

    if (!folder.isPublicToOrg) {
      throw new ForbiddenException(TEAM_FOLDER_ERRORS.PUBLIC_JOIN_DISABLED);
    }

    const existing = await this.prisma.teamFolderMember.findFirst({
      where: { teamFolderId: folder.id, userId: user.sub },
    });
    if (existing) {
      return { teamFolderId: folder.id, userId: user.sub, role: existing.role, joined: false, alreadyMember: true };
    }

    try {
      const member = await this.prisma.$transaction(async (tx) => {
        const created = await tx.teamFolderMember.create({
          data: {
            teamFolderId: folder.id,
            userId: user.sub,
            orgId: user.org_id,
            role: TeamFolderRole.VIEWER,
          },
        });
        await tx.auditLog.create({
          data: {
            orgId: user.org_id,
            actorId: user.sub,
            action: 'TEAM_FOLDER_MEMBER_ADDED',
            resourceType: 'TEAM_FOLDER',
            resourceId: folder.id,
            metadata: { source: 'public-team-folder-join', role: TeamFolderRole.VIEWER },
          },
        });
        return created;
      });
      return { teamFolderId: folder.id, userId: member.userId, role: member.role, joined: true, alreadyMember: false };
    } catch (error) {
      if (isPrismaUniqueConstraintError(error)) {
        const current = await this.prisma.teamFolderMember.findFirst({ where: { teamFolderId: folder.id, userId: user.sub } });
        if (current) return { teamFolderId: folder.id, userId: current.userId, role: current.role, joined: false, alreadyMember: true };
      }
      throw error;
    }
  }

  async getById(user: AccessTokenPayload, id: string) {
    const { folder, role } = await this.requireReadableTeamFolder(user, id);
    return this.toTeamFolderResponse(folder, role, user);
  }

  async updateSettings(user: AccessTokenPayload, id: string, input: UpdateTeamFolderSettingsInput) {
    const { folder, role, resource } = await this.requireReadableTeamFolder(user, id);
    this.assertNotArchived(folder);
    if (!this.permissions.canManageTeamFolder(user, resource)) {
      throw new ForbiddenException('Not allowed to manage Team Folder settings');
    }
    const updated = await this.prisma.teamFolder.update({
      where: { id: folder.id },
      data: input,
    });
    await this.prisma.auditLog.create({
      data: {
        orgId: user.org_id,
        actorId: user.sub,
        action: 'TEAM_FOLDER_SETTINGS_UPDATED',
        resourceType: 'TEAM_FOLDER',
        resourceId: folder.id,
        metadata: input,
      },
    });
    return this.toTeamFolderResponse(updated, role, user);
  }

  async rename(user: AccessTokenPayload, id: string, name: string) {
    const { folder, role, resource } = await this.requireReadableTeamFolder(
      user,
      id,
    );
    this.assertNotArchived(folder);
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

  async archive(user: AccessTokenPayload, id: string) {
    const { folder, resource } = await this.requireReadableTeamFolder(user, id);
    if (!this.permissions.canManageTeamFolder(user, resource)) {
      throw new ForbiddenException('Not allowed to archive this Team Folder');
    }
    if (folder.archivedAt) return this.toTeamFolderResponse(folder, await this.resolveCallerRole(user, id), user);
    const updated = await this.prisma.teamFolder.update({ where: { id: folder.id }, data: { archivedAt: new Date() } });
    await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'TEAM_FOLDER_ARCHIVED', resourceType: 'TEAM_FOLDER', resourceId: folder.id } });
    return this.toTeamFolderResponse(updated, await this.resolveCallerRole(user, id), user);
  }

  async restore(user: AccessTokenPayload, id: string) {
    const { folder, resource } = await this.requireReadableTeamFolder(user, id);
    if (!this.permissions.canManageTeamFolder(user, resource)) {
      throw new ForbiddenException('Not allowed to restore this Team Folder');
    }
    if (!folder.archivedAt) return this.toTeamFolderResponse(folder, await this.resolveCallerRole(user, id), user);
    const updated = await this.prisma.teamFolder.update({ where: { id: folder.id }, data: { archivedAt: null } });
    await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'TEAM_FOLDER_RESTORED', resourceType: 'TEAM_FOLDER', resourceId: folder.id } });
    return this.toTeamFolderResponse(updated, await this.resolveCallerRole(user, id), user);
  }

  async remove(user: AccessTokenPayload, id: string) {
    const { folder, resource } = await this.requireReadableTeamFolder(user, id);
    this.assertNotArchived(folder);
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

  async listActivity(user: AccessTokenPayload, id: string) {
    const { folder } = await this.requireReadableTeamFolder(user, id);
    const { folderIds, fileIds } = await this.collectTreeIds(folder.id);
    return this.prisma.auditLog.findMany({
      where: {
        orgId: user.org_id,
        OR: [
          { resourceType: 'TEAM_FOLDER', resourceId: folder.id },
          { resourceType: 'FOLDER', resourceId: { in: folderIds } },
          { resourceType: 'FILE', resourceId: { in: fileIds } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { actor: { select: { id: true, name: true, email: true } } },
    });
  }

  async listTrash(user: AccessTokenPayload, id: string) {
    const { folder } = await this.requireReadableTeamFolder(user, id);
    const { folderIds, fileIds } = await this.collectTreeIds(folder.id);
    return this.prisma.trashEntry.findMany({
      where: {
        orgId: user.org_id,
        restoredAt: null,
        OR: [
          { folderId: { in: folderIds } },
          { fileId: { in: fileIds } },
        ],
      },
      orderBy: { deletedAt: 'desc' },
      take: 100,
      include: {
        file: { select: { id: true, name: true, size: true, mimeType: true } },
        folder: { select: { id: true, name: true } },
        deletedBy: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async listShared(user: AccessTokenPayload, id: string) {
    const { folder, role, resource } = await this.requireReadableTeamFolder(user, id);
    if (!this.permissions.canShare(user, resource)) {
      throw new ForbiddenException('Not allowed to manage shared items in this Team Folder');
    }
    const { folderIds, fileIds } = await this.collectTreeIds(folder.id);
    const [fileShares, folderShares] = await Promise.all([
      this.prisma.fileShare.findMany({
        where: { orgId: user.org_id, status: 'ACTIVE', fileId: { in: fileIds } },
        include: { file: { select: { id: true, name: true, mimeType: true, size: true } }, recipients: { include: { user: { select: { id: true, name: true, email: true } } } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.folderShare.findMany({
        where: { orgId: user.org_id, status: 'ACTIVE', folderId: { in: folderIds } },
        include: { folder: { select: { id: true, name: true } }, recipients: { include: { user: { select: { id: true, name: true, email: true } } } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return [
      ...fileShares.map((share) => ({ id: share.id, resourceType: 'FILE', resourceId: share.fileId, name: share.file.name, mimeType: share.file.mimeType, size: Number(share.file.size), permission: share.permission, canDownload: share.canDownload, expiresAt: share.expiresAt, createdAt: share.createdAt, recipients: share.recipients.map((row) => row.user) })),
      ...folderShares.map((share) => ({ id: share.id, resourceType: 'FOLDER', resourceId: share.folderId, name: share.folder.name, permission: share.permission, canDownload: share.canDownload, expiresAt: share.expiresAt, createdAt: share.createdAt, recipients: share.recipients.map((row) => row.user) })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async listMembers(user: AccessTokenPayload, id: string) {
    const { folder } = await this.requireReadableTeamFolder(user, id);
    const [rows, groups] = await Promise.all([
      this.prisma.teamFolderMember.findMany({
        where: { teamFolderId: folder.id },
        include: { user: { select: { email: true } } },
      }),
      this.prisma.teamFolderGroup.findMany({
        where: { teamFolderId: folder.id },
        include: { group: { select: { id: true, name: true, description: true, _count: { select: { members: true } } } } },
      }),
    ]);
    return {
      members: rows.map((row) => ({ userId: row.userId, email: row.user.email, role: row.role })),
      groups: groups.map((row) => ({ groupId: row.groupId, name: row.group.name, description: row.group.description, memberCount: row.group._count.members, role: row.role })),
    };
  }

  async addGroup(
    user: AccessTokenPayload,
    id: string,
    groupId: string,
    role: TeamFolderRole,
  ) {
    const { folder, resource } = await this.requireReadableTeamFolder(user, id);
    this.assertNotArchived(folder);
    this.assertCanManageMembers(user, resource);
    this.assertCanAssignRole(user, resource, role);
    const group = await this.prisma.group.findFirst({ where: { id: groupId, orgId: folder.orgId } });
    if (!group) throw new NotFoundException('Group not found');
    const existing = await this.prisma.teamFolderGroup.findUnique({ where: { teamFolderId_groupId: { teamFolderId: folder.id, groupId } } });
    if (existing) throw new ConflictException('Group is already assigned to this Team Folder');
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.teamFolderGroup.create({ data: { teamFolderId: folder.id, groupId, orgId: folder.orgId, role } });
      await tx.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'TEAM_FOLDER_GROUP_ADDED', resourceType: 'TEAM_FOLDER', resourceId: folder.id, metadata: { groupId, role } } });
      return row;
    });
    return { teamFolderId: created.teamFolderId, groupId: created.groupId, role: created.role };
  }

  async updateGroup(user: AccessTokenPayload, id: string, groupId: string, role: TeamFolderRole) {
    const { folder, resource } = await this.requireReadableTeamFolder(user, id);
    this.assertNotArchived(folder);
    this.assertCanManageMembers(user, resource);
    this.assertCanAssignRole(user, resource, role);
    const existing = await this.prisma.teamFolderGroup.findUnique({ where: { teamFolderId_groupId: { teamFolderId: folder.id, groupId } } });
    if (!existing) throw new NotFoundException('Team Folder group membership not found');
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.teamFolderGroup.update({ where: { teamFolderId_groupId: { teamFolderId: folder.id, groupId } }, data: { role } });
      await tx.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'TEAM_FOLDER_GROUP_UPDATED', resourceType: 'TEAM_FOLDER', resourceId: folder.id, metadata: { groupId, role } } });
      return row;
    });
    return { teamFolderId: updated.teamFolderId, groupId: updated.groupId, role: updated.role };
  }

  async removeGroup(user: AccessTokenPayload, id: string, groupId: string) {
    const { folder, resource } = await this.requireReadableTeamFolder(user, id);
    this.assertNotArchived(folder);
    this.assertCanManageMembers(user, resource);
    const existing = await this.prisma.teamFolderGroup.findUnique({ where: { teamFolderId_groupId: { teamFolderId: folder.id, groupId } } });
    if (!existing) throw new NotFoundException('Team Folder group membership not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.teamFolderGroup.delete({ where: { teamFolderId_groupId: { teamFolderId: folder.id, groupId } } });
      await tx.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'TEAM_FOLDER_GROUP_REMOVED', resourceType: 'TEAM_FOLDER', resourceId: folder.id, metadata: { groupId } } });
    });
    return { teamFolderId: folder.id, groupId, removed: true };
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
      this.assertNotArchived(folder);
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
    this.assertNotArchived(folder);
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
    this.assertNotArchived(folder);
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

  private async collectTreeIds(teamFolderId: string): Promise<{ folderIds: string[]; fileIds: string[] }> {
    const folders = await this.prisma.folder.findMany({ where: { teamFolderId }, select: { id: true } });
    const folderIds = folders.map((row) => row.id);
    const files = folderIds.length === 0 ? [] : await this.prisma.file.findMany({ where: { folderId: { in: folderIds } }, select: { id: true } });
    return { folderIds, fileIds: files.map((row) => row.id) };
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
    folder: {
      id: string;
      orgId: string;
      name: string;
      isPublicToOrg?: boolean;
      allowExternalSharing?: boolean;
      allowViewerDownloads?: boolean;
      archivedAt?: Date | null;
    },
    role: TeamFolderRole | null,
    user: AccessTokenPayload,
  ) {
    return {
      id: folder.id,
      orgId: folder.orgId,
      name: folder.name,
      rootFolderId: await this.findRootFolderId(folder.id),
      role: (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') ? 'ORG_ADMIN' : (role as TeamFolderRole),
      memberCount: await this.prisma.teamFolderMember.count({ where: { teamFolderId: folder.id } }),
      ...(await this.computeTeamFolderStats(folder.id)),
      isPublicToOrg: folder.isPublicToOrg ?? false,
      allowExternalSharing: folder.allowExternalSharing ?? true,
      allowViewerDownloads: folder.allowViewerDownloads ?? true,
      archivedAt: folder.archivedAt ?? null,
    };
  }

  private assertNotArchived(folder: { archivedAt?: Date | null }) {
    if (folder.archivedAt) throw new ForbiddenException('Team Folder is archived and read-only');
  }

  private async resolveCallerRole(
    user: AccessTokenPayload,
    teamFolderId: string,
  ): Promise<TeamFolderRole | null> {
    const [membership, groupMemberships] = await Promise.all([
      this.prisma.teamFolderMember.findFirst({ where: { teamFolderId, userId: user.sub } }),
      this.prisma.teamFolderGroup.findMany({
        where: { teamFolderId, group: { members: { some: { userId: user.sub, orgId: user.org_id } } } },
        select: { role: true },
      }),
    ]);
    const rank: Record<TeamFolderRole, number> = { VIEWER: 1, COMMENTER: 2, EDITOR: 3, ORGANIZER: 4, ADMIN: 5 };
    return [...(membership ? [membership.role] : []), ...groupMemberships.map((m) => m.role)].sort((a, b) => rank[b] - rank[a])[0] ?? null;
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
