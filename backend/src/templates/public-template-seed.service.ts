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
  type: string; file: string; extension: string; mime: string;
};

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

    const candidates = [join(__dirname, 'public-assets'), join(process.cwd(), 'dist/src/templates/public-assets'), join(process.cwd(), 'src/templates/public-assets')];
    let assetRoot = candidates[0];
    for (const candidate of candidates) { try { await access(candidate); assetRoot = candidate; break; } catch {} }
    const manifest = JSON.parse(await readFile(join(assetRoot, 'catalog-manifest.json'), 'utf8')) as CatalogItem[];
    let created = 0;

    // Public templates use the catalog's curated categories too. Categories are
    // created in the public library once and then reused by every seeded item.
    const categoryIds = new Map<string, string>();
    const categories = [...new Set(manifest.map((item) => item.category?.trim()).filter(Boolean))] as string[];
    for (const name of categories) {
      const category = await this.prisma.templateCategory.upsert({
        where: { libraryId_name: { libraryId: library.id, name } },
        create: { orgId: null, libraryId: library.id, name },
        update: {},
        select: { id: true },
      });
      categoryIds.set(name, category.id);
    }

    const typeMap: Record<string, TemplateType> = {
      DOCUMENT: TemplateType.DOCUMENT,
      SPREADSHEET: TemplateType.SPREADSHEET,
      PRESENTATION: TemplateType.PRESENTATION,
      doc: TemplateType.DOCUMENT,
      docx: TemplateType.DOCUMENT,
      txt: TemplateType.DOCUMENT,
      rtf: TemplateType.DOCUMENT,
      xls: TemplateType.SPREADSHEET,
      xlsx: TemplateType.SPREADSHEET,
      csv: TemplateType.SPREADSHEET,
      ppt: TemplateType.PRESENTATION,
      pptx: TemplateType.PRESENTATION,
      pps: TemplateType.PRESENTATION,
      ppsx: TemplateType.PRESENTATION,
    };

    for (const item of manifest) {
      const normalizedType = typeMap[String(item.type).trim().toLowerCase()] ?? typeMap[String(item.type).trim().toUpperCase()];
      if (!normalizedType) {
        this.logger.warn(`Skipping public template ${item.name}: unsupported type ${String(item.type)}`);
        continue;
      }
      const existing = await this.prisma.template.findFirst({ where: { libraryId: library.id, name: item.name, status: { not: TemplateStatus.TRASHED } }, include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } } });
      const categoryId = categoryIds.get(item.category?.trim() || '') ?? null;
      if (existing?.versions[0]) {
        if (existing.categoryId !== categoryId) {
          await this.prisma.template.update({ where: { id: existing.id }, data: { categoryId } });
        }
        continue;
      }
      const templateId = existing?.id ?? randomUUID();
      const versionId = randomUUID();
      const bytes = await readFile(join(assetRoot, item.file));
      const sha256Hash = createHash('sha256').update(bytes).digest('hex');
      const storageKey = this.storage.buildPublicTemplateObjectKey(templateId, versionId);
      await this.storage.storeObject({ fileId: templateId, versionId, ownerOrgId: creator.id, storageKey, contentType: item.mime, publicAccess: true }, bytes);
      await this.prisma.$transaction(async (tx) => {
        const template = existing
          ? await tx.template.update({ where: { id: templateId }, data: { status: TemplateStatus.ACTIVE, deletedAt: null, description: item.description, type: normalizedType, categoryId, ownerId: null, orgId: null } })
          : await tx.template.create({ data: { id: templateId, orgId: null, libraryId: library!.id, categoryId, ownerId: null, name: item.name, description: item.description, type: normalizedType, status: TemplateStatus.ACTIVE } });
        await tx.templateVersion.create({ data: { id: versionId, templateId: template.id, versionNumber: 1, storageKey, size: BigInt(bytes.length), mimeType: item.mime, extension: item.extension, sha256Hash, createdById: creator.id } });
      });
      created += 1;
    }
    this.logger.log(`Public template catalog ready: ${manifest.length} templates (${created} created).`);
    return true;
  }
}
