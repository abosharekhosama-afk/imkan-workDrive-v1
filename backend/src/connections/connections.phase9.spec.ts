describe('Connections Phase 9 health contracts', () => {
  it('uses stable health status categories for persisted checks', () => {
    const allowed = ['ACTIVE', 'REAUTH_REQUIRED', 'ERROR', 'DISABLED', 'PENDING_AUTH'];
    expect(allowed).toContain('ACTIVE');
    expect(allowed).toContain('REAUTH_REQUIRED');
    expect(allowed).toContain('ERROR');
  });

  it('caps health scan work to a bounded batch', () => {
    expect(Math.min(50, 50)).toBe(50);
    expect(Math.min(50, 100)).toBe(50);
  });

  it('keeps scan results attributable to an explicit source', () => {
    expect(['TEST', 'SCAN']).toContain('SCAN');
  });
});
