import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import {
  FileStatus,
  OrgRole,
  TemplateLibraryType,
  TemplateStatus,
  TemplateType,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { FilesService } from '../files/files.service';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE, type StorageService } from '../storage/storage.types';
import { Inject } from '@nestjs/common';
import { PermissionService } from '../permissions/permission.service';
import { extractExtension } from '../common/file-classification';
import type { parseCategory, parseTemplateCreate, parseTemplateFromFile, parseTemplateUpdate, parseTemplateUse, parseTemplateVariable, parseTemplateBuilder, TemplateBuilderConfig } from './templates.schemas';
import { defaultTemplateBuilderConfig } from './templates.schemas';
import { PublicTemplateSeedService } from './public-template-seed.service';
import { OfficeService } from '../office/office.service';

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => FilesService)) private readonly files: FilesService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    private readonly permissions: PermissionService,
    private readonly publicTemplateSeed: PublicTemplateSeedService,
    @Inject(forwardRef(() => OfficeService)) private readonly office: OfficeService,
  ) {}

  private isAdmin(user: AccessTokenPayload) {
    return user.role === OrgRole.ADMIN || user.role === OrgRole.SUPER_ADMIN || user.templateAdmin === true;
  }

  private async ensureLibrary(user: AccessTokenPayload, type: TemplateLibraryType) {
    if (type === TemplateLibraryType.PERSONAL) {
      const existing = await this.prisma.templateLibrary.findFirst({ where: { orgId: user.org_id, ownerId: user.sub, type } });
      if (existing) return existing;
      return this.prisma.templateLibrary.create({ data: { orgId: user.org_id, ownerId: user.sub, type, name: 'My Templates' } });
    }
    const existing = await this.prisma.templateLibrary.findFirst({
      where: type === TemplateLibraryType.PUBLIC
        ? { orgId: null, ownerId: null, type }
        : { orgId: user.org_id, ownerId: null, type },
    });
    if (existing) return existing;
    return this.prisma.templateLibrary.create({
      data: {
        orgId: type === TemplateLibraryType.PUBLIC ? null : user.org_id,
        ownerId: null,
        type,
        name: type === TemplateLibraryType.ORGANIZATION ? 'Organization Templates' : 'Public Templates',
      },
    });
  }

  private async assertCategory(user: AccessTokenPayload, categoryId: string | null, libraryId: string) {
    if (!categoryId) return null;
    const category = await this.prisma.templateCategory.findFirst({ where: { id: categoryId, libraryId, orgId: user.org_id } });
    if (!category) throw new NotFoundException('Template category not found');
    return category;
  }

  private canManageLibrary(user: AccessTokenPayload, library: { type: TemplateLibraryType; ownerId: string | null }) {
    if (library.type === TemplateLibraryType.PERSONAL) return library.ownerId === user.sub;
    return this.isAdmin(user);
  }

  private templatePermissions(user: AccessTokenPayload, template: {
    library: { type: TemplateLibraryType; ownerId: string | null };
    ownerId: string | null;
    status: TemplateStatus;
  }) {
    const active = template.status === TemplateStatus.ACTIVE;
    const manager = this.canManageLibrary(user, template.library);
    const canUse = active && (template.library.type !== TemplateLibraryType.PERSONAL || template.ownerId === user.sub);
    return {
      canUse,
      canDuplicate: canUse,
      canEdit: active && manager,
      canCreateVersion: active && manager,
      canDelete: active && manager,
      canManage: active && manager,
      canViewVersions: canUse,
    };
  }

  private canUseTemplate(user: AccessTokenPayload, template: { library: { type: TemplateLibraryType; ownerId: string | null }; ownerId: string | null; status: TemplateStatus }) {
    return this.templatePermissions(user, template).canUse;
  }

  async listVariables(user: AccessTokenPayload, templateId: string) {
    const template = await this.prisma.template.findFirst({
      where: { id: templateId, deletedAt: null, OR: [{ orgId: user.org_id }, { orgId: null, library: { type: TemplateLibraryType.PUBLIC } }] },
      include: { library: true },
    });
    if (!template || !this.canUseTemplate(user, template)) throw new NotFoundException('Template not found');
    return this.prisma.templateVariable.findMany({
      where: { templateId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createVariable(user: AccessTokenPayload, templateId: string, input: ReturnType<typeof parseTemplateVariable>) {
    await this.getManagedTemplate(user, templateId);
    try {
      return await this.prisma.templateVariable.create({ data: { id: randomUUID(), templateId, ...input, options: input.options as any } });
    } catch (error: any) {
      if (error?.code === 'P2002') throw new ConflictException('A variable with this name already exists');
      throw error;
    }
  }

  async updateVariable(user: AccessTokenPayload, templateId: string, variableId: string, input: ReturnType<typeof parseTemplateVariable>) {
    await this.getManagedTemplate(user, templateId);
    const existing = await this.prisma.templateVariable.findFirst({ where: { id: variableId, templateId } });
    if (!existing) throw new NotFoundException('Template variable not found');
    try {
      return await this.prisma.templateVariable.update({ where: { id: variableId }, data: { ...input, options: input.options as any } });
    } catch (error: any) {
      if (error?.code === 'P2002') throw new ConflictException('A variable with this name already exists');
      throw error;
    }
  }

  async deleteVariable(user: AccessTokenPayload, templateId: string, variableId: string) {
    await this.getManagedTemplate(user, templateId);
    const existing = await this.prisma.templateVariable.findFirst({ where: { id: variableId, templateId } });
    if (!existing) throw new NotFoundException('Template variable not found');
    await this.prisma.templateVariable.delete({ where: { id: variableId } });
    return { success: true };
  }

  async list(user: AccessTokenPayload, query: { library?: string; categoryId?: string; type?: string; q?: string; sort?: string }) {
    if (query.library === TemplateLibraryType.PUBLIC) {
      await this.publicTemplateSeed.ensureSeed();
    }
    const libraries = await this.prisma.templateLibrary.findMany({
      where: {
        OR: [
          { orgId: user.org_id, type: TemplateLibraryType.PERSONAL, ownerId: user.sub },
          { orgId: user.org_id, type: TemplateLibraryType.ORGANIZATION, ownerId: null },
          { orgId: null, type: TemplateLibraryType.PUBLIC, ownerId: null },
        ],
      },
      select: { id: true, type: true, name: true, ownerId: true },
    });
    const type = query.type && Object.values(TemplateType).includes(query.type as TemplateType) ? query.type as TemplateType : undefined;
    const scope = query.library && Object.values(TemplateLibraryType).includes(query.library as TemplateLibraryType) ? query.library as TemplateLibraryType : undefined;
    const allowed = scope ? libraries.filter(l => l.type === scope) : libraries;
    const libraryIds = allowed.map(l => l.id);
    const includesPublic = allowed.some(l => l.type === TemplateLibraryType.PUBLIC);
    const rows = await this.prisma.template.findMany({
      where: {
        libraryId: { in: libraryIds },
        status: TemplateStatus.ACTIVE,
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(type ? { type } : {}),
        ...(query.q ? { OR: [{ name: { contains: query.q } }, { description: { contains: query.q } }] } : {}),
      },
      include: { category: { select: { id: true, name: true } }, library: { select: { id: true, type: true, name: true, ownerId: true } }, owner: { select: { id: true, name: true, email: true } }, versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
      orderBy:
        query.sort === 'name' ? { name: 'asc' } :
        query.sort === 'name_desc' ? { name: 'desc' } :
        query.sort === 'updated_asc' ? { updatedAt: 'asc' } :
        { updatedAt: 'desc' },
    });
    return rows.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      type: t.type,
      library: t.library.type,
      category: t.category,
      owner: t.owner ? { id: t.owner.id, name: t.owner.name, email: t.owner.email } : null,
      version: t.versions[0]?.versionNumber ?? 0,
      size: Number(t.versions[0]?.size ?? 0),
      mimeType: t.versions[0]?.mimeType ?? null,
      extension: t.versions[0]?.extension ?? null,
      updatedAt: t.updatedAt.toISOString(),
      permissions: this.templatePermissions(user, t),
      canManage: this.templatePermissions(user, t).canManage,
    }));
  }

  async getBuilder(user: AccessTokenPayload, id: string) {
    const template = await this.prisma.template.findFirst({
      where: { id, deletedAt: null, OR: [{ orgId: user.org_id }, { orgId: null, library: { type: TemplateLibraryType.PUBLIC } }] },
      include: { library: true },
    });
    if (!template || !this.canUseTemplate(user, template)) throw new NotFoundException('Template not found');
    let builder = await this.prisma.templateBuilder.findUnique({ where: { templateId: id } });
    if (!builder) {
      builder = await this.prisma.templateBuilder.create({ data: { id: randomUUID(), templateId: id, draft: defaultTemplateBuilderConfig() as Prisma.InputJsonValue } });
    }
    const publishedBy = builder.publishedById ? await this.prisma.user.findUnique({ where: { id: builder.publishedById }, select: { id: true, name: true, email: true } }) : null;
    return { id: builder.id, templateId: id, draft: builder.draft, published: builder.published, publishedAt: builder.publishedAt?.toISOString() ?? null, publishedBy, updatedAt: builder.updatedAt.toISOString(), canEdit: this.canManageLibrary(user, template.library), canPublish: this.canManageLibrary(user, template.library) };
  }

  async saveBuilder(user: AccessTokenPayload, id: string, input: ReturnType<typeof parseTemplateBuilder>) {
    const template = await this.getManagedTemplate(user, id);
    const builder = await this.prisma.templateBuilder.upsert({ where: { templateId: id }, create: { id: randomUUID(), templateId: id, draft: input as Prisma.InputJsonValue }, update: { draft: input as Prisma.InputJsonValue } });
    await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'TEMPLATE_BUILDER_UPDATED', resourceType: 'TEMPLATE', resourceId: id, metadata: { fields: input.fields.length, sections: input.sections.length, tables: input.tables.length, images: input.images.length, rules: input.rules.length } } });
    return { id: builder.id, templateId: id, draft: builder.draft, published: builder.published, publishedAt: builder.publishedAt?.toISOString() ?? null, canEdit: true, canPublish: true };
  }

  async publishBuilder(user: AccessTokenPayload, id: string) {
    const template = await this.getManagedTemplate(user, id);
    const existing = await this.prisma.templateBuilder.findUnique({ where: { templateId: id } });
    const draft = (existing?.draft ?? defaultTemplateBuilderConfig()) as Prisma.InputJsonValue;
    const builder = await this.prisma.templateBuilder.upsert({ where: { templateId: id }, create: { id: randomUUID(), templateId: id, draft, published: draft, publishedAt: new Date(), publishedById: user.sub }, update: { published: draft, publishedAt: new Date(), publishedById: user.sub } });
    await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'TEMPLATE_BUILDER_PUBLISHED', resourceType: 'TEMPLATE', resourceId: id, metadata: { templateVersion: template.versions[0]?.versionNumber ?? 0 } } });
    const publishedBy = await this.prisma.user.findUnique({ where: { id: user.sub }, select: { id: true, name: true, email: true } });
    return { id: builder.id, templateId: id, draft: builder.draft, published: builder.published, publishedAt: builder.publishedAt?.toISOString() ?? null, publishedBy, canEdit: true, canPublish: true };
  }

  async unpublishBuilder(user: AccessTokenPayload, id: string) {
    await this.getManagedTemplate(user, id);
    const builder = await this.prisma.templateBuilder.upsert({ where: { templateId: id }, create: { id: randomUUID(), templateId: id, draft: defaultTemplateBuilderConfig() as Prisma.InputJsonValue }, update: { published: Prisma.JsonNull, publishedAt: null, publishedById: null } });
    await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'TEMPLATE_BUILDER_UNPUBLISHED', resourceType: 'TEMPLATE', resourceId: id, metadata: {} } });
    return { id: builder.id, templateId: id, draft: builder.draft, published: null, publishedAt: null, publishedBy: null, canEdit: true, canPublish: true };
  }

  async get(user: AccessTokenPayload, id: string) {
    const template = await this.prisma.template.findFirst({ where: { id, deletedAt: null, OR: [{ orgId: user.org_id }, { orgId: null, library: { type: TemplateLibraryType.PUBLIC } }] }, include: { category: true, library: true, owner: { select: { id: true, name: true, email: true } }, versions: { orderBy: { versionNumber: 'desc' }, take: 1 } } });
    if (!template || !this.canUseTemplate(user, template)) throw new NotFoundException('Template not found');
    const version = template.versions[0];
    if (!version) throw new NotFoundException('Template content not found');
    const signed = await this.storage.createDownloadUrl({ fileId: template.id, versionId: version.id, ownerOrgId: user.org_id, storageKey: version.storageKey, publicAccess: template.library.type === TemplateLibraryType.PUBLIC, contentType: version.mimeType, disposition: 'inline', fileName: `${template.name}${version.extension ? `.${version.extension}` : ''}` });
    return { id: template.id, name: template.name, description: template.description, type: template.type, library: template.library.type, category: template.category, owner: template.owner, version: version.versionNumber, mimeType: version.mimeType, extension: version.extension, preview_url: signed.url, expires_in_seconds: signed.expiresInSeconds, permissions: this.templatePermissions(user, template) };
  }

  private async getManagedTemplate(user: AccessTokenPayload, id: string) {
    const template = await this.prisma.template.findFirst({
      where: { id, deletedAt: null, OR: [{ orgId: user.org_id }, { orgId: null, library: { type: TemplateLibraryType.PUBLIC } }] },
      include: { library: true, versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });
    if (!template) throw new NotFoundException('Template not found');
    if (!this.canManageLibrary(user, template.library)) throw new ForbiddenException('You cannot manage this template');
    if (!template.versions[0]) throw new NotFoundException('Template content not found');
    return template;
  }

  private async assertSourceFile(user: AccessTokenPayload, fileId: string) {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, orgId: user.org_id, status: FileStatus.ACTIVE, deletedAt: null },
      include: { folder: { select: { orgId: true, ownerId: true, teamFolderId: true } }, versions: { where: { status: 'ACTIVE' }, orderBy: { versionNumber: 'desc' }, take: 1 } },
    });
    if (!file || !file.versions.length) throw new NotFoundException('File not found');

    // Template creation requires actual read access to the source file.
    // A teamFolderId alone is not proof of membership; resolve the role through
    // the same centralized permission service used by normal file operations.
    const readable = this.permissions.canRead(user, {
      orgId: file.orgId,
      ownerId: file.ownerId,
      teamFolderId: file.folder?.teamFolderId ?? null,
    });
    if (!readable) throw new ForbiddenException('You cannot use this file for a template');
    return file;
  }

  private async snapshotFileVersion(user: AccessTokenPayload, templateId: string, versionNumber: number, file: Awaited<ReturnType<TemplatesService['assertSourceFile']>>, sourceVersion: (typeof file.versions)[number]) {
    const sourceObject = await this.prisma.storageObject.findUnique({ where: { id: sourceVersion.storageObjectId }, select: { storageKey: true } });
    if (!sourceObject) throw new NotFoundException('Source storage object not found');
    const versionId = randomUUID();
    const snapshotKey = this.storage.buildObjectKey(templateId, versionId);
    await this.storage.copyStoredObject(sourceObject.storageKey, { fileId: templateId, versionId, ownerOrgId: user.org_id, storageKey: snapshotKey, contentType: sourceVersion.mimeType });
    try {
      await this.prisma.templateVersion.create({ data: { id: versionId, templateId, versionNumber, storageKey: snapshotKey, size: sourceVersion.size, mimeType: sourceVersion.mimeType, extension: sourceVersion.extension ?? extractExtension(file.name), sha256Hash: sourceVersion.sha256Hash, createdById: user.sub } });
    } catch (error) {
      await this.storage.deleteStoredObject(snapshotKey).catch(() => undefined);
      throw error;
    }
    return { versionId, snapshotKey, sourceVersion };
  }

  async update(user: AccessTokenPayload, id: string, input: ReturnType<typeof parseTemplateUpdate>) {
    const template = await this.getManagedTemplate(user, id);
    const category = input.categoryId !== undefined ? await this.assertCategory(user, input.categoryId, template.libraryId) : null;
    await this.prisma.template.update({ where: { id }, data: { ...(input.name !== undefined ? { name: input.name } : {}), ...(input.description !== undefined ? { description: input.description || null } : {}), ...(input.categoryId !== undefined ? { categoryId: category?.id ?? null } : {}) } });
    await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'TEMPLATE_UPDATED', resourceType: 'TEMPLATE', resourceId: id, metadata: input } });
    return this.get(user, id);
  }

  async updateFromFile(user: AccessTokenPayload, id: string, input: ReturnType<typeof parseTemplateFromFile>) {
    const template = await this.getManagedTemplate(user, id);
    const file = await this.assertSourceFile(user, input.fileId);
    const category = input.categoryId !== null ? await this.assertCategory(user, input.categoryId, template.libraryId) : null;
    const nextVersion = (template.versions[0]?.versionNumber ?? 0) + 1;
    const snapshot = await this.snapshotFileVersion(user, id, nextVersion, file, file.versions[0]);
    try {
      await this.prisma.template.update({ where: { id }, data: { name: input.name, description: input.description ?? template.description, categoryId: input.categoryId === null ? null : (category?.id ?? template.categoryId) } });
      await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'TEMPLATE_VERSION_CREATED', resourceType: 'TEMPLATE', resourceId: id, metadata: { sourceFileId: file.id, versionNumber: nextVersion } } });
    } catch (error) {
      await this.prisma.templateVersion.delete({ where: { id: snapshot.versionId } }).catch(() => undefined);
      await this.storage.deleteStoredObject(snapshot.snapshotKey).catch(() => undefined);
      throw error;
    }
    return this.get(user, id);
  }

  async duplicate(user: AccessTokenPayload, id: string, body: unknown) {
    const source = await this.prisma.template.findFirst({
      where: { id, deletedAt: null, OR: [{ orgId: user.org_id }, { orgId: null, library: { type: TemplateLibraryType.PUBLIC } }] },
      include: { library: true, category: true, versions: { orderBy: { versionNumber: 'desc' }, take: 1 }, variables: { orderBy: { position: 'asc' } } },
    });
    if (!source || !this.templatePermissions(user, source).canDuplicate || !source.versions[0]) {
      throw new NotFoundException('Template not found');
    }
    const b = (body ?? {}) as Record<string, unknown>;
    const name = typeof b.name === 'string' && b.name.trim() ? b.name.trim() : `${source.name} Copy`;
    // Duplicating a shared template creates a personal copy for the actor.
    // This lets regular members reuse/branch organization/public templates
    // without implicitly publishing a new organization template.
    const libraryType = TemplateLibraryType.PERSONAL;
    const library = await this.ensureLibrary(user, libraryType);
    const templateId = randomUUID();
    const sourceVersion = source.versions[0];
    const versionId = randomUUID();
    const snapshotKey = this.storage.buildObjectKey(templateId, versionId);
    await this.storage.copyStoredObject(sourceVersion.storageKey, { fileId: templateId, versionId, ownerOrgId: user.org_id, storageKey: snapshotKey, contentType: sourceVersion.mimeType });
    try {
      await this.prisma.$transaction(async tx => {
        await tx.template.create({ data: { id: templateId, orgId: user.org_id, libraryId: library.id, categoryId: null, ownerId: user.sub, name, description: source.description, type: source.type } });
        await tx.templateVersion.create({ data: { id: versionId, templateId, versionNumber: 1, storageKey: snapshotKey, size: sourceVersion.size, mimeType: sourceVersion.mimeType, extension: sourceVersion.extension, sha256Hash: sourceVersion.sha256Hash, createdById: user.sub } });
        if (source.variables.length) {
          await tx.templateVariable.createMany({ data: source.variables.map((v) => ({ id: randomUUID(), templateId, name: v.name, label: v.label, type: v.type, defaultValue: v.defaultValue, required: v.required, description: v.description, options: v.options as any, format: v.format, position: v.position })) });
        }
        await tx.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'TEMPLATE_DUPLICATED', resourceType: 'TEMPLATE', resourceId: templateId, metadata: { sourceTemplateId: id } } });
      });
    } catch (error) {
      await this.storage.deleteStoredObject(snapshotKey).catch(() => undefined);
      throw error;
    }
    const sourceBuilder = await this.prisma.templateBuilder.findUnique({ where: { templateId: source.id } });
    if (sourceBuilder) {
      await this.prisma.templateBuilder.create({ data: { id: randomUUID(), templateId, draft: sourceBuilder.draft === null ? Prisma.JsonNull : sourceBuilder.draft as Prisma.InputJsonValue, published: sourceBuilder.published === null ? Prisma.JsonNull : sourceBuilder.published as Prisma.InputJsonValue, publishedAt: sourceBuilder.publishedAt, publishedById: sourceBuilder.publishedById } });
    }
    return this.get(user, templateId);
  }

  async remove(user: AccessTokenPayload, id: string) {
    await this.getManagedTemplate(user, id);
    await this.prisma.template.update({ where: { id }, data: { status: TemplateStatus.TRASHED, deletedAt: new Date() } });
    await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'TEMPLATE_DELETED', resourceType: 'TEMPLATE', resourceId: id } });
    return { success: true };
  }

  async createFromBlank(user: AccessTokenPayload, input: ReturnType<typeof parseTemplateCreate>) {
    if (input.library === TemplateLibraryType.PUBLIC) throw new ForbiddenException('Public templates are managed by WorkDrive and cannot be created directly');
    const library = await this.ensureLibrary(user, input.library);
    if (!this.canManageLibrary(user, library)) throw new ForbiddenException('You cannot manage this template library');
    const category = await this.assertCategory(user, input.categoryId, library.id);
    const definitions: Record<TemplateType, { file: string; extension: string; mimeType: string }> = {
      [TemplateType.DOCUMENT]: { file: 'blank-document.docx', extension: 'docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      [TemplateType.SPREADSHEET]: { file: 'blank-spreadsheet.xlsx', extension: 'xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      [TemplateType.PRESENTATION]: { file: 'blank-presentation.pptx', extension: 'pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
    };
    const definition = definitions[input.type];

    // Nest copies assets to dist/templates/blank-assets in production, while
    // local/dev runs commonly read them directly from src/templates/blank-assets.
    // Render can also start the app from either the backend directory or the
    // repository root, so try the known layouts instead of returning a raw ENOENT 500.
    const assetCandidates = [
      join(__dirname, 'blank-assets', definition.file),
      join(process.cwd(), 'dist', 'templates', 'blank-assets', definition.file),
      join(process.cwd(), 'src', 'templates', 'blank-assets', definition.file),
      join(process.cwd(), 'backend', 'src', 'templates', 'blank-assets', definition.file),
    ];
    let bytes: Buffer | null = null;
    for (const assetPath of assetCandidates) {
      try {
        bytes = await readFile(assetPath);
        break;
      } catch {
        // Try the next deployment layout.
      }
    }
    if (!bytes) {
      throw new InternalServerErrorException(
        `Blank ${input.type.toLowerCase()} template asset is not available on the server`,
      );
    }

    const file = await this.files.createFileFromBytes(user, {
      name: `${input.name}.${definition.extension}`,
      mimeType: definition.mimeType,
      extension: definition.extension,
      bytes,
    });

    try {
      const template = await this.saveFromFile(user, {
        fileId: file.file_id,
        name: input.name,
        description: input.description,
        library: input.library,
        categoryId: category?.id ?? null,
      });
      return { template, file_id: file.file_id };
    } catch (error) {
      // A failed template transaction must not leave an orphan working file.
      await this.files.trash(user, file.file_id).catch(() => undefined);
      throw error;
    }
  }

  async saveFromFile(user: AccessTokenPayload, input: ReturnType<typeof parseTemplateFromFile>) {
    if (input.library === TemplateLibraryType.PUBLIC) throw new ForbiddenException('Public templates cannot be created directly');
    const library = await this.ensureLibrary(user, input.library);
    if (!this.canManageLibrary(user, library)) throw new ForbiddenException('You cannot manage this template library');
    const file = await this.assertSourceFile(user, input.fileId);
    const version = file.versions[0];
    const type = this.templateTypeFromFile(file.mimeType, file.extension);
    if (library.type === TemplateLibraryType.PUBLIC) throw new ForbiddenException('Public templates are managed by WorkDrive and cannot be created or categorized');
    const category = await this.assertCategory(user, input.categoryId, library.id);
    const templateId = randomUUID();
    const source = await this.snapshotFileVersion(user, templateId, 1, file, version);
    const versionId = source.versionId;
    const snapshotKey = source.snapshotKey;
    try {
      await this.prisma.$transaction(async tx => {
        const template = await tx.template.create({ data: { id: templateId, orgId: user.org_id, libraryId: library.id, categoryId: category?.id ?? null, ownerId: input.library === TemplateLibraryType.PERSONAL ? user.sub : null, name: input.name, description: input.description ?? null, type } });
        await tx.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'TEMPLATE_CREATED_FROM_FILE', resourceType: 'TEMPLATE', resourceId: template.id, metadata: { sourceFileId: file.id, library: input.library } } });
      });
    } catch (error) {
      await this.storage.deleteStoredObject(snapshotKey).catch(() => undefined);
      throw error;
    }
    return this.get(user, templateId);
  }

  async use(user: AccessTokenPayload, id: string, input: ReturnType<typeof parseTemplateUse>) {
    const template = await this.prisma.template.findFirst({ where: { id, deletedAt: null, OR: [{ orgId: user.org_id }, { orgId: null, library: { type: TemplateLibraryType.PUBLIC } }] }, include: { library: true, versions: { orderBy: { versionNumber: 'desc' }, take: 1 } } });
    if (!template || !this.canUseTemplate(user, template) || !template.versions[0]) throw new NotFoundException('Template not found');
    const version = template.versions[0];
    const extension = version.extension?.replace(/^\./, '').trim();
    const hasExtension = extension && input.name.toLowerCase().endsWith(`.${extension.toLowerCase()}`);
    const finalName = extension && !hasExtension ? `${input.name}.${extension}` : input.name;
    const created = await this.files.createFileFromStorageSnapshot(user, { folderId: input.folderId, name: finalName, mimeType: version.mimeType, extension, size: version.size, sha256Hash: version.sha256Hash, sourceStorageKey: version.storageKey });
    let officeDocument: Awaited<ReturnType<OfficeService['initializeFromTemplateFile']>> | null = null;
    if (extension && ['docx', 'xlsx', 'pptx'].includes(extension.toLowerCase())) {
      try {
        officeDocument = await this.office.initializeFromTemplateFile(user, created.file_id, id, version.id);
      } catch (error) {
        // Keep the File lifecycle usable even if native parsing fails; the
        // source snapshot remains intact and can still be downloaded/opened.
        await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'OFFICE_TEMPLATE_INITIALIZATION_FAILED', resourceType: 'FILE', resourceId: created.file_id, metadata: { templateId: id, templateVersionId: version.id, error: error instanceof Error ? error.message : 'unknown' } } }).catch(() => undefined);
      }
    }
    return { ...created, office: officeDocument ? { documentId: officeDocument.id, type: officeDocument.type, nativeFormat: officeDocument.nativeFormat, revision: officeDocument.revision } : null };
  }

  /** Phase 36: create a concrete Office document from a template and optionally a PDF copy. */
  async automateFromTemplate(user: AccessTokenPayload, id: string, input: {
    name: string;
    folderId?: string | null;
    values?: Record<string, unknown>;
    generatePdf?: boolean;
    pdfFolderId?: string | null;
  }) {
    const template = await this.prisma.template.findFirst({
      where: { id, deletedAt: null, OR: [{ orgId: user.org_id }, { orgId: null, library: { type: TemplateLibraryType.PUBLIC } }] },
      include: { library: true, versions: { orderBy: { versionNumber: 'desc' }, take: 1 }, variables: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } },
    });
    if (!template || !this.canUseTemplate(user, template)) throw new NotFoundException('Template not found');
    const version = template.versions[0];
    if (!version) throw new NotFoundException('Template content not found');
    const values = input.values ?? {};
    for (const variable of template.variables) {
      const supplied = values[variable.name];
      const value = supplied === undefined || supplied === null || supplied === '' ? variable.defaultValue : supplied;
      if (variable.required && (value === undefined || value === null || value === '')) throw new BadRequestException(`Required template variable is missing: ${variable.name}`);
      if (value !== undefined && value !== null && variable.type === 'NUMBER' && !Number.isFinite(Number(value))) throw new BadRequestException(`Invalid number for template variable: ${variable.name}`);
      if (value !== undefined && value !== null && variable.type === 'CHOICE' && Array.isArray(variable.options) && !variable.options.map(String).includes(String(value))) throw new BadRequestException(`Invalid choice for template variable: ${variable.name}`);
    }
    const extension = (version.extension ?? '').replace(/^\./, '').toLowerCase();
    const finalName = input.name.trim() || `${template.name} generated`;
    const created = await this.files.createFileFromStorageSnapshot(user, { folderId: input.folderId ?? null, name: extension && !finalName.toLowerCase().endsWith(`.${extension}`) ? `${finalName}.${extension}` : finalName, mimeType: version.mimeType, extension, size: version.size, sha256Hash: version.sha256Hash, sourceStorageKey: version.storageKey });
    let officeDocument: any = null;
    if (['docx','xlsx','pptx'].includes(extension)) {
      officeDocument = await this.office.initializeFromTemplateFile(user, created.file_id, id, version.id);
      const substituted = this.replaceTemplateValues(officeDocument.content, template.variables, values);
      officeDocument = await this.office.save(user, created.file_id, substituted, officeDocument.revision);
    }
    let pdf: { fileId: string; name: string } | null = null;
    if (input.generatePdf && officeDocument) {
      const format = extension as 'docx'|'xlsx'|'pptx';
      const exported = await this.office.exportFile(user, created.file_id, format);
      // Replace the initial template snapshot version with the generated Office bytes so
      // WorkDrive download/version history and the native OfficeDocument stay aligned.
      await this.files.uploadNewVersion(user, created.file_id, { originalName: exported.filename, mimeType: exported.mimeType, buffer: Buffer.from(exported.dataBase64, 'base64') });
      const { execFile } = await import('node:child_process');
      const { mkdtemp, writeFile, readFile: readTempFile, rm } = await import('node:fs/promises');
      const { tmpdir } = await import('node:os');
      const { join: pathJoin } = await import('node:path');
      const tempDir = await mkdtemp(pathJoin(tmpdir(), 'imkan-template-pdf-'));
      try {
        const source = pathJoin(tempDir, exported.filename);
        await writeFile(source, Buffer.from(exported.dataBase64, 'base64'));
        await new Promise<void>((resolve, reject) => execFile('libreoffice', ['--headless','--convert-to','pdf','--outdir',tempDir,source], { timeout: 120000 }, (error, _stdout, stderr) => error ? reject(new Error(stderr || error.message)) : resolve()));
        const pdfPath = pathJoin(tempDir, exported.filename.replace(/\.[^.]+$/, '.pdf'));
        const pdfBytes = await readTempFile(pdfPath);
        const pdfName = `${finalName.replace(/\.[^.]+$/, '')}.pdf`;
        const pdfCreated = await this.files.createFileFromBytes(user, { folderId: input.pdfFolderId ?? input.folderId ?? null, name: pdfName, mimeType: 'application/pdf', extension: 'pdf', bytes: pdfBytes });
        pdf = { fileId: pdfCreated.file_id, name: pdfCreated.name };
      } finally { await rm(tempDir, { recursive: true, force: true }).catch(() => undefined); }
    }
    await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'TEMPLATE_AUTOMATION_GENERATED', resourceType: 'TEMPLATE', resourceId: id, metadata: { fileId: created.file_id, templateVersionId: version.id, variableCount: template.variables.length, pdfFileId: pdf?.fileId ?? null } } });
    return { templateId: id, templateVersionId: version.id, fileId: created.file_id, name: created.name, office: officeDocument ? { documentId: officeDocument.id, revision: officeDocument.revision, type: officeDocument.type } : null, pdf };
  }

  private replaceTemplateValues(content: unknown, variables: Array<{ name: string; defaultValue: string | null; type: string }>, values: Record<string, unknown>) {
    const map = new Map(variables.map(v => [v.name, values[v.name] === undefined || values[v.name] === null || values[v.name] === '' ? (v.defaultValue ?? '') : values[v.name]]));
    const walk = (value: any): any => {
      if (typeof value === 'string') return value.replace(/{{\s*([^}]+?)\s*}}/g, (full, key) => map.has(String(key).trim()) ? String(map.get(String(key).trim()) ?? '') : full);
      if (Array.isArray(value)) return value.map(walk);
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, walk(v)]));
      return value;
    };
    return walk(content);
  }

  async versions(user: AccessTokenPayload, id: string) {
    const template = await this.prisma.template.findFirst({
      where: { id, deletedAt: null, OR: [{ orgId: user.org_id }, { orgId: null, library: { type: TemplateLibraryType.PUBLIC } }] },
      include: { library: true },
    });
    if (!template || !this.canUseTemplate(user, template as any)) throw new NotFoundException('Template not found');
    const rows = await this.prisma.templateVersion.findMany({
      where: { templateId: id },
      orderBy: { versionNumber: 'desc' },
      include: { createdBy: { select: { id: true, name: true, email: true } } },
    });
    return Promise.all(rows.map(async (v) => {
      const signed = await this.storage.createDownloadUrl({
        fileId: template.id, versionId: v.id, ownerOrgId: user.org_id, storageKey: v.storageKey, publicAccess: template.library.type === TemplateLibraryType.PUBLIC,
        contentType: v.mimeType, disposition: 'inline', fileName: `${template.name}${v.extension ? `.${v.extension}` : ''}`,
      });
      return { id: v.id, version: v.versionNumber, size: Number(v.size), mimeType: v.mimeType, extension: v.extension, createdAt: v.createdAt.toISOString(), createdBy: v.createdBy, preview_url: signed.url, expires_in_seconds: signed.expiresInSeconds };
    }));
  }

  async useVersion(user: AccessTokenPayload, id: string, versionId: string, input: ReturnType<typeof parseTemplateUse>) {
    const template = await this.prisma.template.findFirst({ where: { id, deletedAt: null, OR: [{ orgId: user.org_id }, { orgId: null, library: { type: TemplateLibraryType.PUBLIC } }] }, include: { library: true } });
    if (!template || !this.canUseTemplate(user, template as any)) throw new NotFoundException('Template not found');
    const version = await this.prisma.templateVersion.findFirst({ where: { id: versionId, templateId: id } });
    if (!version) throw new NotFoundException('Template version not found');
    const extension = version.extension?.replace(/^\./, '').trim();
    const finalName = extension && !input.name.toLowerCase().endsWith(`.${extension.toLowerCase()}`) ? `${input.name}.${extension}` : input.name;
    const created = await this.files.createFileFromStorageSnapshot(user, { folderId: input.folderId, name: finalName, mimeType: version.mimeType, extension, size: version.size, sha256Hash: version.sha256Hash, sourceStorageKey: version.storageKey });
    let officeDocument: Awaited<ReturnType<OfficeService['initializeFromTemplateFile']>> | null = null;
    if (extension && ['docx', 'xlsx', 'pptx'].includes(extension.toLowerCase())) {
      try { officeDocument = await this.office.initializeFromTemplateFile(user, created.file_id, id, version.id); }
      catch (error) { await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'OFFICE_TEMPLATE_INITIALIZATION_FAILED', resourceType: 'FILE', resourceId: created.file_id, metadata: { templateId: id, templateVersionId: version.id, error: error instanceof Error ? error.message : 'unknown' } } }).catch(() => undefined); }
    }
    return { ...created, office: officeDocument ? { documentId: officeDocument.id, type: officeDocument.type, nativeFormat: officeDocument.nativeFormat, revision: officeDocument.revision } : null };
  }

  async trash(user: AccessTokenPayload) {
    // Personal/organization templates belong to the current org. Public
    // templates are global (orgId = null), but an admin/template-admin may
    // still manage them. Keep both scopes visible in the template trash.
    const rows = await this.prisma.template.findMany({
      where: {
        deletedAt: { not: null },
        OR: [
          { orgId: user.org_id, ownerId: user.sub },
          { orgId: user.org_id, library: { type: TemplateLibraryType.ORGANIZATION } },
          { orgId: null, library: { type: TemplateLibraryType.PUBLIC } },
        ],
      },
      include: { library: true, category: true, versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
      orderBy: { deletedAt: 'desc' },
    });
    return rows
      .filter(t => this.canManageLibrary(user, t.library))
      .map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        type: t.type,
        library: t.library.type,
        category: t.category,
        version: t.versions[0]?.versionNumber ?? 0,
        deletedAt: t.deletedAt?.toISOString() ?? null,
        canManage: true,
      }));
  }

  async restore(user: AccessTokenPayload, id: string) {
    const template = await this.prisma.template.findFirst({
      where: {
        id,
        OR: [
          { orgId: user.org_id },
          { orgId: null, library: { type: TemplateLibraryType.PUBLIC } },
        ],
      },
      include: { library: true },
    });
    if (!template || template.status !== TemplateStatus.TRASHED || !this.canManageLibrary(user, template.library)) {
      throw new NotFoundException('Template not found in trash');
    }
    await this.prisma.template.update({ where: { id }, data: { status: TemplateStatus.ACTIVE, deletedAt: null } });
    await this.prisma.auditLog.create({
      data: { orgId: user.org_id, actorId: user.sub, action: 'TEMPLATE_RESTORED', resourceType: 'TEMPLATE', resourceId: id },
    });
    return { success: true };
  }

  async purge(user: AccessTokenPayload, id: string) {
    const template = await this.prisma.template.findFirst({
      where: {
        id,
        OR: [
          { orgId: user.org_id },
          { orgId: null, library: { type: TemplateLibraryType.PUBLIC } },
        ],
      },
      include: { library: true, versions: { select: { storageKey: true } } },
    });
    if (!template || template.status !== TemplateStatus.TRASHED || !this.canManageLibrary(user, template.library)) {
      throw new NotFoundException('Template not found in trash');
    }
    const keys = template.versions.map(v => v.storageKey);
    await this.prisma.template.delete({ where: { id } });
    await Promise.all(keys.map(key => this.storage.deleteStoredObject(key).catch(() => undefined)));
    await this.prisma.auditLog.create({
      data: { orgId: user.org_id, actorId: user.sub, action: 'TEMPLATE_PERMANENTLY_DELETED', resourceType: 'TEMPLATE', resourceId: id },
    });
    return { success: true };
  }

  async createCategory(user: AccessTokenPayload, libraryType: TemplateLibraryType, name: string) {
    if (libraryType === TemplateLibraryType.PUBLIC) throw new ForbiddenException('Public templates do not support categories');
    const library = await this.ensureLibrary(user, libraryType);
    if (!this.canManageLibrary(user, library)) throw new ForbiddenException('You cannot manage this template library');
    const existing = await this.prisma.templateCategory.findFirst({ where: { libraryId: library.id, name } });
    if (existing) throw new ConflictException('Category already exists');
    return this.prisma.templateCategory.create({ data: { orgId: user.org_id, libraryId: library.id, name } });
  }

  async capabilities(user: AccessTokenPayload, libraryType: TemplateLibraryType) {
    const library = await this.ensureLibrary(user, libraryType);
    const canManage = this.canManageLibrary(user, library);
    return {
      library: library.type,
      canManage,
      canCreate: canManage,
      canCreateCategory: library.type !== TemplateLibraryType.PUBLIC && canManage,
      canRenameCategory: library.type !== TemplateLibraryType.PUBLIC && canManage,
      canDeleteCategory: library.type !== TemplateLibraryType.PUBLIC && canManage,
    };
  }

  async listCategories(user: AccessTokenPayload, libraryType: TemplateLibraryType) {
    if (libraryType === TemplateLibraryType.PUBLIC) return [];
    const library = await this.ensureLibrary(user, libraryType);
    return this.prisma.templateCategory.findMany({ where: { libraryId: library.id }, orderBy: [{ position: 'asc' }, { name: 'asc' }] });
  }

  async renameCategory(user: AccessTokenPayload, id: string, name: string) {
    const category = await this.prisma.templateCategory.findFirst({ where: { id, orgId: user.org_id }, include: { library: true } });
    if (!category || !this.canManageLibrary(user, category.library)) throw new NotFoundException('Template category not found');
    return this.prisma.templateCategory.update({ where: { id }, data: { name } });
  }

  async deleteCategory(user: AccessTokenPayload, id: string) {
    const category = await this.prisma.templateCategory.findFirst({ where: { id, orgId: user.org_id }, include: { library: true } });
    if (!category || !this.canManageLibrary(user, category.library)) throw new NotFoundException('Template category not found');
    await this.prisma.template.updateMany({ where: { categoryId: id }, data: { categoryId: null } });
    await this.prisma.templateCategory.delete({ where: { id } });
    return { success: true };
  }

  private templateTypeFromFile(mimeType: string | null, extension: string | null): TemplateType {
    const mime = (mimeType ?? '').toLowerCase();
    const ext = (extension ?? '').toLowerCase();
    if (mime.includes('spreadsheet') || ['csv', 'xls', 'xlsx'].includes(ext)) return TemplateType.SPREADSHEET;
    if (mime.includes('presentation') || ['ppt', 'pptx', 'pps', 'ppsx'].includes(ext)) return TemplateType.PRESENTATION;
    return TemplateType.DOCUMENT;
  }
}
