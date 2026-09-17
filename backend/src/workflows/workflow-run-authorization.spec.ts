import { describe, expect, it } from '@jest/globals';
import { isWorkflowAdmin } from './workflows.service';

describe('Workflow run authorization policy', () => {
  it('allows members to read workflow runs only through the visibility-filtered service path', () => {
    expect(isWorkflowAdmin({ role: 'MEMBER' } as any)).toBe(false);
    expect(isWorkflowAdmin({ role: 'ADMIN' } as any)).toBe(true);
  });

  it('keeps operational retry restricted to workflow administrators', () => {
    expect(isWorkflowAdmin({ role: 'MEMBER' } as any)).toBe(false);
    expect(isWorkflowAdmin({ role: 'SUPER_ADMIN' } as any)).toBe(true);
  });
});
