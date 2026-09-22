import { ForbiddenException, Injectable } from '@nestjs/common';
import { DlpAction, DlpScopeType, Prisma } from '@prisma/client';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../permissions/permission.service';

type DlpDecision = {
  fileId: string;
  labels: Array<{ id: string; name: string; color: string | null; actions: DlpAction[]; source: string }>;
  blocked: { download: boolean; copy: boolean; print: boolean; externalShare: boolean };
  warning: boolean;
  watermark: { enabled: boolean; text: string | null };
};

@Injectable()
export class DlpService {
  constructor(private readonly prisma: PrismaService, private readonly permissions: PermissionService) {}

  private admin(user: AccessTokenPayload) {
    if (!['ADMIN', 'SUPER_ADMIN'].includes(String(user.role))) throw new ForbiddenException('Admin access required');
  }

  async listLabels(user: AccessTokenPayload) {
    this.admin(user);
    return this.prisma.dlpClassificationLabel.findMany({ where: { orgId: user.org_id }, orderBy: { createdAt: 'desc' }, include: { _count: { select: { files: true } } } });
  }

  async createLabel(user: AccessTokenPayload, input: { name: string; description?: string; color?: string; actions?: DlpAction[]; manualOnly?: boolean }) {
    this.admin(user);
    const name = String(input.name || '').trim().slice(0, 120);
    if (!name) throw new ForbiddenException('Label name is required');
    const actions = Array.isArray(input.actions) ? input.actions.filter((x): x is DlpAction => Object.values(DlpAction).includes(x)).slice(0, 10) : [];
    return this.prisma.dlpClassificationLabel.create({ data: { orgId: user.org_id, name, description: input.description?.slice(0, 500), color: /^#[0-9a-f]{6}$/i.test(String(input.color || '')) ? input.color : null, actions, manualOnly: input.manualOnly !== false } });
  }

  async deleteLabel(user: AccessTokenPayload, id: string) {
    this.admin(user);
    await this.prisma.dlpClassificationLabel.deleteMany({ where: { id, orgId: user.org_id } });
    return { ok: true };
  }

  async listPolicies(user: AccessTokenPayload) {
    this.admin(user);
    return this.prisma.dlpPolicy.findMany({ where: { orgId: user.org_id }, orderBy: { createdAt: 'desc' }, include: { label: true } });
  }

  async createPolicy(user: AccessTokenPayload, input: { name: string; description?: string; enabled?: boolean; scopeType?: DlpScopeType; folderIds?: string[]; keywords?: string[]; extensions?: string[]; caseSensitive?: boolean; labelId: string }) {
    this.admin(user);
    const label = await this.prisma.dlpClassificationLabel.findFirst({ where: { id: input.labelId, orgId: user.org_id } });
    if (!label) throw new ForbiddenException('Classification label not found');
    const name = String(input.name || '').trim().slice(0, 120);
    if (!name) throw new ForbiddenException('Policy name is required');
    return this.prisma.dlpPolicy.create({ data: {
      orgId: user.org_id, name, description: input.description?.slice(0, 500), enabled: input.enabled !== false,
      scopeType: input.scopeType ?? DlpScopeType.ALL, folderIds: (input.folderIds ?? []).slice(0, 100),
      keywords: (input.keywords ?? []).map(x => String(x).trim().slice(0, 120)).filter(Boolean).slice(0, 100),
      extensions: (input.extensions ?? []).map(x => String(x).replace(/^\./, '').toLowerCase().slice(0, 20)).filter(Boolean).slice(0, 100),
      caseSensitive: Boolean(input.caseSensitive), labelId: label.id,
    } });
  }

  async updatePolicy(user: AccessTokenPayload, id: string, input: Partial<{ name: string; description: string; enabled: boolean; scopeType: DlpScopeType; folderIds: string[]; keywords: string[]; extensions: string[]; caseSensitive: boolean; labelId: string }>) {
    this.admin(user);
    const current = await this.prisma.dlpPolicy.findFirst({ where: { id, orgId: user.org_id } });
    if (!current) throw new ForbiddenException('DLP policy not found');
    if (input.labelId) {
      const label = await this.prisma.dlpClassificationLabel.findFirst({ where: { id: input.labelId, orgId: user.org_id } });
      if (!label) throw new ForbiddenException('Classification label not found');
    }
    return this.prisma.dlpPolicy.update({ where: { id }, data: {
      ...(input.name !== undefined ? { name: String(input.name).trim().slice(0,120) } : {}),
      ...(input.description !== undefined ? { description: String(input.description).slice(0,500) } : {}),
      ...(input.enabled !== undefined ? { enabled: Boolean(input.enabled) } : {}),
      ...(input.scopeType !== undefined ? { scopeType: input.scopeType } : {}),
      ...(input.folderIds !== undefined ? { folderIds: input.folderIds.slice(0,100) } : {}),
      ...(input.keywords !== undefined ? { keywords: input.keywords.map(x=>String(x).trim().slice(0,120)).filter(Boolean).slice(0,100) } : {}),
      ...(input.extensions !== undefined ? { extensions: input.extensions.map(x=>String(x).replace(/^\./,'').toLowerCase().slice(0,20)).filter(Boolean).slice(0,100) } : {}),
      ...(input.caseSensitive !== undefined ? { caseSensitive: Boolean(input.caseSensitive) } : {}),
      ...(input.labelId !== undefined ? { labelId: input.labelId } : {}),
    } });
  }

  async deletePolicy(user: AccessTokenPayload, id: string) {
    this.admin(user);
    await this.prisma.dlpPolicy.deleteMany({ where: { id, orgId: user.org_id } });
    return { ok: true };
  }

  async classifyFile(user: AccessTokenPayload, fileId: string) {
    const file = await this.prisma.file.findFirst({ where: { id: fileId, orgId: user.org_id }, select: { id:true,name:true,extension:true,folderId:true,mimeType:true } });
    if (!file) return { matched: 0 };
    const policies = await this.prisma.dlpPolicy.findMany({ where: { orgId: user.org_id, enabled: true }, include: { label: true } });
    const matches = policies.filter(p => this.matches(p, file));
    for (const p of matches) {
      if (p.label.manualOnly) continue;
      await this.prisma.fileDlpLabel.upsert({ where: { fileId_labelId: { fileId, labelId: p.labelId } }, create: { orgId: user.org_id, fileId, labelId: p.labelId, source: 'AUTOMATIC', policyId: p.id }, update: { source: 'AUTOMATIC', policyId: p.id } });
    }
    return { matched: matches.length };
  }

  async associateLabel(user: AccessTokenPayload, fileId: string, labelId: string) {
    const file = await this.prisma.file.findFirst({ where: { id: fileId, orgId: user.org_id }, select: { id: true, ownerId: true, folder: { select: { teamFolderId: true } } } });
    const label = await this.prisma.dlpClassificationLabel.findFirst({ where: { id: labelId, orgId: user.org_id } });
    if (!file || !label) throw new ForbiddenException('File or classification label not found');
    const resource = { orgId: user.org_id, ownerId: file.ownerId, teamFolderId: file.folder?.teamFolderId ?? null };
    if (!this.permissions.canWrite(user, resource)) throw new ForbiddenException('Edit permission required to classify this file');
    if (!label.manualOnly) throw new ForbiddenException('Automatic labels cannot be assigned manually');
    return this.prisma.fileDlpLabel.upsert({ where: { fileId_labelId: { fileId, labelId } }, create: { orgId:user.org_id,fileId,labelId,source:'MANUAL' }, update: { source:'MANUAL' } });
  }

  async removeLabel(user: AccessTokenPayload, fileId: string, labelId: string) {
    const file = await this.prisma.file.findFirst({ where: { id: fileId, orgId: user.org_id }, select: { ownerId:true, folder:{select:{teamFolderId:true}} } });
    if (!file || !this.permissions.canWrite(user, { orgId:user.org_id, ownerId:file.ownerId, teamFolderId:file.folder?.teamFolderId ?? null })) throw new ForbiddenException('Edit permission required to classify this file');
    await this.prisma.fileDlpLabel.deleteMany({ where: { orgId: user.org_id, fileId, labelId, source: 'MANUAL' } });
    return { ok: true };
  }

  async evaluate(user: AccessTokenPayload, fileId: string): Promise<DlpDecision> {
    const file = await this.prisma.file.findFirst({ where: { id: fileId, orgId: user.org_id }, select: { id:true,folderId:true } });
    if (!file) throw new ForbiddenException('File not found');
    await this.classifyFile(user, fileId);
    const labels = await this.prisma.fileDlpLabel.findMany({ where: { orgId:user.org_id,fileId }, include: { label:true } });
    const actions = labels.flatMap(x => Array.isArray(x.label.actions) ? x.label.actions as DlpAction[] : []);
    const officeDocument = await this.prisma.officeDocument.findUnique({ where: { fileId }, select: { id:true } }).catch(()=>null);
    const office = officeDocument ? await this.prisma.officeDocumentPolicy.findUnique({ where: { documentId: officeDocument.id }, select: { watermarkEnabled:true,watermarkText:true } }).catch(()=>null) : null;
    const orgOffice = await this.prisma.officeSecurityPolicy.findUnique({ where: { orgId:user.org_id }, select: { requireWatermark:true,watermarkText:true } }).catch(()=>null);
    return {
      fileId,
      labels: labels.map(x=>({id:x.label.id,name:x.label.name,color:x.label.color,actions:Array.isArray(x.label.actions) ? x.label.actions as DlpAction[] : [],source:x.source})),
      blocked: { download: actions.includes(DlpAction.BLOCK_DOWNLOAD), copy: actions.includes(DlpAction.BLOCK_COPY), print: actions.includes(DlpAction.BLOCK_PRINT), externalShare: actions.includes(DlpAction.BLOCK_EXTERNAL_SHARE) },
      warning: actions.includes(DlpAction.WARN_EXTERNAL_SHARE),
      watermark: { enabled: Boolean(office?.watermarkEnabled || orgOffice?.requireWatermark || actions.includes(DlpAction.WATERMARK)), text: office?.watermarkText || orgOffice?.watermarkText || null },
    };
  }

  async isOrgActionBlocked(orgId: string, fileId: string, action: 'DOWNLOAD'|'EXTERNAL_SHARE') {
    const labels = await this.prisma.fileDlpLabel.findMany({ where: { orgId, fileId }, include: { label: true } });
    const wanted = action === 'DOWNLOAD' ? DlpAction.BLOCK_DOWNLOAD : DlpAction.BLOCK_EXTERNAL_SHARE;
    return labels.some(x => Array.isArray(x.label.actions) && (x.label.actions as DlpAction[]).includes(wanted));
  }

  async assertAllowed(user: AccessTokenPayload, fileId: string, action: 'DOWNLOAD'|'COPY'|'PRINT'|'EXTERNAL_SHARE') {
    const decision = await this.evaluate(user, fileId);
    const key = action === 'DOWNLOAD' ? 'download' : action === 'COPY' ? 'copy' : action === 'PRINT' ? 'print' : 'externalShare';
    if (decision.blocked[key]) {
      await this.prisma.auditLog.create({ data: { orgId:user.org_id, actorId:user.sub, action:`DLP_BLOCK_${action}`, resourceType:'FILE', resourceId:fileId, metadata: decision as unknown as Prisma.InputJsonValue } });
      throw new ForbiddenException(`DLP policy blocks ${action.toLowerCase()} for this file`);
    }
    return decision;
  }

  async assertFolderExternalShare(user: AccessTokenPayload, folderId: string) {
    const files = await this.prisma.file.findMany({ where: { orgId: user.org_id, folderId, deletedAt: null, status: 'ACTIVE' }, select: { id: true } });
    for (const file of files) await this.assertAllowed(user, file.id, 'EXTERNAL_SHARE');
    return true;
  }

  private matches(policy: any, file: { name:string; extension:string|null; folderId:string|null }) {
    const folderIds = Array.isArray(policy.folderIds) ? policy.folderIds.map(String) : [];
    if (policy.scopeType === DlpScopeType.SELECTED_FOLDERS && !folderIds.includes(String(file.folderId ?? ''))) return false;
    if (policy.scopeType === DlpScopeType.EXCLUDED_FOLDERS && file.folderId && folderIds.includes(String(file.folderId))) return false;
    const name = policy.caseSensitive ? file.name : file.name.toLowerCase();
    const keywords = (Array.isArray(policy.keywords) ? policy.keywords : []).map((x:string)=>policy.caseSensitive?x:String(x).toLowerCase());
    const keywordMatch = keywords.length > 0 && keywords.some((x:string)=>name.includes(x));
    const extensions = Array.isArray(policy.extensions) ? policy.extensions : [];
    const ext = String(file.extension ?? '').replace(/^\./,'').toLowerCase();
    const extMatch = extensions.length > 0 && extensions.map((x:string)=>String(x).toLowerCase()).includes(ext);
    return (keywords.length === 0 && extensions.length === 0) || keywordMatch || extMatch;
  }
}
