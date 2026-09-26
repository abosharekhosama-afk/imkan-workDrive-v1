import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { PrismaService } from '../prisma/prisma.service';
import { OrgRole, MembershipStatus } from '@prisma/client';

@Injectable()
export class EnterpriseService {
  constructor(private readonly prisma: PrismaService) {}

  private assertAdmin(user: AccessTokenPayload) {
    if (user.role !== OrgRole.ADMIN && user.role !== OrgRole.SUPER_ADMIN) throw new ForbiddenException('Admin access required');
  }

  async dashboard(user: AccessTokenPayload) {
    this.assertAdmin(user);
    const orgId = user.org_id;
    const [storage, activeUsers, suspendedUsers, externalShares, largeFiles, recentAudit, storageByFolder] = await Promise.all([
      this.prisma.$queryRawUnsafe<any[]>(`SELECT COALESCE(SUM(size),0) AS usedBytes, COUNT(*) AS files FROM files WHERE org_id=? AND status='ACTIVE'`, orgId),
      this.prisma.organizationMembership.count({ where: { organizationId: orgId, status: MembershipStatus.ACTIVE } }),
      this.prisma.organizationMembership.count({ where: { organizationId: orgId, status: MembershipStatus.SUSPENDED } }),
      this.prisma.fileShare.count({ where: { orgId, status: 'ACTIVE' } }),
      // Privacy P0: the "largest files" probe must never expose private My-Folder
      // content. Join folders + team_folders and keep only governed team-folder rows.
      this.prisma.$queryRawUnsafe<any[]>(`SELECT f.id, f.name, f.size, tm.name AS teamFolder, u.id AS ownerId, u.name AS ownerName, u.email AS ownerEmail, f.updated_at AS updatedAt FROM files f JOIN folders fd ON fd.id=f.folder_id JOIN team_folders tm ON tm.id=fd.team_folder_id LEFT JOIN users u ON u.id=f.owner_id WHERE f.org_id=? AND f.status='ACTIVE' ORDER BY f.size DESC LIMIT 10`, orgId),
      this.prisma.auditLog.findMany({ where: { orgId }, orderBy: { createdAt: 'desc' }, take: 12, select: { id: true, action: true, resourceType: true, resourceId: true, actorId: true, createdAt: true } }),
      // Per-boundary aggregates keep personal bytes visible only as a total, never as
      // file/folder metadata.
      this.prisma.$queryRawUnsafe<any[]>(`SELECT COALESCE(SUM(CASE WHEN fd.team_folder_id IS NULL THEN f.size END),0) AS personalBytes, COALESCE(SUM(CASE WHEN fd.team_folder_id IS NOT NULL THEN f.size END),0) AS teamBytes, COUNT(CASE WHEN fd.team_folder_id IS NULL THEN 1 END) AS personalFiles, COUNT(CASE WHEN fd.team_folder_id IS NOT NULL THEN 1 END) AS teamFiles FROM files f LEFT JOIN folders fd ON fd.id=f.folder_id WHERE f.org_id=? AND f.status='ACTIVE'`, orgId),
    ]);
    return {
      storage: { usedBytes: Number(storage[0]?.usedBytes ?? 0), files: Number(storage[0]?.files ?? 0) },
      byBoundary: {
        personalBytes: Number(storageByFolder[0]?.personalBytes ?? 0),
        teamBytes: Number(storageByFolder[0]?.teamBytes ?? 0),
        personalFiles: Number(storageByFolder[0]?.personalFiles ?? 0),
        teamFiles: Number(storageByFolder[0]?.teamFiles ?? 0),
      },
      users: { active: Number(activeUsers), suspended: Number(suspendedUsers) },
      externalShares,
      largeFiles,
      recentAudit,
      controls: ['authorization','tenant-isolation','team-folder-acl','sharing','version-history','comments','notifications','search','data-administration','audit','retention','malware-scanning'],
    };
  }

  async groups(user: AccessTokenPayload) {
    this.assertAdmin(user);
    return this.prisma.$queryRawUnsafe<any[]>(`SELECT g.id,g.name,g.description,g.created_at AS createdAt,COUNT(gm.id) AS memberCount FROM groups g LEFT JOIN group_members gm ON gm.group_id=g.id WHERE g.org_id=? GROUP BY g.id ORDER BY g.name`, user.org_id);
  }

