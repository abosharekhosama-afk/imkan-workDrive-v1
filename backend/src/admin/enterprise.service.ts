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
    const [storage, activeUsers, suspendedUsers, externalShares, largeFiles, recentAudit] = await Promise.all([
      this.prisma.$queryRawUnsafe<any[]>(`SELECT COALESCE(SUM(size),0) AS usedBytes, COUNT(*) AS files FROM files WHERE org_id=? AND status='ACTIVE'`, orgId),
      this.prisma.organizationMembership.count({ where: { organizationId: orgId, status: MembershipStatus.ACTIVE } }),
      this.prisma.organizationMembership.count({ where: { organizationId: orgId, status: MembershipStatus.SUSPENDED } }),
      this.prisma.fileShare.count({ where: { orgId, status: 'ACTIVE' } }),
      this.prisma.$queryRawUnsafe<any[]>(`SELECT id,name,size,owner_id AS ownerId,updated_at AS updatedAt FROM files WHERE org_id=? AND status='ACTIVE' ORDER BY size DESC LIMIT 10`, orgId),
      this.prisma.auditLog.findMany({ where: { orgId }, orderBy: { createdAt: 'desc' }, take: 12, select: { id: true, action: true, resourceType: true, resourceId: true, actorId: true, createdAt: true } }),
    ]);
    return {
      storage: { usedBytes: Number(storage[0]?.usedBytes ?? 0), files: Number(storage[0]?.files ?? 0) },
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