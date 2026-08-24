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
  const guard = new JwtAuthGuard(config, reflector);

  it('rejects missing Authorization header', () => {
    expect(() => guard.canActivate(mockContext())).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token signed with a different secret (forged JWT)', () => {
    const forged = jwt.sign(
      { sub: 'user-1', org_id: 'org-a', email: 'a@example.com', role: 'ADMIN' },
      'wrong-secret',
    );
    expect(() => guard.canActivate(mockContext(`Bearer ${forged}`))).toThrow(
      UnauthorizedException,
    );
  });

  it('accepts a valid token and exposes org_id', () => {
    const token = jwt.sign(
      { sub: 'user-1', org_id: 'org-a', email: 'a@example.com', role: 'ADMIN' },
      SECRET,
    );
    const ctx = mockContext(`Bearer ${token}`);
    expect(guard.canActivate(ctx)).toBe(true);
    const req = ctx.switchToHttp().getRequest<{ user?: AccessTokenPayload }>();
    expect(req.user?.org_id).toBe('org-a');
    expect(req.user?.sub).toBe('user-1');
  });

  it('rejects a token without org_id', () => {
    const token = jwt.sign({ sub: 'user-1', email: 'a@example.com' }, SECRET);
    expect(() => guard.canActivate(mockContext(`Bearer ${token}`))).toThrow(
      UnauthorizedException,
    );
  });
});
