import { ForbiddenException } from '@nestjs/common';
import { isWorkflowAdmin } from './workflows.service';

describe('Workflow authorization contracts', () => {
  const admin = { role: 'ADMIN' } as any;
  const superAdmin = { role: 'SUPER_ADMIN' } as any;
  const member = { role: 'MEMBER' } as any;

  it('recognizes only organization admins as workflow administrators', () => {
    expect(isWorkflowAdmin(admin)).toBe(true);
    expect(isWorkflowAdmin(superAdmin)).toBe(true);
    expect(isWorkflowAdmin(member)).toBe(false);
  });

  it('keeps the authorization failure explicit and server-side', () => {
    const requireAdmin = (user: any) => {
      if (!isWorkflowAdmin(user)) throw new ForbiddenException('Workflow administration requires an organization admin');
    };
    expect(() => requireAdmin(member)).toThrow(ForbiddenException);
    expect(() => requireAdmin(admin)).not.toThrow();
  });
});
