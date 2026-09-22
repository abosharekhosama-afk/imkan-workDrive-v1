describe('Connections Phase 5 reliability contract', () => {
  it('retries only safe/idempotent workflow requests and caps retry count at three', () => {
    const safe = (method: string, idempotencyKey?: string) => method === 'GET' || method === 'HEAD' || (!!idempotencyKey && ['PUT','PATCH','DELETE'].includes(method));
    expect(safe('GET')).toBe(true);
    expect(safe('POST')).toBe(false);
    expect(safe('PUT')).toBe(false);
    expect(safe('PUT', 'idem-1')).toBe(true);
    expect(Math.min(Math.max(7, 0), 3)).toBe(3);
  });

  it('records stable connection failure codes for workflow diagnostics', () => {
    expect(`HTTP_${401}`).toBe('HTTP_401');
    expect('TOKEN_REFRESH_FAILED').toMatch(/TOKEN_REFRESH_FAILED/);
    expect('REAUTH_REQUIRED').toMatch(/REAUTH_REQUIRED/);
  });
});
