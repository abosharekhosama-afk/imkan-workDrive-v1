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

  async auditScopes(user: AccessTokenPayload) {
    this.assertAdmin(user);
    const [members, teamFolders] = await Promise.all([
      this.prisma.organizationMembership.findMany({
        where: { organizationId: user.org_id },
        orderBy: { user: { name: 'asc' } },
        select: { user: { select: { id: true, name: true, email: true } }, status: true },
      }),
      this.prisma.teamFolder.findMany({
        where: { orgId: user.org_id },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, isPublicToOrg: true, archivedAt: true },
      }),
    ]);
    return {
      members: members.map((m) => ({ id: m.user.id, name: m.user.name, email: m.user.email, status: m.status })),
      teamFolders,
    };
  }

  async auditReport(user: AccessTokenPayload, input: any) {
    this.assertAdmin(user);
    const locationType = String(input?.locationType || 'ORGANIZATION').toUpperCase();
    const locationId = typeof input?.locationId === 'string' ? input.locationId : null;
    const actorId = typeof input?.actorId === 'string' && input.actorId ? input.actorId : null;
    const range = String(input?.range || 'TODAY').toUpperCase();
    const now = new Date();
    let from = new Date(now);
    let to = new Date(now);
    to.setTime(now.getTime());
    const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
    const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
    if (range === 'YESTERDAY') { const y = new Date(now); y.setDate(y.getDate() - 1); from = startOfDay(y); to = endOfDay(y); }
    else if (range === 'LAST_7_DAYS') { const d = startOfDay(now); d.setDate(d.getDate() - 6); from = d; to = endOfDay(now); }
    else if (range === 'LAST_30_DAYS') { const d = startOfDay(now); d.setDate(d.getDate() - 29); from = d; to = endOfDay(now); }
    else if (range === 'CUSTOM') {
      const parsedFrom = new Date(String(input?.from || ''));
      const parsedTo = new Date(String(input?.to || ''));
      if (!Number.isFinite(parsedFrom.getTime()) || !Number.isFinite(parsedTo.getTime())) throw new BadRequestException('Custom report range requires valid from/to dates');
      from = startOfDay(parsedFrom); to = endOfDay(parsedTo);
    } else { from = startOfDay(now); to = endOfDay(now); }
    if (from > to) throw new BadRequestException('Invalid report range');

    const ACTIONS: Record<string, string[]> = {
      FILES_FOLDERS: ['FILE_UPLOAD_COMPLETE','FILE_VERSION_UPLOADED','FILE_CREATED','FILE_DOWNLOADED','FILE_VIEWED','FILE_MODIFIED','FILE_RENAMED','FILE_TRASHED','FILE_PERMANENTLY_DELETED','FILE_RESTORED','FILE_MOVED','FILE_COPIED','FOLDER_CREATED','FOLDER_RENAMED','FOLDER_TRASHED','FOLDER_PERMANENTLY_DELETED','FOLDER_RESTORED','FOLDER_MOVED','FOLDER_COPIED','TRASH_EMPTIED','FILE_IMPORTED_FROM_CLOUD','FILE_VERSION_RESTORED'],
      'FILES_FOLDERS:UPLOAD': ['FILE_UPLOAD_COMPLETE','FILE_VERSION_UPLOADED'], 'FILES_FOLDERS:CREATE': ['FILE_CREATED','FOLDER_CREATED'], 'FILES_FOLDERS:DOWNLOAD': ['FILE_DOWNLOADED'], 'FILES_FOLDERS:VIEW': ['FILE_VIEWED'], 'FILES_FOLDERS:MODIFY': ['FILE_MODIFIED'], 'FILES_FOLDERS:RENAME': ['FILE_RENAMED','FOLDER_RENAMED'], 'FILES_FOLDERS:TRASH': ['FILE_TRASHED','FOLDER_TRASHED'], 'FILES_FOLDERS:DELETE': ['FILE_PERMANENTLY_DELETED','FOLDER_PERMANENTLY_DELETED'], 'FILES_FOLDERS:PERMANENT_DELETE': ['FILE_PERMANENTLY_DELETED','FOLDER_PERMANENTLY_DELETED'], 'FILES_FOLDERS:RESTORE': ['FILE_RESTORED','FOLDER_RESTORED','FILE_VERSION_RESTORED'], 'FILES_FOLDERS:MOVE': ['FILE_MOVED','FOLDER_MOVED'], 'FILES_FOLDERS:COPY': ['FILE_COPIED','FOLDER_COPIED'], 'FILES_FOLDERS:PURGED': ['TRASH_EMPTIED'], 'FILES_FOLDERS:TRANSFER_OWNERSHIP': ['ORG_OWNERSHIP_TRANSFERRED'],
      SHARING: ['SHARE_CREATED','SHARE_ACCESS_REMOVED','SHARE_PERMISSION_CHANGED','SHARE_REVOKED','PUBLIC_SHARE_ACCESSED'], 'SHARING:SHARE': ['SHARE_CREATED'], 'SHARING:REMOVE_SHARE': ['SHARE_ACCESS_REMOVED','SHARE_REVOKED'], 'SHARING:MODIFY_SHARE': ['SHARE_PERMISSION_CHANGED'],
      GROUPS: ['GROUP_CREATED','GROUP_RENAMED','GROUP_MEMBER_ADDED','GROUP_MEMBER_REMOVED','GROUP_MEMBER_ROLE_CHANGED','GROUP_DELETED'],
      'GROUPS:CREATE': ['GROUP_CREATED'], 'GROUPS:RENAME': ['GROUP_RENAMED'], 'GROUPS:ADD_MEMBERS': ['GROUP_MEMBER_ADDED'], 'GROUPS:REMOVE_MEMBERS': ['GROUP_MEMBER_REMOVED'], 'GROUPS:UPDATE_MEMBER_ROLE': ['GROUP_MEMBER_ROLE_CHANGED'], 'GROUPS:DELETE': ['GROUP_DELETED'],
      TEAM_FOLDERS: ['TEAM_FOLDER_CREATED','TEAM_FOLDER_RENAMED','TEAM_FOLDER_DUPLICATED','TEAM_FOLDER_MEMBER_ADDED','TEAM_FOLDER_MEMBER_REMOVED','TEAM_FOLDER_MEMBER_ROLE_CHANGED','TEAM_FOLDER_DELETED','TEAM_FOLDER_RESTORED','TEAM_FOLDER_ARCHIVED','TEAM_FOLDER_UNARCHIVED'],
      'TEAM_FOLDERS:CREATE': ['TEAM_FOLDER_CREATED'], 'TEAM_FOLDERS:RENAME': ['TEAM_FOLDER_RENAMED'], 'TEAM_FOLDERS:DUPLICATE': ['TEAM_FOLDER_DUPLICATED'], 'TEAM_FOLDERS:ADD_MEMBERS': ['TEAM_FOLDER_MEMBER_ADDED'], 'TEAM_FOLDERS:REMOVE_MEMBERS': ['TEAM_FOLDER_MEMBER_REMOVED'], 'TEAM_FOLDERS:UPDATE_MEMBER_ROLE': ['TEAM_FOLDER_MEMBER_ROLE_CHANGED'], 'TEAM_FOLDERS:DELETE': ['TEAM_FOLDER_DELETED'], 'TEAM_FOLDERS:RESTORE': ['TEAM_FOLDER_RESTORED'], 'TEAM_FOLDERS:ARCHIVE': ['TEAM_FOLDER_ARCHIVED'], 'TEAM_FOLDERS:UNARCHIVE': ['TEAM_FOLDER_UNARCHIVED'],
      TEAM: ['ORG_INVITATION_CREATED','ORG_INVITATION_ACCEPTED','ORG_INVITATION_REVOKED','ORG_MEMBER_ACTIVATED','ORG_MEMBER_ROLE_CHANGED','ORG_MEMBER_SUSPENDED','ORG_OWNERSHIP_TRANSFERRED','USER_SUSPENDED','ADMIN_CONSOLE_SETTINGS_UPDATED'],
      DATA_TEMPLATES: ['TEMPLATE_CREATED_FROM_FILE','TEMPLATE_CREATED','TEMPLATE_UPDATED','TEMPLATE_DELETED','TEMPLATE_DUPLICATED','TEMPLATE_VERSION_CREATED','TEMPLATE_BUILDER_UPDATED','TEMPLATE_BUILDER_PUBLISHED','TEMPLATE_BUILDER_UNPUBLISHED','TEMPLATE_CERTIFIED'],
      'DATA_TEMPLATES:CREATE': ['TEMPLATE_CREATED_FROM_FILE','TEMPLATE_CREATED'], 'DATA_TEMPLATES:MODIFY': ['TEMPLATE_UPDATED','TEMPLATE_BUILDER_UPDATED'], 'DATA_TEMPLATES:DELETE': ['TEMPLATE_DELETED'], 'DATA_TEMPLATES:ASSOCIATE': ['TEMPLATE_CREATED_FROM_FILE'], 'DATA_TEMPLATES:DISSOCIATE': [], 'DATA_TEMPLATES:MODIFY_CUSTOM_FIELDS': [], 'DATA_TEMPLATES:DELETE_CUSTOM_FIELDS': [],
      COLLECT_FILES: ['COLLECT_FILES_CREATED','COLLECT_FILES_ENABLED','COLLECT_FILES_DELETED','COLLECT_FILES_PURGED'],
      'COLLECT_FILES:CREATE': ['COLLECT_FILES_CREATED'], 'COLLECT_FILES:ENABLE': ['COLLECT_FILES_ENABLED'], 'COLLECT_FILES:DELETE': ['COLLECT_FILES_DELETED'], 'COLLECT_FILES:PURGED': ['COLLECT_FILES_PURGED'],
      DLP: ['DLP_POLICY_CREATED','DLP_POLICY_UPDATED','DLP_POLICY_DELETED','DLP_POLICY_ENABLED','DLP_POLICY_DISABLED','DLP_CLASSIFICATION_LABEL_CREATED','DLP_CLASSIFICATION_LABEL_UPDATED','DLP_CLASSIFICATION_LABEL_DELETED'],
      'DLP:CREATE_DLP_POLICY': ['DLP_POLICY_CREATED'], 'DLP:EDIT_DLP_POLICY': ['DLP_POLICY_UPDATED'], 'DLP:DELETE_DLP_POLICY': ['DLP_POLICY_DELETED'], 'DLP:ENABLE_DLP_POLICY': ['DLP_POLICY_ENABLED'], 'DLP:DISABLE_DLP_POLICY': ['DLP_POLICY_DISABLED'], 'DLP:CREATE_CLASSIFICATION_LABEL': ['DLP_CLASSIFICATION_LABEL_CREATED'], 'DLP:EDIT_CLASSIFICATION_LABEL': ['DLP_CLASSIFICATION_LABEL_UPDATED'], 'DLP:DELETE_CLASSIFICATION_LABEL': ['DLP_CLASSIFICATION_LABEL_DELETED'],
      DEVICES: ['DEVICE_CONNECTED','DEVICE_DISCONNECTED','DEVICE_WIPED','APP_ENABLED','APP_DISABLED'],
      'DEVICES:CONNECT_DEVICES': ['DEVICE_CONNECTED'], 'DEVICES:DISCONNECT_DEVICES': ['DEVICE_DISCONNECTED'], 'DEVICES:WIPE_DEVICES': ['DEVICE_WIPED'], 'DEVICES:APP_TOGGLE': ['APP_ENABLED','APP_DISABLED'],
      COMMENTS: ['COMMENT_CREATED','COMMENT_EDITED','COMMENT_DELETED','COMMENT_RESOLVED','COMMENT_REOPENED','COMMENT_REPLIED'],
      'COMMENTS:CREATE': ['COMMENT_CREATED'], 'COMMENTS:EDIT': ['COMMENT_EDITED'], 'COMMENTS:DELETE': ['COMMENT_DELETED'], 'COMMENTS:RESOLVE': ['COMMENT_RESOLVED'], 'COMMENTS:REOPEN': ['COMMENT_REOPENED'], 'COMMENTS:REPLY': ['COMMENT_REPLIED'],
      APPS: ['APP_CREATED','APP_UPDATED','APP_DELETED'],
      'APPS:CREATE_APP': ['APP_CREATED'], 'APPS:UPDATE_APP': ['APP_UPDATED'], 'APPS:DELETE_APP': ['APP_DELETED'],
      WEBHOOKS: ['WEBHOOK_CREATED','WEBHOOK_UPDATED','WEBHOOK_DELETED'],
      'WEBHOOKS:CREATE_WEBHOOK': ['WEBHOOK_CREATED'], 'WEBHOOKS:UPDATE_WEBHOOK': ['WEBHOOK_UPDATED'], 'WEBHOOKS:DELETE_WEBHOOK': ['WEBHOOK_DELETED'],
      WORKFLOWS: ['WORKFLOW_CREATED','WORKFLOW_UPDATED','WORKFLOW_DELETED','WORKFLOW_ACTIVATED','WORKFLOW_DEACTIVATED','WORKFLOW_RUN_RETRIED','WORKFLOW_JOB_DEAD_LETTER','WORKFLOW_JOB_RECOVERED'],
      CONNECTIONS: ['connection.reconnected','CONNECTION_CREATED','CONNECTION_UPDATED','CONNECTION_DELETED'],
    };
    const allKnownActions = [...new Set(Object.values(ACTIONS).flat())];
    // The report builder sends selected activity keys as `actions`. Keep
    // `requestedActions` local to this method and accept the legacy field too
    // so report generation never references an undefined variable.
    const rawRequestedActions = Array.isArray(input?.actions)
      ? input.actions
      : Array.isArray(input?.requestedActions)
        ? input.requestedActions
        : [];
    const requestedActions = rawRequestedActions.filter((action: unknown): action is string => typeof action === 'string' && action.trim().length > 0);
    const actions = requestedActions.length ? [...new Set(requestedActions)] : allKnownActions;

    const params: any[] = [user.org_id, from, to];
    const where = ['a.org_id = ?', 'a.created_at >= ?', 'a.created_at <= ?'];
    if (actorId) { where.push('a.actor_id = ?'); params.push(actorId); }
    if (input?.includeSystemActivities !== true) where.push('a.actor_id IS NOT NULL');
    const actionPlaceholders = actions.map(() => '?').join(',');
    if (actions.length) { where.push(`a.action IN (${actionPlaceholders})`); params.push(...actions); } else { where.push('1 = 0'); }
    if (locationType === 'MY_FOLDERS') {
      where.push(`((a.resource_type = 'FILE' AND EXISTS (SELECT 1 FROM files lf JOIN folders lfd ON lfd.id=lf.folder_id WHERE lf.id=a.resource_id AND lf.org_id=? AND lf.owner_id=? AND lfd.team_folder_id IS NULL)) OR (a.resource_type = 'FOLDER' AND EXISTS (SELECT 1 FROM folders lfolder WHERE lfolder.id=a.resource_id AND lfolder.org_id=? AND lfolder.owner_id=? AND lfolder.team_folder_id IS NULL)))`);
      params.push(user.org_id, user.sub, user.org_id, user.sub);
    } else if (locationType === 'TEAM_FOLDER') {
      if (!locationId) throw new BadRequestException('Team folder is required');
      where.push(`((a.resource_type = 'TEAM_FOLDER' AND a.resource_id=?) OR (a.resource_type = 'FILE' AND EXISTS (SELECT 1 FROM files tf JOIN folders tff ON tff.id=tf.folder_id WHERE tf.id=a.resource_id AND tf.org_id=? AND tff.team_folder_id=?)) OR (a.resource_type = 'FOLDER' AND EXISTS (SELECT 1 FROM folders tfd WHERE tfd.id=a.resource_id AND tfd.org_id=? AND tfd.team_folder_id=?)) )`);
      params.push(locationId, user.org_id, locationId, user.org_id, locationId);
    }
    const safeLimit = Math.min(Math.max(Number(input?.limit) || 5000, 1), 10000);
    params.push(safeLimit);
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`SELECT a.id, a.action, a.resource_type AS resourceType, a.resource_id AS resourceId, a.ip_address AS ipAddress, a.metadata, a.created_at AS createdAt,
      u.id AS actorId, u.name AS actorName, u.email AS actorEmail,
      COALESCE(f.name,fd.name,tf.name) AS resourceName,
      COALESCE(tff.name,tfd.name,tf.name) AS teamFolderName
      FROM audit_logs a
      LEFT JOIN users u ON u.id=a.actor_id
      LEFT JOIN files f ON a.resource_type='FILE' AND f.id=a.resource_id
      LEFT JOIN folders fd ON a.resource_type='FOLDER' AND fd.id=a.resource_id
      LEFT JOIN team_folders tf ON a.resource_type='TEAM_FOLDER' AND tf.id=a.resource_id
      LEFT JOIN folders ffd ON a.resource_type='FILE' AND ffd.id=f.folder_id
      LEFT JOIN team_folders tff ON a.resource_type='FILE' AND tff.id=ffd.team_folder_id
      LEFT JOIN team_folders tfd ON a.resource_type='FOLDER' AND tfd.id=fd.team_folder_id
      WHERE ${where.join(' AND ')}
      ORDER BY a.created_at DESC LIMIT ?`, ...params);

    const humanize = (action: string) => action.replaceAll('_', ' ').replace(/\bFILE /, 'File ').replace(/\bFOLDER /, 'Folder ').replace(/\bORG /, 'Organization ');
    const reportRows = rows.map((r) => ({
      id: r.id, actor: { id: r.actorId, name: r.actorName, email: r.actorEmail }, createdAt: r.createdAt, action: r.action,
      actionLabel: humanize(r.action), resourceType: r.resourceType, resourceId: r.resourceId, resourceName: r.resourceName || null, teamFolderName: r.teamFolderName || null,
      location: r.ipAddress || '—', metadata: r.metadata || null,
    }));
    return { generatedAt: new Date().toISOString(), criteria: { locationType, locationId, actorId, range, from: from.toISOString(), to: to.toISOString(), actions }, total: reportRows.length, rows: reportRows };
  }




  async consoleSettings(user: AccessTokenPayload) {
    this.assertAdmin(user);
    const row = await this.ensureConsoleSettings(user.org_id);
    return this.serializeConsoleSettings(row);
  }

  private serializeConsoleSettings(row: any) {
    if (!row) return {};
    return {
      ...row,
      myFoldersLimitBytes: row.myFoldersLimitBytes == null ? null : String(row.myFoldersLimitBytes),
    };
  }

  async updateConsoleSettings(user: AccessTokenPayload, input: Record<string, unknown>) {
    this.assertAdmin(user);
    const current = await this.ensureConsoleSettings(user.org_id);
    const currentSettings = this.serializeConsoleSettings(current);
    const bool = (key: string) => typeof input[key] === 'boolean' ? input[key] : currentSettings[key];
    const str = (key: string, fallback?: string) => typeof input[key] === 'string' && String(input[key]).length ? String(input[key]) : (currentSettings[key] ?? fallback ?? null);
    const intOrNull = (key: string) => input[key] === null ? null : Number.isFinite(Number(input[key])) ? Math.trunc(Number(input[key])) : currentSettings[key] ?? null;
    const logo = typeof input.logoDataUrl === 'string' ? input.logoDataUrl : currentSettings.logoDataUrl ?? null;
    const customDomain = Object.prototype.hasOwnProperty.call(input, 'customDomain') ? (input.customDomain == null || String(input.customDomain).trim() === '' ? null : String(input.customDomain).trim()) : currentSettings.customDomain ?? null;
    if (logo && logo.length > 8_000_000) throw new BadRequestException('Logo is too large');
    const thumbnailSize = Math.min(5, Math.max(1, Number(input.thumbnailSize ?? currentSettings.thumbnailSize ?? 3)));
    const versionLimit = input.versionLimit === null ? null : Math.max(1, Math.trunc(Number(input.versionLimit ?? currentSettings.versionLimit ?? 1)));
    const myFoldersLimit = input.myFoldersLimitBytes === null || input.myFoldersLimitBytes === undefined ? currentSettings.myFoldersLimitBytes ?? null : Math.max(0, Math.trunc(Number(input.myFoldersLimitBytes)));
    const updated = await this.prisma.adminConsoleSetting.update({
      where: { orgId: user.org_id },
      data: {
        logoDataUrl: logo,
        customDomain,
        defaultView: str('defaultView', 'COMPACT'),
        thumbnailSize,
        previewPanel: str('previewPanel', 'PREVIEW'),
        convertOnUpload: bool('convertOnUpload'),
        allowNonZohoWriter: bool('allowNonZohoWriter'),
        allowNonZohoSheet: bool('allowNonZohoSheet'),
        allowNonZohoShow: bool('allowNonZohoShow'),
        saveNewFilesAsDrafts: bool('saveNewFilesAsDrafts'),
        ocrLanguage: str('ocrLanguage', 'NONE'),
        allowDirectEmailSharing: bool('allowDirectEmailSharing'),
        directSharingScope: str('directSharingScope', 'ANY_EXTERNAL_USER'),
        allowExternalShareLinks: bool('allowExternalShareLinks'),
        enforceSharePasswords: bool('enforceSharePasswords'),
        defaultShareExpiryDays: intOrNull('defaultShareExpiryDays'),
        collectExternalUserInfo: bool('collectExternalUserInfo'),
        allowDownloadLinks: bool('allowDownloadLinks'),
        downloadLinkExpiryDays: intOrNull('downloadLinkExpiryDays'),
        allowPermalinkEmbeds: bool('allowPermalinkEmbeds'),
        allowEmbedDownloadPrint: bool('allowEmbedDownloadPrint'),
        allowCollections: bool('allowCollections'),
        collectionManagerScope: str('collectionManagerScope', 'ANYONE_ON_TEAM'),
        collectionExternalName: str('collectionExternalName', 'COLLECTION'),
        myFoldersLimitBytes: myFoldersLimit == null ? null : BigInt(myFoldersLimit),
        versionMode: str('versionMode', 'ALL'),
        versionLimit,
        publicTeamFolderCreator: str('publicTeamFolderCreator', 'ANYONE'),
        privateTeamFolderCreator: str('privateTeamFolderCreator', 'ANYONE'),
        sameDomainJoinEnabled: bool('sameDomainJoinEnabled'),
      },
    });
    await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'ADMIN_CONSOLE_SETTINGS_UPDATED', resourceType: 'ORGANIZATION', resourceId: user.org_id } });
    return this.serializeConsoleSettings(updated);
  }

  private async ensureConsoleSettings(orgId: string) {
    // Render environments can contain a database whose migration history says the
    // Admin Console settings migration ran while the physical table/columns were
    // created only partially. Repair the physical shape before every read/write.
    // The repair is intentionally idempotent and does not depend on Prisma's
    // generated client, so an older deployed client can recover too.
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
      UNIQUE KEY admin_console_settings_org_id_key (org_id)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

    const expectedColumns: Array<[string, string]> = [
      ['logo_data_url', 'LONGTEXT NULL'], ['custom_domain', 'VARCHAR(255) NULL'],
      ['default_view', "VARCHAR(20) NOT NULL DEFAULT 'COMPACT'"], ['thumbnail_size', 'INTEGER NOT NULL DEFAULT 3'],
      ['preview_panel', "VARCHAR(30) NOT NULL DEFAULT 'PREVIEW'"], ['convert_on_upload', 'BOOLEAN NOT NULL DEFAULT false'],
      ['allow_non_zoho_writer', 'BOOLEAN NOT NULL DEFAULT true'], ['allow_non_zoho_sheet', 'BOOLEAN NOT NULL DEFAULT true'],
      ['allow_non_zoho_show', 'BOOLEAN NOT NULL DEFAULT true'], ['save_new_files_as_drafts', 'BOOLEAN NOT NULL DEFAULT true'],
      ['ocr_language', "VARCHAR(20) NOT NULL DEFAULT 'NONE'"], ['allow_direct_email_sharing', 'BOOLEAN NOT NULL DEFAULT true'],
      ['direct_sharing_scope', "VARCHAR(30) NOT NULL DEFAULT 'ANY_EXTERNAL_USER'"], ['allow_external_share_links', 'BOOLEAN NOT NULL DEFAULT true'],
      ['enforce_share_passwords', 'BOOLEAN NOT NULL DEFAULT false'], ['default_share_expiry_days', 'INTEGER NULL'],
      ['collect_external_user_info', 'BOOLEAN NOT NULL DEFAULT false'], ['allow_download_links', 'BOOLEAN NOT NULL DEFAULT true'],
      ['download_link_expiry_days', 'INTEGER NULL'], ['allow_permalink_embeds', 'BOOLEAN NOT NULL DEFAULT true'],
      ['allow_embed_download_print', 'BOOLEAN NOT NULL DEFAULT true'], ['allow_collections', 'BOOLEAN NOT NULL DEFAULT true'],
      ['collection_manager_scope', "VARCHAR(30) NOT NULL DEFAULT 'ANYONE_ON_TEAM'"], ['collection_external_name', "VARCHAR(30) NOT NULL DEFAULT 'COLLECTION'"],
      ['my_folders_limit_bytes', 'BIGINT NULL'], ['version_mode', "VARCHAR(30) NOT NULL DEFAULT 'ALL'"],
      ['version_limit', 'INTEGER NULL'], ['public_team_folder_creator', "VARCHAR(20) NOT NULL DEFAULT 'ANYONE'"],
      ['private_team_folder_creator', "VARCHAR(20) NOT NULL DEFAULT 'ANYONE'"], ['same_domain_join_enabled', 'BOOLEAN NOT NULL DEFAULT false'],
    ];
    const presentRows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT column_name AS columnName FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'admin_console_settings'`,
    );
    const present = new Set(presentRows.map((row) => String(row.columnName)));
    for (const [column, definition] of expectedColumns) {
      if (!present.has(column)) {
        await this.prisma.$executeRawUnsafe(`ALTER TABLE admin_console_settings ADD COLUMN ${column} ${definition}`);
      }
    }

    // Use an atomic upsert after repairing the physical table. This avoids a
    // duplicate-key race when the settings page mounts twice or two admin
    // requests arrive at the same time.
    return this.prisma.adminConsoleSetting.upsert({
      where: { orgId },
      update: {},
      create: { orgId },
    });
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