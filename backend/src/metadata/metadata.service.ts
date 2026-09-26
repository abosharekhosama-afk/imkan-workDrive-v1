import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { PermissionService } from '../permissions/permission.service';
import { PrismaService } from '../prisma/prisma.service';

export type DataTemplateField = {
  key: string;
  label: string;
  type: 'text'|'multiline'|'email'|'number'|'date'|'datetime'|'boolean'|'select'|'radio';
  required?: boolean;
  searchable?: boolean;
  options?: string[];
  description?: string;
};

type AssociationScope = 'ALL_EDIT' | 'SPECIFIC';
type MandateTarget = 'FILES' | 'FOLDERS' | 'BOTH';

function normalizeFields(value: unknown): DataTemplateField[] {
  if (!Array.isArray(value) || value.length > 150) throw new BadRequestException('schema must contain between 0 and 150 fields');
  const seen = new Set<string>();
  let multiLine = 0;
  let searchable = 0;
  return value.map((raw) => {
    if (!raw || typeof raw !== 'object') throw new BadRequestException('Invalid data template field');
    const r = raw as Record<string, unknown>;
    const key = typeof r.key === 'string' ? r.key.trim() : '';
    const label = typeof r.label === 'string' ? r.label.trim() : key;
    const type = String(r.type ?? 'text');
    if (!/^[A-Za-z][A-Za-z0-9_.-]{0,49}$/.test(key) || seen.has(key)) throw new BadRequestException('Invalid or duplicate field key');
    if (!['text','multiline','email','number','date','datetime','boolean','select','radio'].includes(type)) throw new BadRequestException(`Unsupported field type: ${type}`);
    if (!label || label.length > 50) throw new BadRequestException('Custom field name must be 1-50 characters');
    const description = typeof r.description === 'string' ? r.description.trim() : undefined;
    if (description && description.length > 200) throw new BadRequestException('Custom field description must be at most 200 characters');
    if (type === 'multiline') { multiLine += 1; if (multiLine > 5) throw new BadRequestException('A data template can contain at most 5 multi-line fields'); }
    const options = ['select','radio'].includes(type)
      ? (Array.isArray(r.options) ? r.options.map(String).map((x) => x.trim()).filter(Boolean).slice(0, 100) : [])
      : undefined;
    if (['select','radio'].includes(type) && !options?.length) throw new BadRequestException(`${type} fields require options`);
    if (options?.some((x) => x.length > 100)) throw new BadRequestException('Choice options must be at most 100 characters');
    const isSearchable = r.searchable !== false;
    if (isSearchable) searchable += 1;
    if (searchable > 1000) throw new BadRequestException('Too many searchable custom fields');
    seen.add(key);
    return {
      key,
      label,
      type: type as DataTemplateField['type'],
      required: r.required === true,
      searchable: isSearchable,
      ...(description ? { description } : {}),
      ...(options ? { options } : {}),
    };
  });
}

function validateFields(schema: DataTemplateField[], value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('customFields must be an object');
  const input = value as Record<string, unknown>;
  const allowed = new Set(schema.map((field) => field.key));
  for (const key of Object.keys(input)) if (!allowed.has(key)) throw new BadRequestException(`Unknown custom field: ${key}`);
  const output: Record<string, unknown> = {};
  for (const field of schema) {
    const v = input[field.key];
    if (v === undefined || v === null || v === '') { if (field.required) throw new BadRequestException(`Required custom field missing: ${field.key}`); continue; }
    if ((field.type === 'text' || field.type === 'multiline' || field.type === 'email') && typeof v !== 'string') throw new BadRequestException(`${field.key} must be text`);
    if (field.type === 'email' && !/^\S+@\S+\.\S+$/.test(String(v))) throw new BadRequestException(`${field.key} must be a valid email`);
    if (field.type === 'multiline' && String(v).length > 2048) throw new BadRequestException(`${field.key} is too long`);
    if (field.type === 'text' && String(v).length > 200) throw new BadRequestException(`${field.key} is too long`);
    if (field.type === 'number' && (typeof v !== 'number' || !Number.isFinite(v))) throw new BadRequestException(`${field.key} must be a number`);
    if (field.type === 'boolean' && typeof v !== 'boolean') throw new BadRequestException(`${field.key} must be boolean`);
    if ((field.type === 'date' || field.type === 'datetime') && (typeof v !== 'string' || Number.isNaN(Date.parse(v)))) throw new BadRequestException(`${field.key} must be a valid date`);
    if ((field.type === 'select' || field.type === 'radio') && (typeof v !== 'string' || !field.options?.includes(v))) throw new BadRequestException(`${field.key} has an invalid option`);
    output[field.key] = v;
  }
  return output;
}

function jsonArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [];
}

@Injectable()
export class MetadataService {
  constructor(private readonly prisma: PrismaService, private readonly permissions: PermissionService) {}

  private isOrgAdmin(user: AccessTokenPayload) { return this.permissions.isOrgAdminOrSuperAdmin(user); }

  private async canAssociate(user: AccessTokenPayload, template: any, resource: { orgId: string; ownerId: string; teamFolderId?: string | null }) {
    if (!this.permissions.canWrite(user, resource)) throw new ForbiddenException('Edit permission required');
    if (template.associationScope === 'ALL_EDIT') return true;
    const members = jsonArray(template.allowedMemberIds);
    const groups = jsonArray(template.allowedGroupIds);
    if (members.includes(user.sub)) return true;
    if (groups.length) {
      const membership = await this.prisma.groupMember.findFirst({ where: { orgId: user.org_id, userId: user.sub, groupId: { in: groups } } });
      if (membership) return true;
    }
    throw new ForbiddenException('You are not allowed to associate this data template');
  }

  private templateFields(template: any): DataTemplateField[] { return Array.isArray(template?.schema) ? template.schema as DataTemplateField[] : []; }

  async listTemplates(user: AccessTokenPayload, includeDisabled = false) {
    const where: any = { orgId: user.org_id, ...(includeDisabled && this.isOrgAdmin(user) ? {} : { active: true }) };
    const templates = await this.prisma.fileDataTemplate.findMany({ where, include: { _count: { select: { bindings: true, folders: true, metadata: true } } }, orderBy: { name: 'asc' } });
    return templates.map((t) => ({ ...t, fieldCount: this.templateFields(t).length, searchableFieldCount: this.templateFields(t).filter((f) => f.searchable !== false).length, associationCount: t._count.bindings + t._count.folders + t._count.metadata }));
  }

  async getTemplate(user: AccessTokenPayload, id: string) {
    const template = await this.prisma.fileDataTemplate.findFirst({ where: { id, orgId: user.org_id }, include: { _count: { select: { bindings: true, folders: true, metadata: true } } } });
    if (!template) throw new NotFoundException('Data template not found');
    if (!template.active && !this.isOrgAdmin(user)) throw new NotFoundException('Data template not found');
    return { ...template, fields: this.templateFields(template), associationCount: template._count.bindings + template._count.folders + template._count.metadata };
  }

  async createTemplate(user: AccessTokenPayload, body: { name: string; description?: string; schema: unknown; associationScope?: string; allowedMemberIds?: unknown; allowedGroupIds?: unknown }) {
    if (!this.isOrgAdmin(user)) throw new ForbiddenException('Only organization administrators can manage data templates');
    const name = body.name?.trim(); if (!name || name.length > 50) throw new BadRequestException('Data template name must be 1-50 characters');
    const schema = normalizeFields(body.schema);
    const associationScope: AssociationScope = body.associationScope === 'SPECIFIC' ? 'SPECIFIC' : 'ALL_EDIT';
    const allowedMemberIds = jsonArray(body.allowedMemberIds).slice(0, 500);
    const allowedGroupIds = jsonArray(body.allowedGroupIds).slice(0, 200);
    if (associationScope === 'SPECIFIC' && !allowedMemberIds.length && !allowedGroupIds.length) throw new BadRequestException('Specific association requires at least one member or group');
    const exists = await this.prisma.fileDataTemplate.count({ where: { orgId: user.org_id } }); if (exists >= 200) throw new BadRequestException('Maximum of 200 data templates per organization reached');
    try {
      return await this.prisma.fileDataTemplate.create({ data: { orgId: user.org_id, name, description: body.description?.trim().slice(0, 200) || null, schema: schema as never, requiredFields: schema.filter((f) => f.required).map((f) => f.key) as never, searchableFieldKeys: schema.filter((f) => f.searchable !== false).map((f) => f.key) as never, associationScope, allowedMemberIds: allowedMemberIds as never, allowedGroupIds: allowedGroupIds as never, createdById: user.sub } });
    } catch (error: any) { if (error?.code === 'P2002') throw new ConflictException('A data template with this name already exists'); throw error; }
  }

