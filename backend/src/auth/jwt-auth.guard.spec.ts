import { createHash } from 'node:crypto';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AccessTokenPayload } from './jwt.types';

const SECRET = 'unit-test-jwt-secret';

function mockContext(authorization?: string): ExecutionContext {
  const request = {
    headers: authorization ? { authorization } : {},
    user: undefined as AccessTokenPayload | undefined,
  };
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  const config = {
    get: (key: string) => (key === 'JWT_SECRET' ? SECRET : undefined),
  } as ConfigService;
  const reflector = {
    getAllAndOverride: () => false,
  } as unknown as Reflector;
  const prisma = {
    session: { findFirst: jest.fn(), update: jest.fn() },
    organizationMembership: { findFirst: jest.fn() },
  };
  const guard = new JwtAuthGuard(config, reflector, prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.session.findFirst.mockResolvedValue(null);
    prisma.organizationMembership.findFirst.mockResolvedValue(null);
  });

  it('rejects missing Authorization header', async () => {
    await expect(guard.canActivate(mockContext())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a token signed with a different secret (forged JWT)', async () => {
    const forged = jwt.sign(
      { sub: 'user-1', org_id: 'org-a', email: 'a@example.com', role: 'ADMIN' },
      'wrong-secret',
    );
    await expect(
      guard.canActivate(mockContext(`Bearer ${forged}`)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accepts a valid session-backed token and exposes org_id', async () => {
    const token = jwt.sign(
      {
        sub: 'user-1',
        org_id: 'org-a',
        email: 'a@example.com',
        role: 'ADMIN',
        jti: '00000000-0000-4000-8000-0000000000a1',
      },
      SECRET,
    );
    prisma.session.findFirst.mockResolvedValue({
      id: '00000000-0000-4000-8000-0000000000a1',
    });
    prisma.organizationMembership.findFirst.mockResolvedValue({
      id: 'membership-a',
      userId: 'user-1',
      organizationId: 'org-a',
      status: 'ACTIVE',
      role: 'ADMIN',
    });
    const ctx = mockContext(`Bearer ${token}`);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(prisma.session.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: '00000000-0000-4000-8000-0000000000a1',
        userId: 'user-1',
        orgId: 'org-a',
        tokenHash: createHash('sha256').update(token).digest('hex'),
        revokedAt: null,
      }),
    });
    const req = ctx.switchToHttp().getRequest<{ user?: AccessTokenPayload }>();
    expect(req.user?.org_id).toBe('org-a');
    expect(req.user?.sub).toBe('user-1');
  });

  it('rejects a valid token whose session is no longer active', async () => {
    const token = jwt.sign(
      {
        sub: 'user-1',
        org_id: 'org-a',
        email: 'a@example.com',
        role: 'ADMIN',
        jti: '00000000-0000-4000-8000-0000000000a2',
      },
      SECRET,
    );
    prisma.session.findFirst.mockResolvedValue(null);
    await expect(
      guard.canActivate(mockContext(`Bearer ${token}`)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token without org_id', async () => {
    const token = jwt.sign({ sub: 'user-1', email: 'a@example.com' }, SECRET);
    await expect(
      guard.canActivate(mockContext(`Bearer ${token}`)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
