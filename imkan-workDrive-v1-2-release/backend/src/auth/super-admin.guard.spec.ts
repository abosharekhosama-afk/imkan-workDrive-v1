import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import {
  ACCOUNT_CREATION_ERROR_CODE,
  SUPER_ADMIN_ONLY_MESSAGE,
  SuperAdminGuard,
} from './super-admin.guard';

function contextWith(user?: { role?: string }): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('SuperAdminGuard', () => {
  const guard = new SuperAdminGuard();

  it('allows an organization SUPER_ADMIN', () => {
    expect(guard.canActivate(contextWith({ role: 'SUPER_ADMIN' }))).toBe(true);
  });

  it('forbids an ADMIN with the exact localized denial message', () => {
    let caught: unknown;
    try {
      guard.canActivate(contextWith({ role: 'ADMIN' }));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ForbiddenException);
    const response = (caught as ForbiddenException).getResponse() as {
      statusCode: number;
      code: string;
      message: string;
    };
    expect(response.statusCode).toBe(403);
    expect(response.code).toBe(ACCOUNT_CREATION_ERROR_CODE);
    expect(response.message).toBe(SUPER_ADMIN_ONLY_MESSAGE);
  });

  it('forbids a MEMBER', () => {
    expect(() => guard.canActivate(contextWith({ role: 'MEMBER' }))).toThrow(
      ForbiddenException,
    );
  });

  it('forbids requests without an authenticated user', () => {
    expect(() => guard.canActivate(contextWith(undefined))).toThrow(
      ForbiddenException,
    );
  });
});