  async updateTemplate(user: AccessTokenPayload, id: string, body: { name?: string; description?: string; schema?: unknown; active?: boolean; associationScope?: string; allowedMemberIds?: unknown; allowedGroupIds?: unknown }) {
    if (!this.isOrgAdmin(user)) throw new ForbiddenException('Only organization administrators can manage data templates');
    const existing = await this.prisma.fileDataTemplate.findFirst({ where: { id, orgId: user.org_id } }); if (!existing) throw new NotFoundException('Data template not found');
    if (existing.active === false && body.schema !== undefined) throw new BadRequestException('Enable the template before editing its fields');
    const schema = body.schema === undefined ? this.templateFields(existing) : normalizeFields(body.schema);
    const data: any = {
      ...(body.name !== undefined ? { name: body.name.trim().slice(0, 50) } : {}),
      ...(body.description !== undefined ? { description: body.description.trim().slice(0, 200) || null } : {}),
      ...(body.schema !== undefined ? { schema: schema as never, requiredFields: schema.filter((f) => f.required).map((f) => f.key) as never, searchableFieldKeys: schema.filter((f) => f.searchable !== false).map((f) => f.key) as never } : {}),
      ...(body.active !== undefined ? { active: body.active } : {}),
    };
    if (body.associationScope !== undefined) data.associationScope = body.associationScope === 'SPECIFIC' ? 'SPECIFIC' : 'ALL_EDIT';
    if (body.allowedMemberIds !== undefined) data.allowedMemberIds = jsonArray(body.allowedMemberIds).slice(0, 500) as never;
    if (body.allowedGroupIds !== undefined) data.allowedGroupIds = jsonArray(body.allowedGroupIds).slice(0, 200) as never;
    try { return await this.prisma.fileDataTemplate.update({ where: { id }, data }); } catch (error: any) { if (error?.code === 'P2002') throw new ConflictException('A data template with this name already exists'); throw error; }
  }

  async deleteTemplate(user: AccessTokenPayload, id: string) {
    if (!this.isOrgAdmin(user)) throw new ForbiddenException('Only organization administrators can manage data templates');
    const existing = await this.prisma.fileDataTemplate.findFirst({ where: { id, orgId: user.org_id } }); if (!existing) throw new NotFoundException('Data template not found');
    await this.prisma.fileDataTemplate.delete({ where: { id } });
    return { id, deleted: true };
  }

  async bindFolder(user: AccessTokenPayload, folderId: string, templateId: string | null) {
    const folder = await this.prisma.folder.findFirst({ where: { id: folderId, orgId: user.org_id } }); if (!folder) throw new NotFoundException('Folder not found');
    if (!templateId) return this.prisma.folder.update({ where: { id: folderId }, data: { dataTemplateId: null } });
    const template = await this.prisma.fileDataTemplate.findFirst({ where: { id: templateId, orgId: user.org_id, active: true } }); if (!template) throw new NotFoundException('Data template not found');
    await this.canAssociate(user, template, { orgId: folder.orgId, ownerId: folder.ownerId, teamFolderId: folder.teamFolderId });
    return this.associateFolder(user, folderId, templateId, {});
  }

