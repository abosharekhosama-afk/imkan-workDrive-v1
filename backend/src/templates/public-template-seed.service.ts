import { Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE, type StorageService } from '../storage/storage.types';
import { TemplateLibraryType, TemplateStatus, TemplateType } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { access } from 'node:fs/promises';

type CatalogItem = {
  slug: string; name: string; category: string; description: string;
  // The JSON manifest stores file-format labels (docx/xlsx/pptx).
  // Prisma expects the TemplateType enum values below, so normalize it at runtime.
  type: string; file: string; extension: string; mime: string;
};

function normalizeTemplateType(value: string, extension: string, mime: string): TemplateType {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'document' || raw === 'doc' || raw === 'docx' || mime.includes('word') || ['doc', 'docx', 'txt', 'rtf'].includes(extension.toLowerCase())) {
    return TemplateType.DOCUMENT;
  }
  if (raw === 'spreadsheet' || raw === 'sheet' || raw === 'xls' || raw === 'xlsx' || mime.includes('spreadsheet') || ['xls', 'xlsx', 'csv'].includes(extension.toLowerCase())) {
    return TemplateType.SPREADSHEET;
  }
  if (raw === 'presentation' || raw === 'show' || raw === 'ppt' || raw === 'pptx' || mime.includes('presentation') || ['ppt', 'pptx', 'pps', 'ppsx'].includes(extension.toLowerCase())) {
    return TemplateType.PRESENTATION;
  }
  throw new Error(`Unsupported public template type: ${value} (${extension}, ${mime})`);
}

@Injectable()
export class PublicTemplateSeedService implements OnModuleInit {
  private readonly logger = new Logger(PublicTemplateSeedService.name);
  private seeded = false;
  private seeding: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  async onModuleInit(): Promise<void> {
    try { await this.ensureSeed(); }
    catch (error) { this.logger.error(`Public template catalog seed failed: ${error instanceof Error ? error.message : String(error)}`); }
  }

  async ensureSeed(): Promise<void> {
    if (this.seeded) return;
    if (this.seeding) {
      await this.seeding;
      return;
    }

    this.seeding = this.seed()
      .then((completed) => {
        if (completed) this.seeded = true;
      })
      .finally(() => {
        this.seeding = null;
      });

    await this.seeding;
  }

  private async seed(): Promise<boolean> {
    const creator = await this.prisma.user.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } });
    if (!creator) {
      // Do not mark the seed as complete here. On fresh deployments the Nest
      // module can initialize before the first user exists; the next public
      // request must be allowed to retry the seed.
      this.logger.warn('Public template catalog seed deferred: no user exists yet.');
      return false;
    }

    let library = await this.prisma.templateLibrary.findFirst({ where: { orgId: null, ownerId: null, type: TemplateLibraryType.PUBLIC } });
    if (!library) library = await this.prisma.templateLibrary.create({ data: { orgId: null, ownerId: null, type: TemplateLibraryType.PUBLIC, name: 'Public Templates' } });

    const candidates = [
      join(__dirname, 'public-assets'),
      join(process.cwd(), 'dist/templates/public-assets'),
      join(process.cwd(), 'dist/src/templates/public-assets'),
      join(process.cwd(), 'src/templates/public-assets'),
    ];
    let assetRoot: string | null = null;
    for (const candidate of candidates) { try { await access(join(candidate, 'catalog-manifest.json')); assetRoot = candidate; break; } catch {} }
    if (!assetRoot) {
      throw new Error(`Public template assets are missing. Checked: ${candidates.join(', ')}`);
    }
    const manifest = JSON.parse(await readFile(join(assetRoot, 'catalog-manifest.json'), 'utf8')) as CatalogItem[];
    let created = 0;

    for (const item of manifest) {
      const normalizedType = normalizeTemplateType(item.type, item.extension, item.mime);
      const existing = await this.prisma.template.findFirst({ where: { libraryId: library.id, name: item.name, status: { not: TemplateStatus.TRASHED } }, include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } } });
      if (existing?.versions[0]) continue;
      const templateId = existing?.id ?? randomUUID();
      const versionId = randomUUID();
      const bytes = await readFile(join(assetRoot, item.file));
      const sha256Hash = createHash('sha256').update(bytes).digest('hex');
      const storageKey = this.storage.buildPublicTemplateObjectKey(templateId, versionId);
      await this.storage.storeObject({ fileId: templateId, versionId, ownerOrgId: creator.id, storageKey, contentType: item.mime, publicAccess: true }, bytes);
      await this.prisma.$transaction(async (tx) => {
        const template = existing
          ? await tx.template.update({ where: { id: templateId }, data: { status: TemplateStatus.ACTIVE, deletedAt: null, description: item.description, type: normalizedType, ownerId: null, orgId: null } })
          : await tx.template.create({ data: { id: templateId, orgId: null, libraryId: library!.id, ownerId: null, name: item.name, description: item.description, type: normalizedType, status: TemplateStatus.ACTIVE } });
        await tx.templateVersion.create({ data: { id: versionId, templateId: template.id, versionNumber: 1, storageKey, size: BigInt(bytes.length), mimeType: item.mime, extension: item.extension, sha256Hash, createdById: creator.id } });
      });
      created += 1;
    }
    this.logger.log(`Public template catalog ready: ${manifest.length} templates (${created} created).`);
    return true;
  }
}
