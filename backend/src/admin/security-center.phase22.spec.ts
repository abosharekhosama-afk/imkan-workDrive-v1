import { EnterpriseService } from './enterprise.service';
import { OrgRole } from '@prisma/client';

describe('Phase 22 security center', () => {
  const prisma = {
    session: { count: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    userDevice: { count: jest.fn() },
    securityEvent: { findMany: jest.fn(), create: jest.fn() },
  } as any;
  const service = new EnterpriseService(prisma);
  const admin = { sub: 'admin-1', org_id: 'org-1', role: OrgRole.ADMIN } as any;

  beforeEach(() => jest.clearAllMocks());

  it('returns organization-scoped security counters and events', async () => {
    prisma.session.count.mockResolvedValueOnce(4).mockResolvedValueOnce(2);
    prisma.userDevice.count.mockResolvedValue(3);
    prisma.securityEvent.findMany.mockResolvedValue([{ id: 'e1', eventType: 'LOGIN_SUCCESS' }]);

    const result = await service.securityCenter(admin);

    expect(result.activeSessions).toBe(4);
    expect(result.revokedSessions).toBe(2);
    expect(result.activeDevices).toBe(3);
    expect(result.events).toHaveLength(1);
    expect(prisma.session.count.mock.calls[0][0].where.orgId).toBe('org-1');
    expect(prisma.securityEvent.findMany.mock.calls[0][0].where.orgId).toBe('org-1');
  });

  it('revokes an admin-selected session only inside the current organization', async () => {
    prisma.session.findFirst.mockResolvedValue({ id: 's1', userId: 'user-2', orgId: 'org-1' });
    prisma.session.update.mockResolvedValue({});
    prisma.securityEvent.create.mockResolvedValue({});

    await service.revokeUserSession(admin, 's1');

    expect(prisma.session.findFirst).toHaveBeenCalledWith({ where: { id: 's1', orgId: 'org-1' } });
    expect(prisma.session.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 's1' } }));
    expect(prisma.securityEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ orgId: 'org-1', eventType: 'ADMIN_SESSION_REVOKED', resourceId: 's1' }),
    }));
  });
});