  async associateFile(user: AccessTokenPayload, fileId: string, templateId: string, customFields: unknown = {}) {
    const file = await this.prisma.file.findFirst({ where: { id: fileId, orgId: user.org_id, deletedAt: null }, include: { folder: true } }); if (!file) throw new NotFoundException('File not found');
    const template = await this.prisma.fileDataTemplate.findFirst({ where: { id: templateId, orgId: user.org_id, active: true } }); if (!template) throw new NotFoundException('Data template not found');
    await this.canAssociate(user, template, { orgId: file.orgId, ownerId: file.ownerId, teamFolderId: file.folder?.teamFolderId ?? null });
    const count = await this.prisma.fileDataTemplateBinding.count({ where: { orgId: user.org_id, fileId } });
    const existing = await this.prisma.fileDataTemplateBinding.findFirst({ where: { templateId, fileId } });
    if (!existing && count >= 5) throw new BadRequestException('A file or folder can have at most 5 data templates');
    const values = validateFields(this.templateFields(template), customFields);
    const binding = await this.prisma.fileDataTemplateBinding.upsert({ where: { templateId_fileId: { templateId, fileId } }, create: { orgId: user.org_id, templateId, fileId, customFields: values as never, createdById: user.sub }, update: { customFields: values as never } });
    await this.prisma.fileMetadata.upsert({ where: { fileId }, create: { fileId, dataTemplateId: templateId, customFields: values as never }, update: { ...(existing ? {} : { dataTemplateId: templateId }), customFields: values as never } });
    return binding;
  }

  async associateFolder(user: AccessTokenPayload, folderId: string, templateId: string, customFields: unknown = {}) {
    const folder = await this.prisma.folder.findFirst({ where: { id: folderId, orgId: user.org_id } }); if (!folder) throw new NotFoundException('Folder not found');
    const template = await this.prisma.fileDataTemplate.findFirst({ where: { id: templateId, orgId: user.org_id, active: true } }); if (!template) throw new NotFoundException('Data template not found');
    await this.canAssociate(user, template, { orgId: folder.orgId, ownerId: folder.ownerId, teamFolderId: folder.teamFolderId });
    const count = await this.prisma.fileDataTemplateBinding.count({ where: { orgId: user.org_id, folderId } });
    const existing = await this.prisma.fileDataTemplateBinding.findFirst({ where: { templateId, folderId } });
    if (!existing && count >= 5) throw new BadRequestException('A file or folder can have at most 5 data templates');
    const values = validateFields(this.templateFields(template), customFields);
    const binding = await this.prisma.fileDataTemplateBinding.upsert({ where: { templateId_folderId: { templateId, folderId } }, create: { orgId: user.org_id, templateId, folderId, customFields: values as never, createdById: user.sub }, update: { customFields: values as never } });
    await this.prisma.folder.update({ where: { id: folderId }, data: { dataTemplateId: templateId } });
    return binding;
  }

  async listFileBindings(user: AccessTokenPayload, fileId: string) {
    const file = await this.prisma.file.findFirst({ where: { id: fileId, orgId: user.org_id, deletedAt: null }, include: { folder: true } }); if (!file) throw new NotFoundException('File not found');
    if (!this.permissions.canRead(user, { orgId: file.orgId, ownerId: file.ownerId, teamFolderId: file.folder?.teamFolderId ?? null })) throw new ForbiddenException('Access denied');
    return this.prisma.fileDataTemplateBinding.findMany({ where: { orgId: user.org_id, fileId }, include: { template: true }, orderBy: { createdAt: 'asc' } });
  }

  async listFolderBindings(user: AccessTokenPayload, folderId: string) {
    const folder = await this.prisma.folder.findFirst({ where: { id: folderId, orgId: user.org_id } }); if (!folder) throw new NotFoundException('Folder not found');
    if (!this.permissions.canRead(user, { orgId: folder.orgId, ownerId: folder.ownerId, teamFolderId: folder.teamFolderId })) throw new ForbiddenException('Access denied');
    return this.prisma.fileDataTemplateBinding.findMany({ where: { orgId: user.org_id, folderId }, include: { template: true }, orderBy: { createdAt: 'asc' } });
  }