  async createGroup(user: AccessTokenPayload, name: string, description?: string) {
    this.assertAdmin(user);
    if (!name?.trim()) throw new BadRequestException('Group name is required');
    const id = randomUUID();
    await this.prisma.$executeRawUnsafe(`INSERT INTO groups (id,org_id,name,description,created_by_id) VALUES (?,?,?,?,?)`, id, user.org_id, name.trim(), description?.trim() || null, user.sub);
    await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'GROUP_CREATED', resourceType: 'GROUP', resourceId: id } });
    return { id, name: name.trim(), description: description?.trim() || null };
  }

  async addGroupMember(user: AccessTokenPayload, groupId: string, userId: string) {
    this.assertAdmin(user);
    const membership = await this.prisma.organizationMembership.findFirst({ 
      where: { userId, organizationId: user.org_id, status: MembershipStatus.ACTIVE } 
    });
    if (!membership) throw new NotFoundException('Member not found in this organization');
    const group = await this.prisma.$queryRawUnsafe<any[]>(`SELECT id FROM groups WHERE id=? AND org_id=?`, groupId, user.org_id);
    if (!group.length) throw new NotFoundException('Group not found');
    const id = randomUUID();
    await this.prisma.$executeRawUnsafe(`INSERT INTO group_members (id,org_id,group_id,user_id,role) VALUES (?,?,?,?, 'MEMBER') ON DUPLICATE KEY UPDATE role=role`, id, user.org_id, groupId, userId);
    return { groupId, userId, added: true };
  }

  async removeGroupMember(user: AccessTokenPayload, groupId: string, userId: string) {
    this.assertAdmin(user);
    await this.prisma.$executeRawUnsafe(`DELETE FROM group_members WHERE group_id=? AND user_id=? AND org_id=?`, groupId, userId, user.org_id);
    return { groupId, userId, removed: true };
  }

  async securityPolicy(user: AccessTokenPayload) {
    this.assertAdmin(user);
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`SELECT id,require_mfa AS requireMfa,allow_external_sharing AS allowExternalSharing,allow_public_links AS allowPublicLinks,max_share_days AS maxShareDays,max_upload_bytes AS maxUploadBytes FROM security_policies WHERE org_id=? LIMIT 1`, user.org_id);
    return rows[0] ?? { orgId: user.org_id, requireMfa: false, allowExternalSharing: true, allowPublicLinks: true, maxShareDays: null, maxUploadBytes: null };
  }

  async updateSecurityPolicy(user: AccessTokenPayload, input: { requireMfa?: boolean; allowExternalSharing?: boolean; allowPublicLinks?: boolean; maxShareDays?: number | null; maxUploadBytes?: number | null }) {
    this.assertAdmin(user);
    const current = await this.securityPolicy(user);
    const id = current.id ?? randomUUID();
    await this.prisma.$executeRawUnsafe(`INSERT INTO security_policies (id,org_id,require_mfa,allow_external_sharing,allow_public_links,max_share_days,max_upload_bytes) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE require_mfa=VALUES(require_mfa),allow_external_sharing=VALUES(allow_external_sharing),allow_public_links=VALUES(allow_public_links),max_share_days=VALUES(max_share_days),max_upload_bytes=VALUES(max_upload_bytes),updated_at=CURRENT_TIMESTAMP(3)`, id, user.org_id, input.requireMfa ?? current.requireMfa, input.allowExternalSharing ?? current.allowExternalSharing, input.allowPublicLinks ?? current.allowPublicLinks, input.maxShareDays ?? current.maxShareDays ?? null, input.maxUploadBytes ?? current.maxUploadBytes ?? null);
    await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'SECURITY_POLICY_CHANGED', resourceType: 'ORGANIZATION', resourceId: user.org_id } });
    return this.securityPolicy(user);
  }

  async retentionPolicy(user: AccessTokenPayload) {
    this.assertAdmin(user);
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`SELECT id,trash_days AS trashDays,deleted_items_days AS deletedItemsDays,version_limit AS versionLimit FROM retention_policies WHERE org_id=? LIMIT 1`, user.org_id);
    return rows[0] ?? { orgId: user.org_id, trashDays: 30, deletedItemsDays: 365, versionLimit: null };
  }

  async updateRetentionPolicy(user: AccessTokenPayload, input: { trashDays?: number; deletedItemsDays?: number; versionLimit?: number | null }) {
    this.assertAdmin(user);
    const current = await this.retentionPolicy(user);
    const id = current.id ?? randomUUID();
    const trashDays = input.trashDays ?? current.trashDays;
    const deletedItemsDays = input.deletedItemsDays ?? current.deletedItemsDays;
    if (![7,15,30,90,120].includes(trashDays)) throw new BadRequestException('Invalid trash retention');
    if (deletedItemsDays < 7 || deletedItemsDays > 3650) throw new BadRequestException('Invalid deleted-items retention');
    await this.prisma.$executeRawUnsafe(`INSERT INTO retention_policies (id,org_id,trash_days,deleted_items_days,version_limit) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE trash_days=VALUES(trash_days),deleted_items_days=VALUES(deleted_items_days),version_limit=VALUES(version_limit),updated_at=CURRENT_TIMESTAMP(3)`, id, user.org_id, trashDays, deletedItemsDays, input.versionLimit ?? current.versionLimit ?? null);
    return this.retentionPolicy(user);
  }

  async audit(user: AccessTokenPayload, limit = 100) {
    this.assertAdmin(user);
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
    return this.prisma.auditLog.findMany({ where: { orgId: user.org_id }, orderBy: { createdAt: 'desc' }, take: safeLimit, include: { actor: { select: { id: true, name: true, email: true } } } });
  }




  async consoleSettings(user: AccessTokenPayload) {
    this.assertAdmin(user);
    await this.ensureConsoleSettings(user.org_id);
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`SELECT
      id, org_id AS orgId, logo_data_url AS logoDataUrl, custom_domain AS customDomain,
      default_view AS defaultView, thumbnail_size AS thumbnailSize, preview_panel AS previewPanel,
      convert_on_upload AS convertOnUpload, allow_non_zoho_writer AS allowNonZohoWriter,
      allow_non_zoho_sheet AS allowNonZohoSheet, allow_non_zoho_show AS allowNonZohoShow,
      save_new_files_as_drafts AS saveNewFilesAsDrafts, ocr_language AS ocrLanguage,
      allow_direct_email_sharing AS allowDirectEmailSharing, direct_sharing_scope AS directSharingScope,
      allow_external_share_links AS allowExternalShareLinks, enforce_share_passwords AS enforceSharePasswords,
      default_share_expiry_days AS defaultShareExpiryDays, collect_external_user_info AS collectExternalUserInfo,
      allow_download_links AS allowDownloadLinks, download_link_expiry_days AS downloadLinkExpiryDays,
      allow_permalink_embeds AS allowPermalinkEmbeds, allow_embed_download_print AS allowEmbedDownloadPrint,
      allow_collections AS allowCollections, collection_manager_scope AS collectionManagerScope,
      collection_external_name AS collectionExternalName, my_folders_limit_bytes AS myFoldersLimitBytes,
      version_mode AS versionMode, version_limit AS versionLimit,
      public_team_folder_creator AS publicTeamFolderCreator, private_team_folder_creator AS privateTeamFolderCreator,
      same_domain_join_enabled AS sameDomainJoinEnabled
      FROM admin_console_settings WHERE org_id=? LIMIT 1`, user.org_id);
    const row = rows[0] ?? {};
    return { ...row, myFoldersLimitBytes: row.myFoldersLimitBytes == null ? null : String(row.myFoldersLimitBytes) };
  }

  async updateConsoleSettings(user: AccessTokenPayload, input: Record<string, unknown>) {
    this.assertAdmin(user);
    await this.ensureConsoleSettings(user.org_id);
    const current = await this.consoleSettings(user);
    const bool = (key: string) => typeof input[key] === 'boolean' ? input[key] : current[key];
    const str = (key: string, fallback?: string) => typeof input[key] === 'string' && String(input[key]).length ? String(input[key]) : (current[key] ?? fallback ?? null);
    const intOrNull = (key: string) => input[key] === null ? null : Number.isFinite(Number(input[key])) ? Math.trunc(Number(input[key])) : current[key] ?? null;
    const logo = typeof input.logoDataUrl === 'string' ? input.logoDataUrl : current.logoDataUrl ?? null;
    const customDomain = Object.prototype.hasOwnProperty.call(input, 'customDomain') ? (input.customDomain == null || String(input.customDomain).trim() === '' ? null : String(input.customDomain).trim()) : current.customDomain ?? null;
    if (logo && logo.length > 8_000_000) throw new BadRequestException('Logo is too large');
    const thumbnailSize = Math.min(5, Math.max(1, Number(input.thumbnailSize ?? current.thumbnailSize ?? 3)));
    const versionLimit = input.versionLimit === null ? null : Math.max(1, Math.trunc(Number(input.versionLimit ?? current.versionLimit ?? 1)));
    const myFoldersLimit = input.myFoldersLimitBytes === null || input.myFoldersLimitBytes === undefined ? current.myFoldersLimitBytes ?? null : Math.max(0, Math.trunc(Number(input.myFoldersLimitBytes)));
    await this.prisma.$executeRawUnsafe(`UPDATE admin_console_settings SET
      logo_data_url=?, custom_domain=?, default_view=?, thumbnail_size=?, preview_panel=?,
      convert_on_upload=?, allow_non_zoho_writer=?, allow_non_zoho_sheet=?, allow_non_zoho_show=?,
      save_new_files_as_drafts=?, ocr_language=?, allow_direct_email_sharing=?, direct_sharing_scope=?,
      allow_external_share_links=?, enforce_share_passwords=?, default_share_expiry_days=?, collect_external_user_info=?,
      allow_download_links=?, download_link_expiry_days=?, allow_permalink_embeds=?, allow_embed_download_print=?,
      allow_collections=?, collection_manager_scope=?, collection_external_name=?, my_folders_limit_bytes=?,
      version_mode=?, version_limit=?, public_team_folder_creator=?, private_team_folder_creator=?, same_domain_join_enabled=?, updated_at=CURRENT_TIMESTAMP(3)
      WHERE org_id=?`,
      logo, customDomain, str('defaultView','COMPACT'), thumbnailSize, str('previewPanel','PREVIEW'),
      bool('convertOnUpload'), bool('allowNonZohoWriter'), bool('allowNonZohoSheet'), bool('allowNonZohoShow'),
      bool('saveNewFilesAsDrafts'), str('ocrLanguage','NONE'), bool('allowDirectEmailSharing'), str('directSharingScope','ANY_EXTERNAL_USER'),
      bool('allowExternalShareLinks'), bool('enforceSharePasswords'), intOrNull('defaultShareExpiryDays'), bool('collectExternalUserInfo'),
      bool('allowDownloadLinks'), intOrNull('downloadLinkExpiryDays'), bool('allowPermalinkEmbeds'), bool('allowEmbedDownloadPrint'),
      bool('allowCollections'), str('collectionManagerScope','ANYONE_ON_TEAM'), str('collectionExternalName','COLLECTION'), myFoldersLimit,
      str('versionMode','ALL'), versionLimit, str('publicTeamFolderCreator','ANYONE'), str('privateTeamFolderCreator','ANYONE'), bool('sameDomainJoinEnabled'),
      user.org_id);
    await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'ADMIN_CONSOLE_SETTINGS_UPDATED', resourceType: 'ORGANIZATION', resourceId: user.org_id } });
    return this.consoleSettings(user);
  }

  private async ensureConsoleSettings(orgId: string) {
    const id = randomUUID();
    try {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO admin_console_settings (id,org_id) VALUES (?,?) ON DUPLICATE KEY UPDATE org_id=org_id`,
        id,
        orgId,
      );
      return;
    } catch (cause) {
      // Older production databases can be one migration behind. The Admin
      // Console must not become a 500-only surface in that state, so bootstrap
      // the exact table shape required by this service and retry once.
      const message = cause instanceof Error ? cause.message : String(cause);
      if (!/admin_console_settings|doesn't exist|unknown table|1146/i.test(message)) {
        throw cause;
      }
    }

    await this.prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS admin_console_settings (
      id CHAR(36) NOT NULL,
      org_id CHAR(36) NOT NULL,
      logo_data_url LONGTEXT NULL,
      custom_domain VARCHAR(255) NULL,
      default_view VARCHAR(20) NOT NULL DEFAULT 'COMPACT',
      thumbnail_size INTEGER NOT NULL DEFAULT 3,
      preview_panel VARCHAR(30) NOT NULL DEFAULT 'PREVIEW',
      convert_on_upload BOOLEAN NOT NULL DEFAULT false,
      allow_non_zoho_writer BOOLEAN NOT NULL DEFAULT true,
      allow_non_zoho_sheet BOOLEAN NOT NULL DEFAULT true,
      allow_non_zoho_show BOOLEAN NOT NULL DEFAULT true,
      save_new_files_as_drafts BOOLEAN NOT NULL DEFAULT true,
      ocr_language VARCHAR(20) NOT NULL DEFAULT 'NONE',
      allow_direct_email_sharing BOOLEAN NOT NULL DEFAULT true,
      direct_sharing_scope VARCHAR(30) NOT NULL DEFAULT 'ANY_EXTERNAL_USER',
      allow_external_share_links BOOLEAN NOT NULL DEFAULT true,
      enforce_share_passwords BOOLEAN NOT NULL DEFAULT false,
      default_share_expiry_days INTEGER NULL,
      collect_external_user_info BOOLEAN NOT NULL DEFAULT false,
      allow_download_links BOOLEAN NOT NULL DEFAULT true,
      download_link_expiry_days INTEGER NULL,
      allow_permalink_embeds BOOLEAN NOT NULL DEFAULT true,
      allow_embed_download_print BOOLEAN NOT NULL DEFAULT true,
      allow_collections BOOLEAN NOT NULL DEFAULT true,
      collection_manager_scope VARCHAR(30) NOT NULL DEFAULT 'ANYONE_ON_TEAM',
      collection_external_name VARCHAR(30) NOT NULL DEFAULT 'COLLECTION',
      my_folders_limit_bytes BIGINT NULL,
      version_mode VARCHAR(30) NOT NULL DEFAULT 'ALL',
      version_limit INTEGER NULL,
      public_team_folder_creator VARCHAR(20) NOT NULL DEFAULT 'ANYONE',
      private_team_folder_creator VARCHAR(20) NOT NULL DEFAULT 'ANYONE',
      same_domain_join_enabled BOOLEAN NOT NULL DEFAULT false,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      UNIQUE KEY admin_console_settings_org_id_key (org_id),
      CONSTRAINT admin_console_settings_org_id_fkey
        FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE ON UPDATE CASCADE
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO admin_console_settings (id,org_id) VALUES (?,?) ON DUPLICATE KEY UPDATE org_id=org_id`,
      randomUUID(),
      orgId,
    );
  }

  async securityCenter(user: AccessTokenPayload) {
    this.assertAdmin(user);
    const [activeSessions, revokedSessions, devices, events] = await Promise.all([
      this.prisma.session.count({ where: { orgId: user.org_id, revokedAt: null, expiresAt: { gt: new Date() } } }),
      this.prisma.session.count({ where: { orgId: user.org_id, revokedAt: { not: null } } }),
      this.prisma.userDevice.count({ where: { orgId: user.org_id, revokedAt: null } }),
      this.prisma.securityEvent.findMany({ where: { orgId: user.org_id }, orderBy: { createdAt: 'desc' }, take: 100, include: { user: { select: { id: true, name: true, email: true } } } }),
    ]);
    return { activeSessions, revokedSessions, activeDevices: devices, events };
  }

  async revokeUserSession(user: AccessTokenPayload, sessionId: string) {
    this.assertAdmin(user);
    const session = await this.prisma.session.findFirst({ where: { id: sessionId, orgId: user.org_id } });
    if (!session) throw new NotFoundException('Session not found');
    await this.prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    await this.prisma.securityEvent.create({ data: { orgId: user.org_id, userId: session.userId, severity: 'WARNING', eventType: 'ADMIN_SESSION_REVOKED', resourceType: 'SESSION', resourceId: session.id, metadata: { adminId: user.sub } } });
    return { ok: true };
  }

  async externalShares(user: AccessTokenPayload) {
    this.assertAdmin(user);
    return this.prisma.fileShare.findMany({ where: { orgId: user.org_id, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' }, take: 500, include: { file: { select: { id: true, name: true } }, recipients: { include: { user: { select: { id: true, name: true, email: true } } } } } });
  }

  async suspendUser(user: AccessTokenPayload, targetId: string) {
    this.assertAdmin(user);
    if (targetId === user.sub) throw new ForbiddenException('You cannot suspend yourself');
    const targetMembership = await this.prisma.organizationMembership.findFirst({ 
      where: { userId: targetId, organizationId: user.org_id } 
    });
    if (!targetMembership) throw new NotFoundException('Member not found');
    const ownerRows = await this.prisma.$queryRawUnsafe<any[]>(`SELECT owner_id AS ownerId FROM organizations WHERE id=? LIMIT 1`, user.org_id);
    if (ownerRows[0]?.ownerId === targetId) throw new ForbiddenException('Organization owner is protected');
    await this.prisma.organizationMembership.update({
      where: { id: targetMembership.id },
      data: { status: MembershipStatus.SUSPENDED, suspendedAt: new Date(), suspendedById: user.sub }
    });
    await this.prisma.session.updateMany({ where: { userId: targetId, orgId: user.org_id, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'USER_SUSPENDED', resourceType: 'USER', resourceId: targetId } });
    return { id: targetId, status: 'SUSPENDED' };
  }
}