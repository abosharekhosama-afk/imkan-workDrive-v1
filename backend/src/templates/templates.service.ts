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
import { createHash, randomUUID } from 'node:crypto';
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
import { OfficeConversionService } from '../office/office-conversion.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => FilesService)) private readonly files: FilesService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    private readonly permissions: PermissionService,
    private readonly publicTemplateSeed: PublicTemplateSeedService,
    @Inject(forwardRef(() => OfficeService)) private readonly office: OfficeService,
    private readonly officeConversion: OfficeConversionService,
    private readonly notifications: NotificationsService,
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
    await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'TEMPLATE_BUILDER_UPDATED', resourceType: null, resourceId: id, metadata: { fields: input.fields.length, sections: input.sections.length, tables: input.tables.length, images: input.images.length, rules: input.rules.length } } });
    return { id: builder.id, templateId: id, draft: builder.draft, published: builder.published, publishedAt: builder.publishedAt?.toISOString() ?? null, canEdit: true, canPublish: true };
  }

  async publishBuilder(user: AccessTokenPayload, id: string) {
    const template = await this.getManagedTemplate(user, id);
    const existing = await this.prisma.templateBuilder.findUnique({ where: { templateId: id } });
    const draft = (existing?.draft ?? defaultTemplateBuilderConfig()) as Prisma.InputJsonValue;
    const builder = await this.prisma.templateBuilder.upsert({ where: { templateId: id }, create: { id: randomUUID(), templateId: id, draft, published: draft, publishedAt: new Date(), publishedById: user.sub }, update: { published: draft, publishedAt: new Date(), publishedById: user.sub } });
    await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'TEMPLATE_BUILDER_PUBLISHED', resourceType: null, resourceId: id, metadata: { templateVersion: template.versions[0]?.versionNumber ?? 0 } } });
    const publishedBy = await this.prisma.user.findUnique({ where: { id: user.sub }, select: { id: true, name: true, email: true } });
    return { id: builder.id, templateId: id, draft: builder.draft, published: builder.published, publishedAt: builder.publishedAt?.toISOString() ?? null, publishedBy, canEdit: true, canPublish: true };
  }

  async unpublishBuilder(user: AccessTokenPayload, id: string) {
    await this.getManagedTemplate(user, id);
    const builder = await this.prisma.templateBuilder.upsert({ where: { templateId: id }, create: { id: randomUUID(), templateId: id, draft: defaultTemplateBuilderConfig() as Prisma.InputJsonValue }, update: { published: Prisma.JsonNull, publishedAt: null, publishedById: null } });
    await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'TEMPLATE_BUILDER_UNPUBLISHED', resourceType: null, resourceId: id, metadata: {} } });
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
    await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'TEMPLATE_UPDATED', resourceType: null, resourceId: id, metadata: input } });
    return this.get(user, id);
  }

  async publishContentFromOffice(user: AccessTokenPayload, id: string, input: { fileId: string; versionNote?: string | null }) {
    const template = await this.getManagedTemplate(user, id);
    const fileId = input.fileId?.trim();
    if (!fileId) throw new BadRequestException('Office fileId is required');

    const officeDocument = await this.prisma.officeDocument.findFirst({
      where: { fileId, orgId: user.org_id },
      select: { id: true, sourceTemplateId: true, sourceTemplateVersionId: true, type: true, revision: true },
    });
    if (!officeDocument) throw new ConflictException('The working file is not an IMKAN Office document');
    if (officeDocument.sourceTemplateId !== id) throw new ForbiddenException('This Office document is not a working copy of the selected template');

    const sourceVersion = template.versions[0];
    if (!sourceVersion || officeDocument.sourceTemplateVersionId !== sourceVersion.id) {
      throw new ConflictException('The working copy is not linked to a valid template version');
    }

    const exported = await this.office.exportCurrentForTemplate(user, fileId);
    const extension = exported.format;
    const mimeType = exported.mimeType;
    const bytes = exported.buffer;
    const versionNumber = (sourceVersion.versionNumber ?? 0) + 1;
    const versionId = randomUUID();
    const storageKey = this.storage.buildObjectKey(id, versionId);
    const sha256Hash = createHash('sha256').update(bytes).digest('hex');

    await this.storage.storeObject({ fileId: id, versionId, ownerOrgId: user.org_id, storageKey, contentType: mimeType }, bytes);
    try {
      const created = await this.prisma.$transaction(async tx => {
        const version = await tx.templateVersion.create({
          data: {
            id: versionId,
            templateId: id,
            versionNumber,
            storageKey,
            size: BigInt(bytes.byteLength),
            mimeType,
            extension,
            sha256Hash,
            createdById: user.sub,
          },
        });
        await tx.auditLog.create({
          data: {
            orgId: user.org_id,
            actorId: user.sub,
            action: 'TEMPLATE_CONTENT_PUBLISHED',
            resourceType: null,
            resourceId: id,
            metadata: {
              fileId,
              documentId: officeDocument.id,
              sourceTemplateVersionId: officeDocument.sourceTemplateVersionId,
              versionId,
              versionNumber,
              revision: exported.revision,
              versionNote: input.versionNote?.trim() || null,
            },
          },
        });
        return version;
      });
      await this.notifications.createOfficeNotification({
        userId: user.sub,
        orgId: user.org_id,
        category: 'templateAutomation',
        title: 'Template content published',
        body: `${template.name} version ${created.versionNumber} is now available.`,
        resourceType: null,
        resourceId: id,
      }).catch(() => undefined);
      return {
        templateId: id,
        templateVersionId: created.id,
        version: created.versionNumber,
        fileId,
        officeDocumentId: officeDocument.id,
        revision: exported.revision,
        extension,
        mimeType,
        size: bytes.byteLength,
        versionNote: input.versionNote?.trim() || null,
      };
    } catch (error) {
      await this.storage.deleteStoredObject(storageKey).catch(() => undefined);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('The template was published concurrently. Reload the latest template and publish again.');
      }
      throw error;
    }
  }

  async updateFromFile(user: AccessTokenPayload, id: string, input: ReturnType<typeof parseTemplateFromFile>) {
    const template = await this.getManagedTemplate(user, id);
    const file = await this.assertSourceFile(user, input.fileId);
    const category = input.categoryId !== null ? await this.assertCategory(user, input.categoryId, template.libraryId) : null;
    const nextVersion = (template.versions[0]?.versionNumber ?? 0) + 1;
    const snapshot = await this.snapshotFileVersion(user, id, nextVersion, file, file.versions[0]);
    try {
      await this.prisma.template.update({ where: { id }, data: { name: input.name, description: input.description ?? template.description, categoryId: input.categoryId === null ? null : (category?.id ?? template.categoryId) } });
      await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'TEMPLATE_VERSION_CREATED', resourceType: null, resourceId: id, metadata: { sourceFileId: file.id, versionNumber: nextVersion } } });
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
        await tx.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'TEMPLATE_DUPLICATED', resourceType: null, resourceId: templateId, metadata: { sourceTemplateId: id } } });
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
    await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'TEMPLATE_DELETED', resourceType: null, resourceId: id } });
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
        await tx.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'TEMPLATE_CREATED_FROM_FILE', resourceType: null, resourceId: template.id, metadata: { sourceFileId: file.id, library: input.library } } });
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
        const reason = error instanceof Error ? error.message : 'Unknown Office initialization error';
        await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'OFFICE_TEMPLATE_INITIALIZATION_FAILED', resourceType: 'FILE', resourceId: created.file_id, metadata: { templateId: id, templateVersionId: version.id, error: reason } } }).catch(() => undefined);
        throw new ConflictException(`Unable to prepare the template for IMKAN Office editing: ${reason}`);
      }
    }
    return { ...created, office: officeDocument ? { documentId: officeDocument.id, type: officeDocument.type, nativeFormat: officeDocument.nativeFormat, revision: officeDocument.revision } : null };
  }

  /** Phase 36: create a concrete Office document from a template and optionally a PDF copy. */
  private async getAutomationContext(user: AccessTokenPayload, id: string) {
    const template = await this.prisma.template.findFirst({
      where: { id, deletedAt: null, OR: [{ orgId: user.org_id }, { orgId: null, library: { type: TemplateLibraryType.PUBLIC } }] },
      include: { library: true, versions: { orderBy: { versionNumber: 'desc' }, take: 1 }, variables: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } },
    });
    if (!template || !this.canUseTemplate(user, template)) throw new NotFoundException('Template not found');
    const version = template.versions[0];
    if (!version) throw new NotFoundException('Template content not found');
    return { template, version };
  }

  private validateAutomationValues(template: any, values: Record<string, unknown>) {
    const normalized: Record<string, unknown> = {};
    const errors: Array<{ variable: string; message: string }> = [];
    for (const variable of template.variables) {
      const supplied = values[variable.name];
      const value = supplied === undefined || supplied === null || supplied === '' ? variable.defaultValue : supplied;
      normalized[variable.name] = value ?? '';
      if (variable.required && (value === undefined || value === null || value === '')) {
        errors.push({ variable: variable.name, message: `Required template variable is missing: ${variable.name}` });
        continue;
      }
      if (value !== undefined && value !== null && value !== '' && variable.type === 'NUMBER' && !Number.isFinite(Number(value))) errors.push({ variable: variable.name, message: `Invalid number for template variable: ${variable.name}` });
      if (value !== undefined && value !== null && value !== '' && variable.type === 'CHOICE' && Array.isArray(variable.options) && !variable.options.map(String).includes(String(value))) errors.push({ variable: variable.name, message: `Invalid choice for template variable: ${variable.name}` });
      if (value !== undefined && value !== null && value !== '' && variable.type === 'EMAIL' && !/^\S+@\S+\.\S+$/.test(String(value))) errors.push({ variable: variable.name, message: `Invalid email for template variable: ${variable.name}` });
      if (value !== undefined && value !== null && value !== '' && variable.type === 'URL') { try { new URL(String(value)); } catch { errors.push({ variable: variable.name, message: `Invalid URL for template variable: ${variable.name}` }); } }
    }
    return { normalized, errors };
  }

  async validateAutomation(user: AccessTokenPayload, id: string, values: Record<string, unknown>) {
    const { template, version } = await this.getAutomationContext(user, id);
    const result = this.validateAutomationValues(template, values);
    return { valid: result.errors.length === 0, templateId: id, templateVersionId: version.id, templateVersion: version.versionNumber, values: result.normalized, errors: result.errors, variables: template.variables.map((v: any) => ({ name: v.name, label: v.label, type: v.type, required: v.required, defaultValue: v.defaultValue, options: v.options })) };
  }

  async certifyTemplate(user: AccessTokenPayload, id: string) {
    const { template, version } = await this.getAutomationContext(user, id);
    const extension = (version.extension ?? '').replace(/^\./, '').toLowerCase();
    const supportedOffice = ['docx', 'xlsx', 'pptx'].includes(extension);
    const checks: Array<{ key: string; status: 'PASS' | 'WARNING' | 'FAIL'; message: string; details?: Record<string, unknown> }> = [];

    checks.push({
      key: 'template-create-file',
      status: version.storageKey ? 'PASS' : 'FAIL',
      message: version.storageKey ? 'Published template snapshot is available for File creation.' : 'Template version has no storage snapshot.',
      details: { templateVersionId: version.id, version: version.versionNumber },
    });

    const variables = template.variables.map((v: any) => ({ name: v.name, type: v.type, required: v.required, defaultValue: v.defaultValue, options: v.options }));
    const duplicateNames = variables.map(v => v.name).filter((name, index, all) => all.indexOf(name) !== index);
    checks.push({
      key: 'variables',
      status: duplicateNames.length ? 'FAIL' : 'PASS',
      message: duplicateNames.length ? `Duplicate template variables: ${[...new Set(duplicateNames)].join(', ')}` : `${variables.length} template variables are structurally valid.`,
      details: { count: variables.length, duplicateNames: [...new Set(duplicateNames)] },
    });

    let imported: any = null;
    let exportedBytes = 0;
    let placeholderCount = 0;
    if (supportedOffice) {
      try {
        const bytes = await this.storage.readStoredObject(version.storageKey);
        imported = await this.officeConversion.import(bytes, template.name + (version.extension ? `.${extension}` : ''));
        const normalized = imported.content;
        const placeholderText = JSON.stringify(normalized);
        placeholderCount = (placeholderText.match(/{{\s*[^}]+?\s*}}/g) ?? []).length;
        const sampleValues: Record<string, unknown> = {};
        for (const variable of template.variables) sampleValues[variable.name] = variable.defaultValue ?? (variable.type === 'NUMBER' ? 1 : variable.type === 'BOOLEAN' ? true : 'Certification Test');
        const substituted = this.replaceTemplateValues(normalized, template.variables, sampleValues);
        const exported = await this.officeConversion.export(imported.type, substituted, extension as 'docx' | 'xlsx' | 'pptx');
        exportedBytes = exported.buffer.byteLength;
        checks.push({ key: 'variables-substitution', status: 'PASS', message: `Template variables can be substituted in the native ${imported.type} model.`, details: { placeholderCount, sampleVariables: Object.keys(sampleValues).length } });
        checks.push({ key: 'export', status: exportedBytes > 0 ? 'PASS' : 'FAIL', message: exportedBytes > 0 ? `Native ${extension.toUpperCase()} export completed in certification mode.` : 'Native export returned an empty document.', details: { bytes: exportedBytes, format: extension } });
      } catch (error) {
        checks.push({ key: 'variables-substitution', status: 'FAIL', message: error instanceof Error ? error.message : 'Template import/substitution failed.' });
        checks.push({ key: 'export', status: 'FAIL', message: 'Export certification could not complete because template import failed.' });
      }
    } else {
      checks.push({ key: 'variables-substitution', status: 'WARNING', message: 'Native Writer/Sheet/Show certification is not applicable to this non-Office template format.' });
      checks.push({ key: 'export', status: 'WARNING', message: 'Native Office export certification is not applicable to this template format.' });
    }

    checks.push({ key: 'edit', status: supportedOffice && imported ? 'PASS' : 'WARNING', message: supportedOffice && imported ? 'Native Office content can be loaded into the editable model.' : 'Live editor certification requires an Office-compatible template.' });
    checks.push({ key: 'save', status: 'WARNING', message: 'Live persistence is intentionally not mutated by certification; execute through Create File → Edit → Save in the application test environment.' });
    checks.push({ key: 'version', status: version.versionNumber > 0 ? 'PASS' : 'FAIL', message: version.versionNumber > 0 ? `Template version ${version.versionNumber} is available.` : 'No valid template version is available.', details: { version: version.versionNumber } });

    const officeType = imported?.type ?? null;
    for (const type of ['WRITER', 'SHEET', 'SHOW'] as const) {
      const applicable = type === officeType;
      checks.push({ key: type.toLowerCase(), status: applicable ? 'PASS' : supportedOffice ? 'WARNING' : 'WARNING', message: applicable ? `${type} native model certification passed.` : `${type} certification is not applicable to this template's native type.` });
    }

    const failed = checks.filter(c => c.status === 'FAIL').length;
    const warnings = checks.filter(c => c.status === 'WARNING').length;
    const status = failed ? 'FAILED' : warnings ? 'CERTIFIED_WITH_WARNINGS' : 'CERTIFIED';
    await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'TEMPLATE_CERTIFIED', resourceType: null, resourceId: template.id, metadata: { templateVersionId: version.id, status, failed, warnings, checks: checks.map(c => ({ key: c.key, status: c.status })) } } });
    return { status, templateId: template.id, templateVersionId: version.id, templateVersion: version.versionNumber, templateType: template.type, extension, nativeOfficeType: officeType, placeholderCount, checks, generatedAt: new Date().toISOString() };
  }

  async enqueueAutomation(user: AccessTokenPayload, id: string, input: {
    name: string;
    folderId?: string | null;
    values?: Record<string, unknown>;
    generatePdf?: boolean;
    pdfFolderId?: string | null;
  }) {
    const { template } = await this.getAutomationContext(user, id);
    const values = input.values ?? {};
    const validation = this.validateAutomationValues(template, values);
    if (validation.errors.length) throw new BadRequestException(validation.errors[0].message);
    const payload = {
      templateId: id,
      name: input.name.trim() || `${template.name} generated`,
      folderId: input.folderId ?? null,
      values: validation.normalized,
      generatePdf: input.generatePdf === true,
      pdfFolderId: input.pdfFolderId ?? null,
    };
    const job = await this.prisma.officeBackgroundJob.create({ data: { orgId: user.org_id, createdById: user.sub, type: 'TEMPLATE_AUTOMATION', payload: payload as Prisma.InputJsonValue } });
    await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'OFFICE_BACKGROUND_JOB_QUEUED', resourceType: null, resourceId: id, metadata: { jobId: job.id, type: job.type } } });
    return { jobId: job.id, status: job.status, type: job.type, queuedAt: job.createdAt.toISOString() };
  }

  async getAutomationJob(user: AccessTokenPayload, jobId: string) {
    const job = await this.prisma.officeBackgroundJob.findFirst({ where: { id: jobId, orgId: user.org_id, createdById: user.sub } });
    if (!job) throw new NotFoundException('Background job not found');
    return { id: job.id, type: job.type, status: job.status, attempts: job.attempts, maxAttempts: job.maxAttempts, result: job.result, error: job.error, runAt: job.runAt.toISOString(), completedAt: job.completedAt?.toISOString() ?? null, createdAt: job.createdAt.toISOString(), updatedAt: job.updatedAt.toISOString() };
  }

  async listAutomationRuns(user: AccessTokenPayload, id: string, limit = 20) {
    const { template } = await this.getAutomationContext(user, id);
    const take = Math.min(100, Math.max(1, Math.floor(limit || 20)));
    const rows = await this.prisma.templateAutomationRun.findMany({ where: { templateId: template.id, createdById: user.sub }, orderBy: { createdAt: 'desc' }, take });
    return rows.map((run) => ({ id: run.id, status: run.status, name: run.name, templateId: run.templateId, templateVersionId: run.templateVersionId, fileId: run.fileId, pdfFileId: run.pdfFileId, error: run.error, startedAt: run.startedAt?.toISOString() ?? null, completedAt: run.completedAt?.toISOString() ?? null, createdAt: run.createdAt.toISOString() }));
  }

  async automateFromTemplate(user: AccessTokenPayload, id: string, input: {
    name: string;
    folderId?: string | null;
    values?: Record<string, unknown>;
    generatePdf?: boolean;
    pdfFolderId?: string | null;
  }) {
    const { template, version } = await this.getAutomationContext(user, id);
    const values = input.values ?? {};
    const validation = this.validateAutomationValues(template, values);
    if (validation.errors.length) throw new BadRequestException(validation.errors[0].message);
    const normalizedValues = validation.normalized;
    const extension = (version.extension ?? '').replace(/^\./, '').toLowerCase();
    const finalName = input.name.trim() || `${template.name} generated`;
    const run = await this.prisma.templateAutomationRun.create({ data: { id: randomUUID(), templateId: id, templateVersionId: version.id, createdById: user.sub, status: 'PENDING', name: finalName, values: normalizedValues as Prisma.InputJsonValue } });
    try {
      await this.prisma.templateAutomationRun.update({ where: { id: run.id }, data: { status: 'RUNNING', startedAt: new Date() } });
      const created = await this.files.createFileFromStorageSnapshot(user, { folderId: input.folderId ?? null, name: extension && !finalName.toLowerCase().endsWith(`.${extension}`) ? `${finalName}.${extension}` : finalName, mimeType: version.mimeType, extension, size: version.size, sha256Hash: version.sha256Hash, sourceStorageKey: version.storageKey });
      let officeDocument: any = null;
      if (['docx','xlsx','pptx'].includes(extension)) {
        officeDocument = await this.office.initializeFromTemplateFile(user, created.file_id, id, version.id);
        const substituted = this.replaceTemplateValues(officeDocument.content, template.variables, normalizedValues);
        officeDocument = await this.office.save(user, created.file_id, substituted, officeDocument.revision);
      }
      let pdf: { fileId: string; name: string } | null = null;
      if (input.generatePdf && officeDocument) {
        const format = extension as 'docx'|'xlsx'|'pptx';
        const exported = await this.office.exportFile(user, created.file_id, format);
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
      await this.prisma.templateAutomationRun.update({ where: { id: run.id }, data: { status: 'SUCCEEDED', fileId: created.file_id, pdfFileId: pdf?.fileId ?? null, completedAt: new Date() } });
      await this.notifications.createOfficeNotification({ userId: user.sub, orgId: user.org_id, category: 'templateAutomation', title: 'Template automation completed', body: `${finalName} was generated successfully.`, resourceType: 'FILE', resourceId: created.file_id }).catch(() => undefined);
      await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'TEMPLATE_AUTOMATION_GENERATED', resourceType: null, resourceId: id, metadata: { runId: run.id, fileId: created.file_id, templateVersionId: version.id, variableCount: template.variables.length, pdfFileId: pdf?.fileId ?? null } } });
      return { runId: run.id, templateId: id, templateVersionId: version.id, fileId: created.file_id, name: created.name, office: officeDocument ? { documentId: officeDocument.id, revision: officeDocument.revision, type: officeDocument.type } : null, pdf };
    } catch (error) {
      await this.prisma.templateAutomationRun.update({ where: { id: run.id }, data: { status: 'FAILED', error: error instanceof Error ? error.message : 'Template automation failed', completedAt: new Date() } }).catch(() => undefined);
      throw error;
    }
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

  async activity(user: AccessTokenPayload, id: string, limit = 50) {
    const template = await this.prisma.template.findFirst({
      where: { id, deletedAt: null, OR: [{ orgId: user.org_id }, { orgId: null, library: { type: TemplateLibraryType.PUBLIC } }] },
      include: { library: true },
    });
    if (!template || !this.canUseTemplate(user, template as any)) throw new NotFoundException('Template not found');
    const take = Math.min(Math.max(Number.isFinite(limit) ? Math.floor(limit) : 50, 1), 200);
    const rows = await this.prisma.auditLog.findMany({
      where: { orgId: user.org_id, resourceType: null, resourceId: id },
      orderBy: { createdAt: 'desc' },
      take,
      include: { actor: { select: { id: true, name: true, email: true } } },
    });
    return rows.map(row => ({
      id: row.id,
      action: row.action,
      createdAt: row.createdAt.toISOString(),
      actor: row.actor ? { id: row.actor.id, name: row.actor.name, email: row.actor.email } : null,
      metadata: row.metadata ?? null,
    }));
  }

  async compareVersions(user: AccessTokenPayload, id: string, leftId: string, rightId: string) {
    const template = await this.prisma.template.findFirst({
      where: { id, deletedAt: null, OR: [{ orgId: user.org_id }, { orgId: null, library: { type: TemplateLibraryType.PUBLIC } }] },
      include: { library: true },
    });
    if (!template || !this.canUseTemplate(user, template as any)) throw new NotFoundException('Template not found');
    if (!leftId || !rightId || leftId === rightId) throw new BadRequestException('Two different template versions are required');
    const [left, right] = await Promise.all([
      this.prisma.templateVersion.findFirst({ where: { id: leftId, templateId: id }, include: { createdBy: { select: { id: true, name: true, email: true } } } }),
      this.prisma.templateVersion.findFirst({ where: { id: rightId, templateId: id }, include: { createdBy: { select: { id: true, name: true, email: true } } } }),
    ]);
    if (!left || !right) throw new NotFoundException('Template version not found');
    return {
      templateId: id,
      templateName: template.name,
      left: { id: left.id, version: left.versionNumber, size: Number(left.size), mimeType: left.mimeType, extension: left.extension, sha256Hash: left.sha256Hash, createdAt: left.createdAt.toISOString(), createdBy: left.createdBy },
      right: { id: right.id, version: right.versionNumber, size: Number(right.size), mimeType: right.mimeType, extension: right.extension, sha256Hash: right.sha256Hash, createdAt: right.createdAt.toISOString(), createdBy: right.createdBy },
      sameContent: left.sha256Hash === right.sha256Hash,
      changes: {
        sizeDelta: Number(right.size) - Number(left.size),
        mimeChanged: left.mimeType !== right.mimeType,
        extensionChanged: left.extension !== right.extension,
        hashChanged: left.sha256Hash !== right.sha256Hash,
      },
    };
  }

  async restoreVersion(user: AccessTokenPayload, id: string, versionId: string) {
    const template = await this.prisma.template.findFirst({
      where: { id, deletedAt: null, OR: [{ orgId: user.org_id }, { orgId: null, library: { type: TemplateLibraryType.PUBLIC } }] },
      include: { library: true, versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });
    if (!template || !this.canManageLibrary(user, template.library)) throw new ForbiddenException('You cannot manage this template');
    const source = await this.prisma.templateVersion.findFirst({ where: { id: versionId, templateId: id } });
    if (!source) throw new NotFoundException('Template version not found');
    const latest = template.versions[0];
    const nextNumber = (latest?.versionNumber ?? 0) + 1;
    const newVersionId = randomUUID();
    const storageKey = this.storage.buildObjectKey(id, newVersionId);
    await this.storage.copyStoredObject(source.storageKey, { fileId: id, versionId: newVersionId, ownerOrgId: user.org_id, storageKey, contentType: source.mimeType });
    try {
      const created = await this.prisma.$transaction(async tx => {
        const version = await tx.templateVersion.create({
          data: { id: newVersionId, templateId: id, versionNumber: nextNumber, storageKey, size: source.size, mimeType: source.mimeType, extension: source.extension, sha256Hash: source.sha256Hash, createdById: user.sub },
        });
        await tx.auditLog.create({
          data: {
            orgId: user.org_id,
            actorId: user.sub,
            action: 'TEMPLATE_VERSION_RESTORED',
            resourceType: null,
            resourceId: id,
            metadata: { restoredFromVersionId: source.id, restoredFromVersion: source.versionNumber, newVersionId: version.id, newVersion: version.versionNumber },
          },
        });
        return version;
      });
      await this.notifications.createOfficeNotification({ userId: user.sub, orgId: user.org_id, category: 'templateAutomation', title: 'Template version restored', body: `${template.name} restored version ${source.versionNumber} as version ${created.versionNumber}.`, resourceType: null, resourceId: id }).catch(() => undefined);
      return { templateId: id, restoredFromVersionId: source.id, restoredFromVersion: source.versionNumber, templateVersionId: created.id, version: created.versionNumber };
    } catch (error) {
      await this.storage.deleteStoredObject(storageKey).catch(() => undefined);
      throw error;
    }
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
      try {
        officeDocument = await this.office.initializeFromTemplateFile(user, created.file_id, id, version.id);
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Unknown Office initialization error';
        await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'OFFICE_TEMPLATE_INITIALIZATION_FAILED', resourceType: 'FILE', resourceId: created.file_id, metadata: { templateId: id, templateVersionId: version.id, error: reason } } }).catch(() => undefined);
        throw new ConflictException(`Unable to prepare the selected template version for IMKAN Office editing: ${reason}`);
      }
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
      data: { orgId: user.org_id, actorId: user.sub, action: 'TEMPLATE_RESTORED', resourceType: null, resourceId: id },
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
      data: { orgId: user.org_id, actorId: user.sub, action: 'TEMPLATE_PERMANENTLY_DELETED', resourceType: null, resourceId: id },
    });
    return { success: true };
  }

  async createCategory(user: AccessTokenPayload, libraryType: TemplateLibraryType, name: string) {
    if (libraryType === TemplateLibraryType.PUBLIC) throw new ForbiddenException('Public template categories are managed by the catalog');
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
    if (libraryType === TemplateLibraryType.PUBLIC) {
      await this.publicTemplateSeed.ensureSeed();
    }
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
