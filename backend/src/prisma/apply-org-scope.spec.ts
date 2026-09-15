import { applyOrgScope, applyOrgScopeForOperation } from './apply-org-scope';

describe('applyOrgScope', () => {
  it('appends orgId to tenant-scoped models', () => {
    const scoped = applyOrgScope('File', { where: { id: 'file-1' } }, 'org-a');
    expect(scoped.where).toEqual({
      AND: [{ id: 'file-1' }, { orgId: 'org-a' }],
    });
  });

  it('does not scope Organization queries by orgId column', () => {
    const scoped = applyOrgScope(
      'Organization',
      { where: { id: 'org-a' } },
      'org-b',
    );
    expect(scoped.where).toEqual({ id: 'org-a' });
  });

  it('does not append orgId to single-record update/delete where (unique id only)', () => {
    const updated = applyOrgScopeForOperation(
      'File',
      'update',
      { where: { id: 'file-1' }, data: { name: 'x' } },
      'org-a',
    );
    expect(updated.where).toEqual({ id: 'file-1' });
  });

  it('forces orgId on create so callers cannot write another tenant', () => {
    const scoped = applyOrgScopeForOperation(
      'Folder',
      'create',
      { data: { name: 'Inbox', orgId: 'org-b' } },
      'org-a',
    );
    expect(scoped.data).toEqual({ name: 'Inbox', orgId: 'org-a' });
  });
});
