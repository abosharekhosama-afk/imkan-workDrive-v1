import { applyOrgScopeForOperation } from './apply-org-scope';

describe('applyOrgScopeForOperation', () => {
  const orgId = 'org-1';

  it('scopes findMany with orgId', () => {
    const result = applyOrgScopeForOperation(
      'File',
      'findMany',
      { where: { deletedAt: null } },
      orgId,
    );
    expect(result.where).toEqual({
      AND: [{ deletedAt: null }, { orgId }],
    });
  });

  it('does not scope findUnique (Prisma unique where shape)', () => {
    const result = applyOrgScopeForOperation(
      'StorageObject',
      'findUnique',
      { where: { id: 'obj-1' } },
      orgId,
    );
    expect(result.where).toEqual({ id: 'obj-1' });
  });
});