  async updateFileBinding(user: AccessTokenPayload, fileId: string, templateId: string, customFields: unknown) {
    const file = await this.prisma.file.findFirst({ where: { id: fileId, orgId: user.org_id, deletedAt: null }, include: { folder: true } }); if (!file) throw new NotFoundException('File not found');
    const binding = await this.prisma.fileDataTemplateBinding.findFirst({ where: { fileId, templateId, orgId: user.org_id }, include: { template: true } }); if (!binding) throw new NotFoundException('Data template association not found');
    await this.canAssociate(user, binding.template, { orgId: file.orgId, ownerId: file.ownerId, teamFolderId: file.folder?.teamFolderId ?? null });
    const values = validateFields(this.templateFields(binding.template), customFields);
    const updated = await this.prisma.fileDataTemplateBinding.update({ where: { id: binding.id }, data: { customFields: values as never } });
    await this.prisma.fileMetadata.updateMany({ where: { fileId, dataTemplateId: templateId }, data: { customFields: values as never } });
    return { ...updated, template: binding.template };
  }

  async updateFolderBinding(user: AccessTokenPayload, folderId: string, templateId: string, customFields: unknown) {
    const folder = await this.prisma.folder.findFirst({ where: { id: folderId, orgId: user.org_id } }); if (!folder) throw new NotFoundException('Folder not found');
    const binding = await this.prisma.fileDataTemplateBinding.findFirst({ where: { folderId, templateId, orgId: user.org_id }, include: { template: true } }); if (!binding) throw new NotFoundException('Data template association not found');
    await this.canAssociate(user, binding.template, { orgId: folder.orgId, ownerId: folder.ownerId, teamFolderId: folder.teamFolderId ?? null });
    const values = validateFields(this.templateFields(binding.template), customFields);
    const updated = await this.prisma.fileDataTemplateBinding.update({ where: { id: binding.id }, data: { customFields: values as never } });
    return { ...updated, template: binding.template };
  }

  async disassociateFile(user: AccessTokenPayload, fileId: string, templateId: string) {
    const bindings = await this.listFileBindings(user, fileId); const binding = bindings.find((x) => x.templateId === templateId); if (!binding) throw new NotFoundException('Data template association not found');
    const template = binding.template;
    const file = await this.prisma.file.findFirst({ where: { id: fileId, orgId: user.org_id, deletedAt: null }, include: { folder: true } }); if (!file) throw new NotFoundException('File not found');
    await this.canAssociate(user, template, { orgId: file.orgId, ownerId: file.ownerId, teamFolderId: file.folder?.teamFolderId ?? null });
    await this.prisma.fileDataTemplateBinding.delete({ where: { templateId_fileId: { templateId, fileId } } });
    const remaining = await this.prisma.fileDataTemplateBinding.findFirst({ where: { fileId }, orderBy: { createdAt: 'asc' } });
    await this.prisma.fileMetadata.updateMany({ where: { fileId }, data: { dataTemplateId: remaining?.templateId ?? null, customFields: remaining?.customFields as never } });
    return { fileId, templateId, deleted: true };
  }

  async disassociateFolder(user: AccessTokenPayload, folderId: string, templateId: string) {
    const bindings = await this.listFolderBindings(user, folderId); const binding = bindings.find((x) => x.templateId === templateId); if (!binding) throw new NotFoundException('Data template association not found');
    const folder = await this.prisma.folder.findFirst({ where: { id: folderId, orgId: user.org_id } }); if (!folder) throw new NotFoundException('Folder not found');
    await this.canAssociate(user, binding.template, { orgId: folder.orgId, ownerId: folder.ownerId, teamFolderId: folder.teamFolderId ?? null });
    await this.prisma.fileDataTemplateBinding.delete({ where: { templateId_folderId: { templateId, folderId } } });
    const remaining = await this.prisma.fileDataTemplateBinding.findFirst({ where: { folderId }, orderBy: { createdAt: 'asc' } });
    await this.prisma.folder.update({ where: { id: folderId }, data: { dataTemplateId: remaining?.templateId ?? null } });
    return { folderId, templateId, deleted: true };
  }

