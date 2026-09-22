import { Injectable } from '@nestjs/common';
import {
  FolderAccessLevel,
  MembershipStatus,
  OrgRole,
  ResourceType,
  SharePermission,
  ShareStatus,
  TeamFolderRole,
} from '@prisma/client';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { PrismaService } from '../prisma/prisma.service';

export type EffectivePermissionLevel =
  | 'NONE'
  | 'VIEW'
  | 'COMMENT'
  | 'EDIT'
  | 'ORGANIZE'
  | 'FULL_ACCESS';

export type PermissionSource =
  | 'OWNER'
  | 'ORG_ADMIN'
  | 'TEAM_FOLDER_ROLE'
  | 'DIRECT_FOLDER_ACL'
  | 'GROUP_FOLDER_ACL'
  | 'INHERITED_FOLDER_ACL'
  | 'FOLDER_SHARE'
  | 'FILE_SHARE'
  | 'ARCHIVED_TEAM_FOLDER';

export type EffectivePermissionResult = {
  level: EffectivePermissionLevel;
  allowed: boolean;
  resourceType: ResourceType;
  resourceId: string;
  sources: PermissionSource[];
  hidden: boolean;
};

const LEVEL_RANK: Record<EffectivePermissionLevel, number> = {
  NONE: 0,
  VIEW: 10,
  COMMENT: 20,
  EDIT: 30,
  ORGANIZE: 40,
  FULL_ACCESS: 50,
};

const TEAM_ROLE_LEVEL: Record<TeamFolderRole, EffectivePermissionLevel> = {
  ADMIN: 'ORGANIZE',
  ORGANIZER: 'ORGANIZE',
  EDITOR: 'EDIT',
  COMMENTER: 'COMMENT',
  VIEWER: 'VIEW',
};

function maxLevel(...levels: EffectivePermissionLevel[]): EffectivePermissionLevel {
  return levels.reduce(
    (best, current) => LEVEL_RANK[current] > LEVEL_RANK[best] ? current : best,
    'NONE' as EffectivePermissionLevel,
  );
}

function mapFolderAccess(level: FolderAccessLevel): EffectivePermissionLevel {
  return level as EffectivePermissionLevel;
}

function mapSharePermission(level: SharePermission): EffectivePermissionLevel {
  return level as EffectivePermissionLevel;
}

