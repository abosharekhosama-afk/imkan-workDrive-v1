import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { DlpAction, DlpScopeType, Prisma } from '@prisma/client';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../permissions/permission.service';
import { STORAGE_SERVICE, type StorageService } from '../storage/storage.types';
import { DLP_LABEL_LIMIT, DLP_POLICY_LIMIT, DLP_RULE_LIMIT, mergePolicyKeywords, policyMatchesContent, splitStoredKeywords } from './dlp-identifiers';

type DlpDecision = {
  fileId: string;
  labels: Array<{ id: string; name: string; color: string | null; actions: DlpAction[]; source: string }>;
  blocked: { download: boolean; copy: boolean; print: boolean; externalShare: boolean };
  warning: boolean;
  watermark: { enabled: boolean; text: string | null };
};

@Injectable()
export class DlpService {
  constructor(private readonly prisma: PrismaService, private readonly permissions: PermissionService, @Inject(STORAGE_SERVICE) private readonly storage: StorageService) {}

  private admin(user: AccessTokenPayload) {
    if (!['ADMIN', 'SUPER_ADMIN'].includes(String(user.role))) throw new ForbiddenException('Admin access required');
  }

  async listLabels(user: AccessTokenPayload) {
    this.admin(user);
    return this.prisma.dlpClassificationLabel.findMany({ where: { orgId: user.org_id }, orderBy: { createdAt: 'desc' }, include: { _count: { select: { files: true } } } });
  }

