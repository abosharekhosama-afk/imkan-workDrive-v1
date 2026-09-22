import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { PermissionService } from '../permissions/permission.service';
import { PrismaService } from '../prisma/prisma.service';

export type DataTemplateField = { key: string; label: string; type: 'text'|'number'|'date'|'boolean'|'select'; required?: boolean; options?: string[] };

function normalizeFields(value: unknown): DataTemplateField[] {
  if (!Array.isArray(value) || value.length > 100) throw new BadRequestException('schema must be an array');
  const seen = new Set<string>();
  return value.map((raw) => {
    if (!raw || typeof raw !== 'object') throw new BadRequestException('Invalid data template field');
    const r = raw as Record<string, unknown>;
    const key = typeof r.key === 'string' ? r.key.trim() : '';
    const label = typeof r.label === 'string' ? r.label.trim() : key;
    const type = r.type;
    if (!/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(key) || seen.has(key)) throw new BadRequestException('Invalid or duplicate field key');
    if (!['text','number','date','boolean','select'].includes(String(type))) throw new BadRequestException(`Unsupported field type: ${String(type)}`);
    seen.add(key);
    const options = type === 'select' ? (Array.isArray(r.options) ? r.options.map(String).map((x) => x.trim()).filter(Boolean).slice(0, 100) : []) : undefined;
    if (type === 'select' && !options?.length) throw new BadRequestException('Select fields require options');
    return { key, label: label || key, type: type as DataTemplateField['type'], required: r.required === true, ...(options ? { options } : {}) };
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
    if (field.type === 'text' && typeof v !== 'string') throw new BadRequestException(`${field.key} must be text`);
    if (field.type === 'number' && (typeof v !== 'number' || !Number.isFinite(v))) throw new BadRequestException(`${field.key} must be a number`);
    if (field.type === 'boolean' && typeof v !== 'boolean') throw new BadRequestException(`${field.key} must be boolean`);
    if (field.type === 'date' && (typeof v !== 'string' || Number.isNaN(Date.parse(v)))) throw new BadRequestException(`${field.key} must be an ISO date`);
    if (field.type === 'select' && (typeof v !== 'string' || !field.options?.includes(v))) throw new BadRequestException(`${field.key} has an invalid option`);
    output[field.key] = v;
  }
  return output;
}

@Injectable()
export class MetadataService {
  constructor(private readonly prisma: PrismaService, private readonly permissions: PermissionService) {}

  async listTemplates(user: AccessTokenPayload) { return this.prisma.fileDataTemplate.findMany({ where: { orgId: user.org_id, active: true }, orderBy: { name: 'asc' } }); }

  async createTemplate(user: AccessTokenPayload, body: { name: string; description?: string; schema: unknown }) {
    if (!this.permissions.isOrgAdminOrSuperAdmin(user)) throw new ForbiddenException('Only organization administrators can manage data templates');
    const name = body.name?.trim(); if (!name || name.length > 120) throw new BadRequestException('Invalid template name');
    const schema = normalizeFields(body.schema); const requiredFields = schema.filter((f) => f.required).map((f) => f.key);
    return this.prisma.fileDataTemplate.create({ data: { orgId: user.org_id, name, description: body.description?.trim() || null, schema: schema as never, requiredFields: requiredFields as never, createdById: user.sub } });
  }

  async updateTemplate(user: AccessTokenPayload, id: string, body: { name?: string; description?: string; schema?: unknown; active?: boolean }) {
    if (!this.permissions.isOrgAdminOrSuperAdmin(user)) throw new ForbiddenException('Only organization administrators can manage data templates');
    const existing = await this.prisma.fileDataTemplate.findFirst({ where: { id, orgId: user.org_id } }); if (!existing) throw new NotFoundException('Data template not found');
    const schema = body.schema === undefined ? existing.schema : normalizeFields(body.schema); const fields = Array.isArray(schema) ? schema as unknown as DataTemplateField[] : [];
    return this.prisma.fileDataTemplate.update({ where: { id }, data: { ...(body.name !== undefined ? { name: body.name.trim() } : {}), ...(body.description !== undefined ? { description: body.description.trim() || null } : {}), schema: schema as never, requiredFields: fields.filter((f) => f.required).map((f) => f.key) as never, ...(body.active !== undefined ? { active: body.active } : {}) } });
  }

  async deleteTemplate(user: AccessTokenPayload, id: string) {
    if (!this.permissions.isOrgAdminOrSuperAdmin(user)) throw new ForbiddenException('Only organization administrators can manage data templates');
    const existing = await this.prisma.fileDataTemplate.findFirst({ where: { id, orgId: user.org_id } }); if (!existing) throw new NotFoundException('Data template not found');
    await this.prisma.fileDataTemplate.update({ where: { id }, data: { active: false } }); return { id, active: false };
  }

  async bindFolder(user: AccessTokenPayload, folderId: string, templateId: string | null) {
    const folder = await this.prisma.folder.findFirst({ where: { id: folderId, orgId: user.org_id } }); if (!folder) throw new NotFoundException('Folder not found');
    if (!this.permissions.canWrite(user, { orgId: folder.orgId, ownerId: folder.ownerId, teamFolderId: folder.teamFolderId })) throw new ForbiddenException('Insufficient folder permission');
    if (templateId) { const template = await this.prisma.fileDataTemplate.findFirst({ where: { id: templateId, orgId: user.org_id, active: true } }); if (!template) throw new NotFoundException('Data template not found'); }
    return this.prisma.folder.update({ where: { id: folderId }, data: { dataTemplateId: templateId } });
  }

  async getFileMetadata(user: AccessTokenPayload, fileId: string) {
    const file = await this.prisma.file.findFirst({ where: { id: fileId, orgId: user.org_id, deletedAt: null }, include: { folder: true, metadata: { include: { dataTemplate: true } } } }); if (!file) throw new NotFoundException('File not found');
    if (!this.permissions.canRead(user, { orgId: file.orgId, ownerId: file.ownerId, teamFolderId: file.folder?.teamFolderId ?? null })) throw new ForbiddenException('Access denied');
    return file.metadata;
  }

  async updateFileMetadata(user: AccessTokenPayload, fileId: string, body: { title?: string | null; description?: string | null; language?: string | null; contentText?: string | null; ocrText?: string | null; customFields?: unknown }) {
    const file = await this.prisma.file.findFirst({ where: { id: fileId, orgId: user.org_id, deletedAt: null }, include: { folder: true, metadata: { include: { dataTemplate: true } } } }); if (!file) throw new NotFoundException('File not found');
    if (!this.permissions.canWrite(user, { orgId: file.orgId, ownerId: file.ownerId, teamFolderId: file.folder?.teamFolderId ?? null })) throw new ForbiddenException('Edit permission required');
    const templateId = file.folder?.dataTemplateId ?? file.metadata?.dataTemplateId ?? null;
    const template = templateId ? await this.prisma.fileDataTemplate.findFirst({ where: { id: templateId, orgId: user.org_id, active: true } }) : null;
    const customFields = body.customFields === undefined ? (file.metadata?.customFields ?? {}) : template ? validateFields(template.schema as unknown as DataTemplateField[], body.customFields) : validateFields([], body.customFields);
    return this.prisma.fileMetadata.upsert({ where: { fileId }, create: { fileId, dataTemplateId: template?.id ?? null, title: body.title ?? null, description: body.description ?? null, language: body.language ?? null, contentText: body.contentText ?? null, ocrText: body.ocrText ?? null, customFields: customFields as never }, update: { dataTemplateId: template?.id ?? null, ...(body.title !== undefined ? { title: body.title } : {}), ...(body.description !== undefined ? { description: body.description } : {}), ...(body.language !== undefined ? { language: body.language } : {}), ...(body.contentText !== undefined ? { contentText: body.contentText } : {}), ...(body.ocrText !== undefined ? { ocrText: body.ocrText } : {}), ...(body.customFields !== undefined ? { customFields: customFields as never } : {}) }, include: { dataTemplate: true } });
  }
}