@Injectable()
export class EffectivePermissionService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveFolder(
    user: AccessTokenPayload,
    folderId: string,
  ): Promise<EffectivePermissionResult> {
    const folder: {
      id: string;
      parentId: string | null;
      orgId: string;
      ownerId: string;
      teamFolderId: string | null;
      teamFolder: { archivedAt: Date | null } | null;
    } | null = await this.prisma.folder.findFirst({
      where: { id: folderId, orgId: user.org_id },
      select: {
        id: true,
        orgId: true,
        ownerId: true,
        parentId: true,
        teamFolderId: true,
        teamFolder: { select: { archivedAt: true } },
      },
    });
    if (!folder) return this.denied(ResourceType.FOLDER, folderId);
    return this.resolveForResource(user, {
      resourceType: ResourceType.FOLDER,
      resourceId: folder.id,
      orgId: folder.orgId,
      ownerId: folder.ownerId,
      folderId: folder.id,
      parentId: folder.parentId,
      teamFolderId: folder.teamFolderId,
      archivedAt: folder.teamFolder?.archivedAt ?? null,
    });
  }

  async resolveFile(
    user: AccessTokenPayload,
    fileId: string,
  ): Promise<EffectivePermissionResult> {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, orgId: user.org_id },
      select: {
        id: true,
        orgId: true,
        ownerId: true,
        folderId: true,
        folder: {
          select: {
            id: true,
            parentId: true,
            teamFolderId: true,
            teamFolder: { select: { archivedAt: true } },
          },
        },
      },
    });
    if (!file) return this.denied(ResourceType.FILE, fileId);
    return this.resolveForResource(user, {
      resourceType: ResourceType.FILE,
      resourceId: file.id,
      orgId: file.orgId,
      ownerId: file.ownerId,
      folderId: file.folder?.id ?? file.folderId,
      parentId: file.folder?.parentId ?? null,
      teamFolderId: file.folder?.teamFolderId ?? null,
      archivedAt: file.folder?.teamFolder?.archivedAt ?? null,
    });
  }

  async canRead(user: AccessTokenPayload, resourceType: ResourceType, resourceId: string) {
    return (await this.resolve(user, resourceType, resourceId)).allowed;
  }

  async canWrite(user: AccessTokenPayload, resourceType: ResourceType, resourceId: string) {
    const result = await this.resolve(user, resourceType, resourceId);
    return LEVEL_RANK[result.level] >= LEVEL_RANK.EDIT && !result.sources.includes('ARCHIVED_TEAM_FOLDER');
  }

  async canComment(user: AccessTokenPayload, resourceType: ResourceType, resourceId: string) {
    return LEVEL_RANK[(await this.resolve(user, resourceType, resourceId)).level] >= LEVEL_RANK.COMMENT;
  }

  async canShare(user: AccessTokenPayload, resourceType: ResourceType, resourceId: string) {
    const result = await this.resolve(user, resourceType, resourceId);
    return LEVEL_RANK[result.level] >= LEVEL_RANK.ORGANIZE && !result.sources.includes('ARCHIVED_TEAM_FOLDER');
  }

  async resolve(
    user: AccessTokenPayload,
    resourceType: ResourceType,
    resourceId: string,
  ): Promise<EffectivePermissionResult> {
    if (resourceType === ResourceType.FOLDER) return this.resolveFolder(user, resourceId);
    return this.resolveFile(user, resourceId);
  }

  private async resolveForResource(
    user: AccessTokenPayload,
    resource: {
      resourceType: ResourceType;
      resourceId: string;
      orgId: string;
      ownerId: string;
      folderId: string | null;
      parentId: string | null;
      teamFolderId: string | null;
      archivedAt: Date | null;
    },
  ): Promise<EffectivePermissionResult> {
    if (resource.orgId !== user.org_id) return this.denied(resource.resourceType, resource.resourceId);

    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId: user.sub,
        organizationId: user.org_id,
        status: MembershipStatus.ACTIVE,
      },
      select: { role: true },
    });
    if (!membership) return this.denied(resource.resourceType, resource.resourceId);

    const sources: PermissionSource[] = [];
    let level: EffectivePermissionLevel = 'NONE';

    if (membership.role === OrgRole.SUPER_ADMIN || membership.role === OrgRole.ADMIN || user.role === OrgRole.SUPER_ADMIN || user.role === OrgRole.ADMIN) {
      level = 'FULL_ACCESS';
      sources.push('ORG_ADMIN');
    }

    if (!resource.teamFolderId && resource.ownerId === user.sub) {
      level = maxLevel(level, 'FULL_ACCESS');
      sources.push('OWNER');
    }

    if (resource.teamFolderId) {
      const [teamFolder, teamMembership] = await Promise.all([
        this.prisma.teamFolder.findFirst({
          where: { id: resource.teamFolderId, orgId: user.org_id },
          select: { archivedAt: true },
        }),
        this.prisma.teamFolderMember.findFirst({
          where: { teamFolderId: resource.teamFolderId, userId: user.sub, orgId: user.org_id },
          select: { role: true },
        }),
      ]);
      if (teamMembership) {
        level = maxLevel(level, TEAM_ROLE_LEVEL[teamMembership.role]);
        sources.push('TEAM_FOLDER_ROLE');
      }
      if (teamFolder?.archivedAt) sources.push('ARCHIVED_TEAM_FOLDER');
    }

    if (resource.folderId) {
      const chain = await this.folderChain(resource.folderId, user.org_id);
      const ids = chain.map((entry) => entry.id);
      const groupIds = await this.prisma.groupMember.findMany({
        where: { orgId: user.org_id, userId: user.sub },
        select: { groupId: true },
      });
      const groups = groupIds.map((entry) => entry.groupId);
      const aclRows = await this.prisma.folderPermission.findMany({
        where: {
          orgId: user.org_id,
          folderId: { in: ids },
          OR: [
            { userId: user.sub },
            ...(groups.length ? [{ groupId: { in: groups } }] : []),
          ],
        },
        select: { folderId: true, userId: true, groupId: true, access: true, hidden: true },
      });

      const depth = new Map(ids.map((id, index) => [id, index]));
      const subjectBest = new Map<string, { level: EffectivePermissionLevel; hidden: boolean; inherited: boolean; depth: number }>();
      for (const row of aclRows) {
        const rowDepth = depth.get(row.folderId) ?? 999;
        const key = row.userId ? `u:${row.userId}` : `g:${row.groupId}`;
        const current = subjectBest.get(key);
        const mapped = mapFolderAccess(row.access);
        if (!current || rowDepth < current.depth || (rowDepth === current.depth && LEVEL_RANK[mapped] > LEVEL_RANK[current.level])) {
          subjectBest.set(key, { level: mapped, hidden: row.hidden, inherited: row.folderId !== resource.folderId, depth: rowDepth });
        }
      }
      for (const [key, value] of subjectBest) {
        level = maxLevel(level, value.level);
        if (value.level !== 'NONE') {
          sources.push(key.startsWith('u:') ? (value.inherited ? 'INHERITED_FOLDER_ACL' : 'DIRECT_FOLDER_ACL') : (value.inherited ? 'INHERITED_FOLDER_ACL' : 'GROUP_FOLDER_ACL'));
        }
      }

      const shareRows = await this.prisma.folderShareRecipient.findMany({
        where: {
          orgId: user.org_id,
          userId: user.sub,
          share: {
            folderId: { in: ids },
            status: ShareStatus.ACTIVE,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
        },
        select: { permission: true },
      });
      for (const share of shareRows) {
        level = maxLevel(level, mapSharePermission(share.permission));
        sources.push('FOLDER_SHARE');
      }
    }

    if (resource.resourceType === ResourceType.FILE) {
      const shares = await this.prisma.fileShareRecipient.findMany({
        where: {
          orgId: user.org_id,
          userId: user.sub,
          share: {
            fileId: resource.resourceId,
            status: ShareStatus.ACTIVE,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
        },
        select: { permission: true },
      });
      for (const share of shares) {
        level = maxLevel(level, mapSharePermission(share.permission));
        sources.push('FILE_SHARE');
      }
    }

    const uniqueSources = [...new Set(sources)];
    const hidden = false;
    const archivedReadOnly = uniqueSources.includes('ARCHIVED_TEAM_FOLDER');
    const allowed = level !== 'NONE';
    return {
      level,
      allowed,
      resourceType: resource.resourceType,
      resourceId: resource.resourceId,
      sources: uniqueSources,
      hidden: archivedReadOnly ? false : hidden,
    };
  }

  private async folderChain(folderId: string, orgId: string) {
    const chain: Array<{ id: string; parentId: string | null }> = [];
    let current: string | null = folderId;
    for (let i = 0; i < 100 && current; i += 1) {
      const folder: { id: string; parentId: string | null; orgId: string } | null = await this.prisma.folder.findFirst({
        where: { id: current, orgId },
        select: { id: true, parentId: true, orgId: true },
      });
      if (!folder) break;
      chain.push({ id: folder.id, parentId: folder.parentId });
      current = folder.parentId;
    }
    return chain;
  }

  private denied(resourceType: ResourceType, resourceId: string): EffectivePermissionResult {
    return { level: 'NONE', allowed: false, resourceType, resourceId, sources: [], hidden: false };
  }
}
