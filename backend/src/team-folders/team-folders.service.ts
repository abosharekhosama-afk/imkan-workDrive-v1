import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TeamFolderRole } from '@prisma/client';
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
  folder: { id: string; orgId: string; name: string };
  role: TeamFolderRole | null;
  resource: AccessibleResource;
};

@Injectable()
export class TeamFoldersService {
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
    const folders = await this.prisma.teamFolder.findMany();
    const visible: TeamFolderListItem[] = [];
    for (const folder of folders) {
      const role = await this.resolveCallerRole(user, folder.id);
      if (
        !this.permissions.canRead(
          user,
          this.toAccessibleResource(folder.orgId, folder.id, role),
        )
      ) {
        continue;
      }
      visible.push({
        id: folder.id,
        name: folder.name,
        rootFolderId: await this.findRootFolderId(folder.id),
        role: user.role === 'ADMIN' ? 'ORG_ADMIN' : (role as TeamFolderRole),
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
    const { folder, resource } = await this.requireReadableTeamFolder(user, id);
    this.assertCanManageMembers(user, resource);
    this.assertCanAssignRole(user, resource, input.role);
    const target = await this.requireSameOrgUser(
      user,
      folder.orgId,
      input.userId,
    );
    const existing = await this.prisma.teamFolderMember.findFirst({
      where: { teamFolderId: folder.id, userId: target.id },
    });
    if (existing) {
      throw new BadRequestException('Member already exists');
    }
    const created = await this.prisma.teamFolderMember.create({
      data: {
        teamFolderId: folder.id,
        userId: target.id,
        orgId: folder.orgId,
        role: input.role,
      },
    });
    await this.auditMemberChange(user, folder.id, 'TEAM_FOLDER_MEMBER_ADDED');
    return {
      teamFolderId: folder.id,
      userId: created.userId,
      role: created.role,
    };
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
    const updated = await this.prisma.teamFolderMember.update({
      where: {
        teamFolderId_userId: {
          teamFolderId: folder.id,
          userId: membership.userId,
        },
      },
      data: { role: input.role },
    });
    await this.auditMemberChange(user, folder.id, 'TEAM_FOLDER_MEMBER_UPDATED');
    return {
      teamFolderId: folder.id,
      userId: updated.userId,
      role: updated.role,
    };
  }

  async removeMember(user: AccessTokenPayload, id: string, userId: string) {
    const { folder, resource } = await this.requireReadableTeamFolder(user, id);
    this.assertCanManageMembers(user, resource);
    const membership = await this.requireMembership(folder.id, userId);
    this.assertCanChangeExistingRole(user, resource, membership.role);
    await this.assertNotLastAdmin(folder.id, membership.role, null);
    await this.prisma.teamFolderMember.delete({
      where: {
        teamFolderId_userId: {
          teamFolderId: folder.id,
          userId: membership.userId,
        },
      },
    });
    await this.auditMemberChange(user, folder.id, 'TEAM_FOLDER_MEMBER_REMOVED');
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
    const folder = await this.prisma.teamFolder.findFirst({ where: { id } });
    if (!folder) {
      throw new NotFoundException('Team Folder not found');
    }
    const role = await this.resolveCallerRole(user, folder.id);
    const resource = this.toAccessibleResource(folder.orgId, folder.id, role);
    if (!this.permissions.canRead(user, resource)) {
      throw new NotFoundException('Team Folder not found');
    }
    return { folder, role, resource };
  }

  private assertCanManageMembers(
    user: AccessTokenPayload,
    resource: AccessibleResource,
  ): void {
    if (!this.permissions.canManageMembers(user, resource)) {
      throw new ForbiddenException('Not allowed to manage members');
    }
  }

  private assertCanAssignRole(
    user: AccessTokenPayload,
    resource: AccessibleResource,
    role: TeamFolderRole,
  ): void {
    if (!this.permissions.canAssignTeamFolderRole(user, resource, role)) {
      throw new BadRequestException('Not allowed to assign this role');
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
      throw new BadRequestException('Not allowed to change this member');
    }
  }

  private async requireSameOrgUser(
    user: AccessTokenPayload,
    teamFolderOrgId: string,
    userId: string,
  ) {
    const target = await this.prisma.user.findFirst({ where: { id: userId } });
    if (
      !target ||
      target.orgId !== user.org_id ||
      target.orgId !== teamFolderOrgId
    ) {
      throw new NotFoundException('User not found');
    }
    return target;
  }

  private async requireMembership(teamFolderId: string, userId: string) {
    const membership = await this.prisma.teamFolderMember.findFirst({
      where: { teamFolderId, userId },
    });
    if (!membership) {
      throw new NotFoundException('Member not found');
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
      throw new BadRequestException('Cannot remove the last Team Folder ADMIN');
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
    folder: { id: string; orgId: string; name: string },
    role: TeamFolderRole | null,
    user: AccessTokenPayload,
  ) {
    return {
      id: folder.id,
      orgId: folder.orgId,
      name: folder.name,
      rootFolderId: await this.findRootFolderId(folder.id),
      role: user.role === 'ADMIN' ? 'ORG_ADMIN' : (role as TeamFolderRole),
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
  ): AccessibleResource {
    return {
      orgId,
      ownerId: teamFolderId,
      teamFolderId,
      teamFolderRole,
    };
  }
}
