import { buildConnectionCapabilitySummary, googleDriveActivationError, googleDriveAllFilesReadScopeGranted, googleDriveScopeGranted, mapGoogleDriveApiError, missingOAuthScopes, providerBrowseErrorCode } from './connection-browse-logic';

describe('connection-browse-logic', () => {
  it('accepts google drive readonly scope', () => {
    expect(googleDriveScopeGranted('openid email https://www.googleapis.com/auth/drive.readonly')).toBe(true);
    expect(googleDriveScopeGranted('openid https://www.googleapis.com/auth/drive.file')).toBe(false);
  });

  it('requires full Drive read scope for arbitrary cloud import files', () => {
    expect(googleDriveAllFilesReadScopeGranted('openid https://www.googleapis.com/auth/drive.file')).toBe(false);
    expect(googleDriveAllFilesReadScopeGranted('openid https://www.googleapis.com/auth/drive.readonly')).toBe(true);
    expect(googleDriveAllFilesReadScopeGranted('openid https://www.googleapis.com/auth/drive')).toBe(true);
  });

  it('rejects google connection without drive scope', () => {
    expect(googleDriveScopeGranted('openid email profile')).toBe(false);
  });

  it('calculates requested scopes missing from the granted token', () => {
    expect(missingOAuthScopes(['openid', 'email', 'https://www.googleapis.com/auth/drive.readonly'], 'openid email')).toEqual(['https://www.googleapis.com/auth/drive.readonly']);
    expect(missingOAuthScopes(['openid', 'email'], 'email openid openid')).toEqual([]);
  });

  it('maps insufficient scope messages', () => {
    expect(providerBrowseErrorCode('Google Drive file access is not authorized for this connection', 'google').code).toBe('INSUFFICIENT_SCOPE');
  });

  it('maps google access denied', () => {
    expect(providerBrowseErrorCode('403 Forbidden', 'google').code).toBe('ACCESS_DENIED');
  });

  it('builds google capability summary', () => {
    const summary = buildConnectionCapabilitySummary({ provider: 'google', authType: 'OAUTH2', scope: 'openid email', errorCode: 'DRIVE_SCOPE_REQUIRED' });
    expect(summary.driveReconnectRequired).toBe(true);
    expect(summary.items).toHaveLength(4);
  });

  it('returns drive activation error when arbitrary-file read scope is missing', () => {
    expect(googleDriveActivationError('openid email')?.errorCode).toBe('DRIVE_SCOPE_REQUIRED');
    expect(googleDriveActivationError('openid https://www.googleapis.com/auth/drive.file')?.errorCode).toBe('DRIVE_SCOPE_REQUIRED');
    expect(googleDriveActivationError('openid https://www.googleapis.com/auth/drive.readonly')).toBeNull();
  });

  it('maps google drive api scope errors', () => {
    expect(mapGoogleDriveApiError(403, { error: { errors: [{ reason: 'insufficientPermissions' }], message: 'Insufficient Permission' } }).code).toBe('ACCESS_DENIED');
  });
});

