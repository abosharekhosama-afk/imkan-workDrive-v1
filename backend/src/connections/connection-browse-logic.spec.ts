import { googleDriveScopeGranted, providerBrowseErrorCode } from './connection-browse-logic';

describe('connection-browse-logic', () => {
  it('accepts google drive readonly scope', () => {
    expect(googleDriveScopeGranted('openid email https://www.googleapis.com/auth/drive.readonly')).toBe(true);
  });

  it('rejects google connection without drive scope', () => {
    expect(googleDriveScopeGranted('openid email profile')).toBe(false);
  });

  it('maps insufficient scope messages', () => {
    expect(providerBrowseErrorCode('Reconnect to grant Google Drive file access', 'google').code).toBe('INSUFFICIENT_SCOPE');
  });

  it('maps google access denied', () => {
    expect(providerBrowseErrorCode('403 Forbidden', 'google').code).toBe('ACCESS_DENIED');
  });
});
