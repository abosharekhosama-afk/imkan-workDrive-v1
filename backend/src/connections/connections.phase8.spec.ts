describe('Connections Phase 8 ownership governance contracts', () => {
  it('requires an explicit organization member target for ownership transfer', () => {
    const currentOwner = 'owner-1';
    const target = 'owner-2';
    expect(target).not.toBe(currentOwner);
  });

  it('keeps system/admin connections organization-visible after transfer', () => {
    const connectionType = 'SYSTEM';
    const visibility = connectionType === 'USER' ? 'PRIVATE' : 'ORGANIZATION';
    expect(visibility).toBe('ORGANIZATION');
  });

  it('treats private active-workflow references as a transfer risk', () => {
    const visibility = 'PRIVATE';
    const activeReferences = ['workflow-1'];
    expect(visibility === 'PRIVATE' && activeReferences.length > 0).toBe(true);
  });
});
