import { Injectable } from '@nestjs/common';
import { FileType, TeamFolderRole } from '@prisma/client';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { PermissionService, type AccessibleResource } from '../permissions/permission.service';
import { PrismaService } from '../prisma/prisma.service';

export type SearchOptions = {
  type?: string; owner?: string; dateField?: 'created'|'modified'; dateFrom?: string; dateTo?: string;
  page?: number; limit?: number; tags?: string[]; customField?: string; dataTemplateId?: string; sort?: 'relevance'|'updated'|'created'|'name';
};

type Hit = { score: number; matchedBy: string[] };

function scoreText(query: string, values: Array<[string, string | null | undefined, number]>): Hit {
  const q = query.toLocaleLowerCase(); const tokens = q.split(/\s+/).filter(Boolean); let score = 0; const matchedBy: string[] = [];
  for (const [label, value, weight] of values) {
    const text = (value ?? '').toLocaleLowerCase(); if (!text) continue;
    if (text === q) { score += weight * 2; matchedBy.push(label); continue; }
    if (text.includes(q)) { score += weight; matchedBy.push(label); }
    for (const token of tokens) if (token.length > 1 && text.includes(token)) score += weight * 0.2;
  }
  return { score, matchedBy };
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService, private readonly permissions: PermissionService) {}

  async search(user: AccessTokenPayload, query: string, filter: 'all'|'folders'|'files'|'recent' = 'all', options: SearchOptions = {}) {
    const page = Math.max(1, Math.floor(options.page ?? 1));
    const limit = Math.min(100, Math.max(1, Math.floor(options.limit ?? 25)));
    const candidateTake = Math.min(500, Math.max(100, page * limit * 4));
    const tagNames = (options.tags ?? []).map((x) => x.trim().toLocaleLowerCase()).filter(Boolean).slice(0, 20);
    const tagWhere = tagNames.length ? { tags: { some: { tag: { name: { in: tagNames } } } } } : {};
    const dateKey = options.dateField === 'created' ? 'createdAt' : 'updatedAt';
    const dateRange = options.dateFrom || options.dateTo ? { [dateKey]: { ...(options.dateFrom ? { gte: new Date(`${options.dateFrom}T00:00:00.000Z`) } : {}), ...(options.dateTo ? { lte: new Date(`${options.dateTo}T23:59:59.999Z`) } : {}) } } : {};
    const typeFilter = options.type && options.type !== 'all' && Object.values(FileType).includes(options.type as FileType) ? { fileType: options.type as FileType } : {};

    const [folders, files] = await Promise.all([
      this.prisma.folder.findMany({
        where: { orgId: user.org_id, name: { search: query }, OR: [{ teamFolderId: { not: null } }, { ownerId: user.sub }] },
        include: { owner: { select: { id: true, name: true, email: true, avatarUrl: true } }, dataTemplate: { select: { id: true, name: true } }, dataTemplateBindings: { include: { template: { select: { id: true, name: true } } } } },
        orderBy: { updatedAt: 'desc' }, take: candidateTake,
      }),
      this.prisma.file.findMany({
        where: {
          orgId: user.org_id, deletedAt: null, ...typeFilter, ...(options.owner ? { ownerId: options.owner } : {}), ...dateRange, ...tagWhere,
          OR: [
            { name: { search: query } },
            { originalName: { search: query } },
            { metadata: { title: { contains: query } } },
            { metadata: { description: { contains: query } } },
            { metadata: { contentText: { contains: query } } },
            { metadata: { ocrText: { contains: query } } },
          ],
          AND: [{ OR: [{ folder: null }, { folder: { teamFolderId: { not: null } } }, { folder: { ownerId: user.sub } }] }],
        },
        include: {
          folder: { select: { id: true, name: true, teamFolderId: true } },
          owner: { select: { id: true, name: true, email: true, avatarUrl: true } },
          metadata: { include: { dataTemplate: { select: { id: true, name: true } } } },
          tags: { include: { tag: { select: { id: true, name: true } } } },
          dataTemplateBindings: { include: { template: { select: { id: true, name: true } } } },
        },
        orderBy: { updatedAt: 'desc' }, take: candidateTake,
      }),
    ]);

    const recentSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const visibleFolders: Array<any> = [];
    for (const folder of folders) if (await this.canReadFolder(user, folder)) visibleFolders.push(folder);
    const visibleFiles: Array<any> = [];
    for (const file of files) if (await this.canReadFile(user, file)) visibleFiles.push(file);

    const folderHits = visibleFolders.map((folder) => ({ item: folder, ...scoreText(query, [['name', folder.name, 10]]), updatedAt: folder.updatedAt, createdAt: folder.updatedAt }))
      .filter((h) => !options.dataTemplateId || ((h.item as any).dataTemplateBindings || []).some((b: any) => b.templateId === options.dataTemplateId))
      .filter((h) => filter !== 'files' && (filter !== 'recent' || h.updatedAt >= recentSince));
    const fileHits = visibleFiles.map((file) => {
      const metadata = file.metadata;
      const text = scoreText(query, [['name', file.name, 10], ['originalName', file.originalName, 8], ['title', metadata?.title, 7], ['description', metadata?.description, 5], ['content', metadata?.contentText, 4], ['ocr', metadata?.ocrText, 3]]);
      const tagBoost = tagNames.length && file.tags.some((t: any) => tagNames.includes(t.tag.name.toLocaleLowerCase())) ? 4 : 0;
      const bindings = Array.isArray((file as any).dataTemplateBindings) ? (file as any).dataTemplateBindings : [];
      const templateBoost = options.dataTemplateId && bindings.some((b: any) => b.templateId === options.dataTemplateId) ? 8 : 0;
      const fieldBoost = bindings.some((b: any) => this.customFieldMatches(b.customFields, options.customField)) || this.customFieldMatches(metadata?.customFields, options.customField) ? 6 : 0;
      return { item: file, score: text.score + tagBoost + templateBoost + fieldBoost, matchedBy: [...text.matchedBy, ...(tagBoost ? ['tag'] : []), ...(templateBoost ? ['dataTemplate'] : []), ...(fieldBoost ? ['customField'] : [])], updatedAt: file.updatedAt, createdAt: file.createdAt };
    }).filter((h) => !options.dataTemplateId || ((h.item as any).dataTemplateBindings || []).some((b: any) => b.templateId === options.dataTemplateId))
      .filter((h) => filter !== 'folders' && (filter !== 'recent' || h.updatedAt >= recentSince));

    if (options.customField) {
      fileHits.splice(0, fileHits.length, ...fileHits.filter((h) => this.matchesFieldExpression((h.item as any).dataTemplateBindings?.map((b: any) => b.customFields) ?? [h.item.metadata?.customFields], options.customField)));
    }
    if (options.dataTemplateId) {
      fileHits.splice(0, fileHits.length, ...fileHits.filter((h) => ((h.item as any).dataTemplateBindings || []).some((b: any) => b.templateId === options.dataTemplateId)));
    }
    if (options.customField) {
      const [key] = options.customField.split(':');
      if (key) folderHits.splice(0, folderHits.length, ...folderHits.filter((h) => ((h.item as any).dataTemplateBindings || []).some((b: any) => this.matchesFieldExpression([b.customFields], options.customField))));
    }

    const sort = options.sort ?? 'relevance';
    const sorter = (a: any, b: any) => sort === 'name' ? a.item.name.localeCompare(b.item.name) : sort === 'created' ? b.createdAt.getTime() - a.createdAt.getTime() : sort === 'updated' ? b.updatedAt.getTime() - a.updatedAt.getTime() : b.score - a.score || b.updatedAt.getTime() - a.updatedAt.getTime();
    folderHits.sort(sorter); fileHits.sort(sorter);
    const folderStart = filter === 'files' ? 0 : (page - 1) * limit;
    const fileStart = filter === 'folders' ? 0 : (page - 1) * limit;
    const resultFolders = folderHits.slice(folderStart, folderStart + limit).map(({ item, score, matchedBy }) => ({ ...item, relevanceScore: Number(score.toFixed(3)), matchedBy }));
    const resultFiles = fileHits.slice(fileStart, fileStart + limit).map(({ item, score, matchedBy }) => ({ ...item, tags: item.tags.map((x: any) => x.tag), relevanceScore: Number(score.toFixed(3)), matchedBy }));
    return { query, page, limit, total: { folders: folderHits.length, files: fileHits.length }, folders: resultFolders, files: resultFiles };
  }

  private customFieldMatches(value: unknown, expression?: string) {
    if (!expression) return false; const [key, expected] = expression.split(':', 2); if (!key || expected === undefined || !value || typeof value !== 'object') return false;
    return String((value as Record<string, unknown>)[key]) === expected;
  }

  private matchesFieldExpression(values: unknown[], expression?: string) {
    if (!expression) return true;
    const parts = expression.split(':');
    const key = parts.shift()?.trim(); const op = parts.length > 1 ? parts.shift()?.trim() : 'eq'; const expected = parts.join(':').trim();
    if (!key || !expected) return false;
    return values.some((value) => {
      if (!value || typeof value !== 'object') return false;
      const actual = (value as Record<string, unknown>)[key];
      if (actual === undefined || actual === null) return false;
      const a = String(actual);
      if (op === 'contains') return a.toLocaleLowerCase().includes(expected.toLocaleLowerCase());
      if (op === 'neq') return a !== expected;
      if (op === 'gt' || op === 'above') return Number(actual) > Number(expected);
      if (op === 'lt' || op === 'below') return Number(actual) < Number(expected);
      return a === expected;
    });
  }

  private async canReadFolder(user: AccessTokenPayload, folder: { orgId: string; ownerId: string; teamFolderId?: string | null }) {
    if (folder.orgId !== user.org_id) return false;
    if (!folder.teamFolderId) return this.permissions.canRead(user, { orgId: folder.orgId, ownerId: folder.ownerId, teamFolderId: null });
    return this.permissions.canRead(user, await this.toTeamFolderResource(user, folder.orgId, folder.teamFolderId));
  }

  private async canReadFile(user: AccessTokenPayload, file: { orgId: string; ownerId: string; folder?: { teamFolderId: string | null } | null }) {
    if (file.orgId !== user.org_id) return false;
    const teamFolderId = file.folder?.teamFolderId ?? null;
    if (!teamFolderId) return this.permissions.canRead(user, { orgId: file.orgId, ownerId: file.ownerId, teamFolderId: null });
    return this.permissions.canRead(user, await this.toTeamFolderResource(user, file.orgId, teamFolderId));
  }

  private async toTeamFolderResource(user: AccessTokenPayload, orgId: string, teamFolderId: string): Promise<AccessibleResource> {
    const membership = await this.prisma.teamFolderMember.findFirst({ where: { teamFolderId, userId: user.sub } });
    return { orgId, ownerId: teamFolderId, teamFolderId, teamFolderRole: membership?.role ?? null };
  }
}
