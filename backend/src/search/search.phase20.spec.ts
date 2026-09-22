import { PermissionService } from '../permissions/permission.service';
import { SearchService } from './search.service';

const ORG = '00000000-0000-4000-8000-000000000001';
const USER = '00000000-0000-4000-8000-000000000011';

describe('SearchService Phase 20 discovery filters', () => {
  const prisma = {
    folder: { findMany: jest.fn() },
    file: { findMany: jest.fn() },
    teamFolderMember: { findFirst: jest.fn() },
  };
  const service = new SearchService(prisma as never, new PermissionService());
  const user = { sub: USER, org_id: ORG, email: 'user@example.imkan', role: 'MEMBER' };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.folder.findMany.mockResolvedValue([]);
    prisma.file.findMany.mockResolvedValue([]);
  });

  it('applies file type, owner and modified date filters server-side', async () => {
    await service.search(user, 'contract', 'files', {
      type: 'DOCUMENT', owner: USER, dateField: 'modified', dateFrom: '2026-09-01', dateTo: '2026-09-21',
    });
    const where = prisma.file.findMany.mock.calls[0][0].where;
    expect(where.fileType).toBe('DOCUMENT');
    expect(where.ownerId).toBe(USER);
    expect(where.updatedAt.gte).toEqual(new Date('2026-09-01T00:00:00.000Z'));
    expect(where.updatedAt.lte).toEqual(new Date('2026-09-21T23:59:59.999Z'));
  });

  it('searches file metadata title and description in addition to the file name', async () => {
    await service.search(user, 'quarterly', 'files');
    const where = prisma.file.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { name: { search: 'quarterly' } },
      { metadata: { title: { contains: 'quarterly' } } },
      { metadata: { description: { contains: 'quarterly' } } },
    ]);
  });
});
