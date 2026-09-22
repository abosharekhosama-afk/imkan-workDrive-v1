import { PermissionService } from '../permissions/permission.service';
import { SearchService } from './search.service';

const ORG = '00000000-0000-4000-8000-000000000001';
const USER = '00000000-0000-4000-8000-000000000011';

describe('SearchService Phase 27', () => {
  const prisma = {
    folder: { findMany: jest.fn() },
    file: { findMany: jest.fn() },
    teamFolderMember: { findFirst: jest.fn() },
  };
  const service = new SearchService(prisma as never, new PermissionService());
  const user = { sub: USER, org_id: ORG, email: 'user@example.imkan', role: 'MEMBER' };

  beforeEach(() => {
    jest.clearAllMocks(); prisma.folder.findMany.mockResolvedValue([]); prisma.file.findMany.mockResolvedValue([]);
  });

  it('passes pagination, tags and content-search predicates to Prisma', async () => {
    await service.search(user, 'contract', 'files', { page: 2, limit: 10, tags: ['legal'], sort: 'relevance' });
    const where = prisma.file.findMany.mock.calls[0][0].where;
    expect(where.orgId).toBe(ORG);
    expect(where.deletedAt).toBeNull();
    expect(where.tags).toEqual({ some: { tag: { name: { in: ['legal'] } } } });
    expect(where.OR).toEqual(expect.arrayContaining([
      { name: { search: 'contract' } },
      { metadata: { contentText: { contains: 'contract' } } },
      { metadata: { ocrText: { contains: 'contract' } } },
    ]));
  });

  it('ranks title/name hits above OCR-only hits', async () => {
    prisma.file.findMany.mockResolvedValue([
      { id: '1', orgId: ORG, ownerId: USER, name: 'contract.pdf', originalName: 'contract.pdf', createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'), folder: null, metadata: { title: null, description: null, contentText: null, ocrText: null, customFields: {} }, tags: [] },
      { id: '2', orgId: ORG, ownerId: USER, name: 'scan.pdf', originalName: 'scan.pdf', createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02'), folder: null, metadata: { title: null, description: null, contentText: null, ocrText: 'contract', customFields: {} }, tags: [] },
    ]);
    const result = await service.search(user, 'contract', 'files', { limit: 10 });
    expect(result.files.map((f) => f.id)).toEqual(['1', '2']);
    expect(result.files[0].relevanceScore).toBeGreaterThan(result.files[1].relevanceScore);
  });

  it('filters by a custom field expression after permission filtering', async () => {
    prisma.file.findMany.mockResolvedValue([
      { id: '1', orgId: ORG, ownerId: USER, name: 'a.pdf', originalName: 'a.pdf', createdAt: new Date(), updatedAt: new Date(), folder: null, metadata: { title: null, description: null, contentText: 'x', ocrText: null, customFields: { status: 'signed' } }, tags: [] },
      { id: '2', orgId: ORG, ownerId: USER, name: 'b.pdf', originalName: 'b.pdf', createdAt: new Date(), updatedAt: new Date(), folder: null, metadata: { title: null, description: null, contentText: 'x', ocrText: null, customFields: { status: 'draft' } }, tags: [] },
    ]);
    const result = await service.search(user, 'x', 'files', { field: 'status:signed' });
    expect(result.files.map((f) => f.id)).toEqual(['1']);
  });
});
