import { Injectable } from '@nestjs/common';
import { TeamFolderRole } from '@prisma/client';
import type { AccessTokenPayload } from '../auth/jwt.types';
import {
  PermissionService,
  type AccessibleResource,
} from '../permissions/permission.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
  ) {}

  async search(user: AccessTokenPayload, query: string) {
    const [folders, files] = await Promise.all([
      this.prisma.folder.findMany({
        where: {
          orgId: user.org_id,
          name: { search: query },
        },
        take: 50,
      }),
      this.prisma.file.findMany({
        where: {
          orgId: user.org_id,
          deletedAt: null,
          name: { search: query },
        },
        include: { folder: { select: { teamFolderId: true } } },
        take: 50,
      }),
    ]);
    const visibleFolders: typeof folders = [];
    for (const folder of folders) {
      if (await this.canReadFolder(user, folder)) {
        visibleFolders.push(folder);
      }
    }
    const visibleFiles: Array<Omit<(typeof files)[number], 'folder'>> = [];
    for (const file of files) {
      if (await this.canReadFile(user, file)) {
        const { folder: _folder, ...rest } = file;
        visibleFiles.push(rest);
      }
    }
    return { query, folders: visibleFolders, files: visibleFiles };
  }

  private async canReadFolder(
    user: AccessTokenPayload,
    folder: { orgId: string; ownerId: string; teamFolderId?: string | null },
  ): Promise<boolean> {
    if (folder.orgId !== user.org_id) {
      return false;
    }
    if (!folder.teamFolderId) {
      return this.permissions.canRead(user, {
        orgId: folder.orgId,
        ownerId: folder.ownerId,
        teamFolderId: null,
      });
    }
    const resource = await this.toTeamFolderResource(
      user,
      folder.orgId,
      folder.teamFolderId,
    );
    return this.permissions.canRead(user, resource);
  }

  private async canReadFile(
    user: AccessTokenPayload,
    file: {
      orgId: string;
      ownerId: string;
      folder?: { teamFolderId: string | null } | null;
    },
  ): Promise<boolean> {
    if (file.orgId !== user.org_id) {
      return false;
    }
    const teamFolderId = file.folder?.teamFolderId ?? null;
    if (!teamFolderId) {
      return this.permissions.canRead(user, {
        orgId: file.orgId,
        ownerId: file.ownerId,
        teamFolderId: null,
      });
    }
    const resource = await this.toTeamFolderResource(
      user,
      file.orgId,
      teamFolderId,
    );
    return this.permissions.canRead(user, resource);
  }

  private async toTeamFolderResource(
    user: AccessTokenPayload,
    orgId: string,
    teamFolderId: string,
  ): Promise<AccessibleResource> {
    const teamFolderRole = await this.resolveCallerRole(user, teamFolderId);
    return {
      orgId,
      ownerId: teamFolderId,
      teamFolderId,
      teamFolderRole,
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
}