  async createLabel(user: AccessTokenPayload, input: { name: string; description?: string; color?: string; actions?: DlpAction[]; manualOnly?: boolean }) {
    this.admin(user);
    const count = await this.prisma.dlpClassificationLabel.count({ where: { orgId: user.org_id } });
    if (count >= DLP_LABEL_LIMIT) throw new ForbiddenException('You can create up to 200 classification labels');
    const name = String(input.name || '').trim().slice(0, 120);
    if (!name) throw new ForbiddenException('Label name is required');
    const actions = this.cleanActions(input.actions);
    const created = await this.prisma.dlpClassificationLabel.create({ data: { orgId: user.org_id, name, description: input.description?.slice(0, 500), color: this.color(input.color), actions, manualOnly: input.manualOnly !== false } }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ForbiddenException('A classification label with this name already exists');
      throw error;
    });
    await this.audit(user, 'CREATE_CLASSIFICATION_LABEL', created.id);
    return created;
  }

  async updateLabel(user: AccessTokenPayload, id: string, input: { name?: string; description?: string; color?: string; actions?: DlpAction[]; manualOnly?: boolean }) {
    this.admin(user);
    const current = await this.prisma.dlpClassificationLabel.findFirst({ where: { id, orgId: user.org_id } });
    if (!current) throw new ForbiddenException('Classification label not found');
    if (input.manualOnly === true) {
      const used = await this.prisma.dlpPolicy.count({ where: { orgId: user.org_id, labelId: id } });
      if (used) throw new ForbiddenException('A label used by a DLP policy must stay automatic');
    }
    const updated = await this.prisma.dlpClassificationLabel.update({ where: { id }, data: {
      ...(input.name !== undefined ? { name: String(input.name).trim().slice(0, 120) } : {}),
      ...(input.description !== undefined ? { description: String(input.description).slice(0, 500) } : {}),
      ...(input.color !== undefined ? { color: this.color(input.color) } : {}),
      ...(input.actions !== undefined ? { actions: this.cleanActions(input.actions) } : {}),
      ...(input.manualOnly !== undefined ? { manualOnly: Boolean(input.manualOnly) } : {}),
    } });
    await this.audit(user, 'EDIT_CLASSIFICATION_LABEL', id);
    return updated;
  }

  async deleteLabel(user: AccessTokenPayload, id: string) {
    this.admin(user);
    const used = await this.prisma.dlpPolicy.count({ where: { orgId: user.org_id, labelId: id } });
    if (used) throw new ForbiddenException('This classification label is used by a DLP policy');
    await this.prisma.dlpClassificationLabel.deleteMany({ where: { id, orgId: user.org_id } });
    await this.audit(user, 'DELETE_CLASSIFICATION_LABEL', id);
    return { ok: true };
  }

  async labelFiles(user: AccessTokenPayload, labelId: string) {
    this.admin(user);
    const label = await this.prisma.dlpClassificationLabel.findFirst({ where: { id: labelId, orgId: user.org_id }, select: { id: true, name: true } });
    if (!label) throw new ForbiddenException('Classification label not found');
    const rows = await this.prisma.fileDlpLabel.findMany({ where: { orgId: user.org_id, labelId }, include: { file: { select: { id: true, name: true, extension: true } } }, orderBy: { createdAt: 'desc' } });
    return rows.map((row) => ({ id: row.id, fileId: row.fileId, source: row.source, file: row.file }));
  }

  async adminDetachLabel(user: AccessTokenPayload, labelId: string, fileId: string) {
    this.admin(user);
    await this.prisma.fileDlpLabel.deleteMany({ where: { orgId: user.org_id, labelId, fileId } });
    return { ok: true };
  }

  async listPolicies(user: AccessTokenPayload) {
    this.admin(user);
    const rows = await this.prisma.dlpPolicy.findMany({ where: { orgId: user.org_id }, orderBy: { createdAt: 'desc' }, include: { label: true } });
    return rows.map((row) => this.presentPolicy(row));
  }

  async createPolicy(user: AccessTokenPayload, input: { name: string; description?: string; enabled?: boolean; scopeType?: DlpScopeType; folderIds?: string[]; keywords?: string[]; extensions?: string[]; sensitiveTypes?: string[]; caseSensitive?: boolean; labelId: string }) {
    this.admin(user);
    const count = await this.prisma.dlpPolicy.count({ where: { orgId: user.org_id } });
    if (count >= DLP_POLICY_LIMIT) throw new ForbiddenException('You can create up to 100 DLP policies');
    const label = await this.prisma.dlpClassificationLabel.findFirst({ where: { id: input.labelId, orgId: user.org_id } });
    if (!label) throw new ForbiddenException('Classification label not found');
    if (label.manualOnly) throw new ForbiddenException('Manual classification labels cannot be used in a DLP policy');
    const name = String(input.name || '').trim().slice(0, 120);
    if (!name) throw new ForbiddenException('Policy name is required');
    const keywords = mergePolicyKeywords(input.keywords ?? [], input.sensitiveTypes ?? []);
    const extensions = this.cleanExtensions(input.extensions ?? []);
    if (keywords.length + extensions.length < 1) throw new ForbiddenException('Add at least one policy rule');
    if (keywords.length + extensions.length > DLP_RULE_LIMIT) throw new ForbiddenException('Each DLP policy can contain a maximum of 10 rules');
    const scopeType = input.scopeType ?? DlpScopeType.ALL;
    if (scopeType !== DlpScopeType.ALL && (input.folderIds ?? []).length === 0) throw new ForbiddenException('Select at least one folder');
    const created = await this.prisma.dlpPolicy.create({ data: {
      orgId: user.org_id, name, description: input.description?.slice(0, 500), enabled: input.enabled !== false,
      scopeType, folderIds: (input.folderIds ?? []).slice(0, 100),
      keywords, extensions, caseSensitive: Boolean(input.caseSensitive), labelId: label.id,
    }, include: { label: true } });
    await this.audit(user, 'CREATE_DLP_POLICY', created.id);
    return this.presentPolicy(created);
  }

  async updatePolicy(user: AccessTokenPayload, id: string, input: Partial<{ name: string; description: string; enabled: boolean; scopeType: DlpScopeType; folderIds: string[]; keywords: string[]; extensions: string[]; sensitiveTypes: string[]; caseSensitive: boolean; labelId: string }>) {
    this.admin(user);
    const current = await this.prisma.dlpPolicy.findFirst({ where: { id, orgId: user.org_id } });
    if (!current) throw new ForbiddenException('DLP policy not found');
    if (input.labelId) {
      const label = await this.prisma.dlpClassificationLabel.findFirst({ where: { id: input.labelId, orgId: user.org_id } });
      if (!label) throw new ForbiddenException('Classification label not found');
      if (label.manualOnly) throw new ForbiddenException('Manual classification labels cannot be used in a DLP policy');
    }
    const stored = Array.isArray(current.keywords) ? current.keywords.map(String) : [];
    const currentSplit = splitStoredKeywords(stored);
    const keywords = input.keywords !== undefined || input.sensitiveTypes !== undefined
      ? mergePolicyKeywords(input.keywords ?? currentSplit.keywords, input.sensitiveTypes ?? currentSplit.sensitiveTypes)
      : undefined;
    const extensions = input.extensions !== undefined ? this.cleanExtensions(input.extensions) : undefined;
    const nextRuleCount = (keywords?.length ?? stored.length) + (extensions?.length ?? (Array.isArray(current.extensions) ? current.extensions.length : 0));
    if (nextRuleCount < 1) throw new ForbiddenException('Add at least one policy rule');
    if (nextRuleCount > DLP_RULE_LIMIT) throw new ForbiddenException('Each DLP policy can contain a maximum of 10 rules');
    const nextScope = input.scopeType ?? current.scopeType;
    const nextFolders = input.folderIds ?? (Array.isArray(current.folderIds) ? current.folderIds : []);
    if (nextScope !== DlpScopeType.ALL && nextFolders.length === 0) throw new ForbiddenException('Select at least one folder');
    const updated = await this.prisma.dlpPolicy.update({ where: { id }, data: {
      ...(input.name !== undefined ? { name: String(input.name).trim().slice(0,120) } : {}),
      ...(input.description !== undefined ? { description: String(input.description).slice(0,500) } : {}),
      ...(input.enabled !== undefined ? { enabled: Boolean(input.enabled) } : {}),
      ...(input.scopeType !== undefined ? { scopeType: input.scopeType } : {}),
      ...(input.folderIds !== undefined ? { folderIds: input.folderIds.slice(0,100) } : {}),
      ...(keywords !== undefined ? { keywords } : {}),
      ...(extensions !== undefined ? { extensions } : {}),
      ...(input.caseSensitive !== undefined ? { caseSensitive: Boolean(input.caseSensitive) } : {}),
      ...(input.labelId !== undefined ? { labelId: input.labelId } : {}),
    }, include: { label: true } });
    await this.audit(user, input.enabled === false ? 'DISABLE_DLP_POLICY' : input.enabled === true ? 'ENABLE_DLP_POLICY' : 'EDIT_DLP_POLICY', id);
    return this.presentPolicy(updated);
  }

  async deletePolicy(user: AccessTokenPayload, id: string) {
    this.admin(user);
    await this.prisma.dlpPolicy.deleteMany({ where: { id, orgId: user.org_id } });
    await this.audit(user, 'DELETE_DLP_POLICY', id);
    return { ok: true };
  }

  async classifyFile(user: AccessTokenPayload, fileId: string) {
    const file = await this.prisma.file.findFirst({ where: { id: fileId, orgId: user.org_id }, select: { id:true,name:true,extension:true,folderId:true,mimeType:true } });
    if (!file) return { matched: 0 };
    const content = await this.fileText(fileId);
    const policies = await this.prisma.dlpPolicy.findMany({ where: { orgId: user.org_id, enabled: true }, include: { label: true } });
    const matches = policies.filter(p => this.matches(p, file, content));
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

  private matches(policy: { scopeType: DlpScopeType; folderIds: Prisma.JsonValue; keywords: Prisma.JsonValue; extensions: Prisma.JsonValue; caseSensitive: boolean }, file: { name:string; extension:string|null; folderId:string|null }, content: string) {
    const folderIds = Array.isArray(policy.folderIds) ? policy.folderIds.map(String) : [];
    if (policy.scopeType === DlpScopeType.SELECTED_FOLDERS && !folderIds.includes(String(file.folderId ?? ''))) return false;
    if (policy.scopeType === DlpScopeType.EXCLUDED_FOLDERS && file.folderId && folderIds.includes(String(file.folderId))) return false;
    const stored = Array.isArray(policy.keywords) ? policy.keywords.map(String) : [];
    const split = splitStoredKeywords(stored);
    const extensions = Array.isArray(policy.extensions) ? policy.extensions.map(String) : [];
    return policyMatchesContent({ ...split, extensions, caseSensitive: policy.caseSensitive, fileName: file.name, extension: file.extension, content });
  }

  private presentPolicy<T extends { keywords: Prisma.JsonValue }>(row: T) {
    const stored = Array.isArray(row.keywords) ? row.keywords.map(String) : [];
    return { ...row, ...splitStoredKeywords(stored) };
  }

  private cleanActions(actions: DlpAction[] | undefined): DlpAction[] {
    return Array.isArray(actions) ? actions.filter((item): item is DlpAction => Object.values(DlpAction).includes(item)).slice(0, 6) : [];
  }

  private cleanExtensions(extensions: string[]): string[] {
    return extensions.map((item) => String(item).replace(/^\./, '').toLowerCase().slice(0, 20)).filter(Boolean).slice(0, DLP_RULE_LIMIT);
  }

  private color(value: string | undefined): string | null {
    return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : null;
  }

  private async fileText(fileId: string): Promise<string> {
    const version = await this.prisma.fileVersion.findFirst({
      where: { fileId, status: 'ACTIVE', uploadStatus: 'COMPLETE' },
      orderBy: { versionNumber: 'desc' },
      include: { storageObject: true },
    });
    const ext = String(version?.extension ?? '').replace(/^\./, '').toLowerCase();
    const mime = String(version?.mimeType ?? '');
    const textLike = mime.startsWith('text/') || ['txt', 'csv', 'json', 'xml', 'html', 'md', 'log', 'tsv'].includes(ext);
    if (!version?.storageObject?.storageKey || !textLike || version.size > 300_000n) return '';
    try {
      const bytes = await this.storage.readStoredObject(version.storageObject.storageKey);
      return bytes.subarray(0, 200_000).toString('utf8');
    } catch {
      return '';
    }
  }

  private async audit(user: AccessTokenPayload, action: string, resourceId: string) {
    await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action, resourceType: 'FILE', resourceId } }).catch(() => undefined);
  }
}
