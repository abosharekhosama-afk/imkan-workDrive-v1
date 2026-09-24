import { appendOAuthResumeFragment, buildOAuthBrowserUrl, friendlyOAuthMessage, normalizeOAuthReturnPath } from './oauth-flow';

describe('oauth return', () => {
  it('keeps an internal workflow path and its query', () => {
    expect(normalizeOAuthReturnPath('/files/workflows/123/builder?step=2')).toBe('/files/workflows/123/builder?step=2');
    expect(normalizeOAuthReturnPath('/files/connections')).toBe('/files/connections');
  });

  it('rejects an external return path', () => {
    expect(normalizeOAuthReturnPath('https://evil.com')).toBe('/files/connections');
    expect(normalizeOAuthReturnPath('//evil.com')).toBe('/files/connections');
  });

  it('puts a resume code in the fragment and never a query token', () => {
    const location = appendOAuthResumeFragment('https://app.example/files/connections?oauth=success', 'resume-code');
    expect(location).toBe('https://app.example/files/connections?oauth=success#imkan_resume=resume-code');
    expect(location.includes('access_token')).toBe(false);
    expect(location.includes('imkan_session')).toBe(false);
  });

  it('does not leave the configured frontend origin', () => {
    expect(buildOAuthBrowserUrl('https://app.example', '/files/workflows/123/builder?step=2')).toBe('https://app.example/files/workflows/123/builder?step=2');
    expect(buildOAuthBrowserUrl('https://app.example', 'https://evil.com')).toBe('https://app.example/files/connections');
  });

  it('hides provider error codes from the user message', () => {
    expect(friendlyOAuthMessage('invalid_grant')).toBe('Your connection expired. Reconnect to continue.');
    expect(friendlyOAuthMessage('access_denied')).toContain("couldn't access");
  });
});
