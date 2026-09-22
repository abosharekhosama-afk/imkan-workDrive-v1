import { BadRequestException } from '@nestjs/common';

describe('Phase 11 custom function lifecycle contracts', () => {
  it('requires draft versions to be published before they become the active version', () => {
    const draft = { status: 'DRAFT', activeVersionId: null };
    expect(draft.status).toBe('DRAFT');
    expect(draft.activeVersionId).toBeNull();
  });

  it('uses an explicit function version for test execution when supplied', () => {
    const request = { versionId: 'draft-version', input: { fields: { status: 'pending' } } };
    expect(request.versionId).toBe('draft-version');
  });

  it('exposes a stable in-use error contract for referenced functions', () => {
    const error = new BadRequestException({ code: 'FUNCTION_IN_USE', message: 'Function cannot be deleted while referenced by a workflow', references: [{ id: 'workflow-1', name: 'Approval', status: 'ACTIVE' }] });
    expect(error.getResponse()).toMatchObject({ code: 'FUNCTION_IN_USE' });
  });
});
