import { AuditService } from './audit.service';

const ORG_A = '00000000-0000-4000-8000-000000000001';
const USER_A = '00000000-0000-4000-8000-000000000011';

describe('AuditService.list', () => {
  const prisma = {
    auditLog: { findMany: jest.fn() },
  };
  const service = new AuditService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.auditLog.findMany.mockResolvedValue([]);
  });

  it('queries audit_logs for the JWT tenant only', async () => {
    await service.list({
      sub: USER_A,
      org_id: ORG_A,
      email: 'admin@example.imkan',
      role: 'ADMIN',
    });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: ORG_A },
        take: 50,
      }),
    );
  });
});
