import { isWorkflowAdmin } from './workflows.service';

describe('Workflow capability policy', () => {
  it('keeps workflow administration restricted to organization admins', () => {
    expect(isWorkflowAdmin({ role: 'ADMIN' } as any)).toBe(true);
    expect(isWorkflowAdmin({ role: 'SUPER_ADMIN' } as any)).toBe(true);
    expect(isWorkflowAdmin({ role: 'MEMBER' } as any)).toBe(false);
  });
});