  async setTeamFolderMandate(user: AccessTokenPayload, teamFolderId: string, input: { templateId?: string | null; target?: MandateTarget }) {
    if (!this.isOrgAdmin(user)) {
      const member = await this.prisma.teamFolderMember.findFirst({ where: { teamFolderId, userId: user.sub, orgId: user.org_id, role: 'ADMIN' } });
      if (!member) throw new ForbiddenException('Team Folder admin access required');
    }
    const teamFolder = await this.prisma.teamFolder.findFirst({ where: { id: teamFolderId, orgId: user.org_id } }); if (!teamFolder) throw new NotFoundException('Team Folder not found');
    if (!input.templateId) return this.prisma.teamFolder.update({ where: { id: teamFolderId }, data: { mandateDataTemplateId: null } });
    const template = await this.prisma.fileDataTemplate.findFirst({ where: { id: input.templateId, orgId: user.org_id, active: true } }); if (!template) throw new NotFoundException('Data template not found');
    return this.prisma.teamFolder.update({ where: { id: teamFolderId }, data: { mandateDataTemplateId: template.id, mandateDataTemplateTarget: input.target === 'FILES' || input.target === 'FOLDERS' ? input.target : 'BOTH' } });
  }

  async getTeamFolderMandate(user: AccessTokenPayload, teamFolderId: string) {
    const teamFolder = await this.prisma.teamFolder.findFirst({ where: { id: teamFolderId, orgId: user.org_id }, include: { mandateDataTemplate: true } }); if (!teamFolder) throw new NotFoundException('Team Folder not found');
    return { template: teamFolder.mandateDataTemplate, target: teamFolder.mandateDataTemplateTarget, enabled: Boolean(teamFolder.mandateDataTemplateId) };
  }

  async getFileMetadata(user: AccessTokenPayload, fileId: string) {
    const bindings = await this.listFileBindings(user, fileId);
    const file = await this.prisma.file.findFirst({ where: { id: fileId }, include: { metadata: true } });
    return { metadata: file?.metadata ?? null, bindings };
  }

  async updateFileMetadata(user: AccessTokenPayload, fileId: string, body: { title?: string | null; description?: string | null; language?: string | null; contentText?: string | null; ocrText?: string | null; customFields?: unknown }) {
    const file = await this.prisma.file.findFirst({ where: { id: fileId, orgId: user.org_id, deletedAt: null }, include: { folder: true } }); if (!file) throw new NotFoundException('File not found');
    if (!this.permissions.canWrite(user, { orgId: file.orgId, ownerId: file.ownerId, teamFolderId: file.folder?.teamFolderId ?? null })) throw new ForbiddenException('Edit permission required');
    const metadata = await this.prisma.fileMetadata.findUnique({ where: { fileId }, include: { dataTemplate: true } });
    let customFields = body.customFields;
    if (body.customFields !== undefined && metadata?.dataTemplate) customFields = validateFields(this.templateFields(metadata.dataTemplate), body.customFields);
    return this.prisma.fileMetadata.upsert({ where: { fileId }, create: { fileId, title: body.title ?? null, description: body.description ?? null, language: body.language ?? null, contentText: body.contentText ?? null, ocrText: body.ocrText ?? null, customFields: (customFields ?? {}) as never, dataTemplateId: metadata?.dataTemplateId ?? null }, update: { ...(body.title !== undefined ? { title: body.title } : {}), ...(body.description !== undefined ? { description: body.description } : {}), ...(body.language !== undefined ? { language: body.language } : {}), ...(body.contentText !== undefined ? { contentText: body.contentText } : {}), ...(body.ocrText !== undefined ? { ocrText: body.ocrText } : {}), ...(body.customFields !== undefined ? { customFields: customFields as never } : {}) }, include: { dataTemplate: true } });
  }
}
