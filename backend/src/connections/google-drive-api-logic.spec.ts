import {
  classifyGoogleDriveApiError,
  isGoogleDriveApiNotEnabled,
  oauthClientIdFingerprint,
} from './google-drive-api-logic';

describe('google-drive-api-logic', () => {
  it('maps accessNotConfigured to GOOGLE_DRIVE_API_NOT_ENABLED', () => {
    const result = classifyGoogleDriveApiError(403, {
      error: {
        errors: [{ reason: 'accessNotConfigured' }],
        message: 'Google Drive API has not been used in project 491774771733 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=491774771733',
      },
    });
    expect(result.code).toBe('GOOGLE_DRIVE_API_NOT_ENABLED');
    expect(result.action).toBe('ENABLE_GOOGLE_DRIVE_API');
    expect(result.googleProject).toBe('491774771733');
  });

  it('does not map accessNotConfigured to INSUFFICIENT_SCOPE', () => {
    const result = classifyGoogleDriveApiError(403, {
      error: {
        errors: [{ reason: 'accessNotConfigured' }],
        message: 'Google Drive API has not been used in project 123 before or it is disabled.',
      },
    });
    expect(result.code).not.toBe('INSUFFICIENT_SCOPE');
  });

  it('maps insufficient scope separately', () => {
    const result = classifyGoogleDriveApiError(403, {
      error: {
        errors: [{ reason: 'insufficientPermissions' }],
        message: 'Insufficient Permission: Request had insufficient authentication scopes.',
      },
    });
    expect(result.code).toBe('INSUFFICIENT_SCOPE');
  });

  it('maps provider permission denial to ACCESS_DENIED', () => {
    const result = classifyGoogleDriveApiError(403, {
      error: {
        errors: [{ reason: 'insufficientFilePermissions' }],
        message: 'The user does not have sufficient permissions for this file.',
      },
    });
    expect(result.code).toBe('ACCESS_DENIED');
  });

  it('fingerprints oauth client ids without exposing full value', () => {
    expect(oauthClientIdFingerprint('491774771733-abc.apps.googleusercontent.com')).toBe('\.\.\.ontent\.com');
  });

  it('detects service disabled errors', () => {
    expect(isGoogleDriveApiNotEnabled({ reason: 'accessNotConfigured', message: 'Drive API disabled' })).toBe(true);
    expect(isGoogleDriveApiNotEnabled({ status: 'SERVICE_DISABLED', message: 'Service disabled' })).toBe(true);
  });
});

