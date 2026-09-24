import { buildOAuthBrowserUrl, normalizeOAuthReturnPath, resolveOAuthFrontendOrigin } from './oauth-flow';

describe('oauth-flow', () => {
  it('normalizeOAuthReturnPath accepts internal paths only', () => {
    expect(normalizeOAuthReturnPath('/files/connections')).toBe('/files/connections');
    expect(normalizeOAuthReturnPath('/files/workflows?tab=mine')).toBe('/files/workflows?tab=mine');
    expect(normalizeOAuthReturnPath('https://evil.example.com/phish')).toBe('/files/connections');
    expect(normalizeOAuthReturnPath('//evil.example.com')).toBe('/files/connections');
  });

  it('OAuth browser redirect stays on the configured frontend origin', () => {
    const frontend = resolveOAuthFrontendOrigin(
      'https://imkan-workdrive-v1.onrender.com',
      'https://imkan-workdrive-v1.onrender.com',
      'production',
    );
    expect(frontend).toBe('https://imkan-work-drive-v1.vercel.app');
    expect(
      buildOAuthBrowserUrl(frontend, '/files/connections?oauth=success&provider=google'),
    ).toBe('https://imkan-work-drive-v1.vercel.app/files/connections?oauth=success&provider=google');
  });
});
