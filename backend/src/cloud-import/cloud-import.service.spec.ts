import { classifyGoogleDriveApiError } from '../connections/google-drive-api-logic';

function cloudProviderError(label: string, response: { status: number }, payload: any) {
  if (label === 'Google Drive') {
    const classified = classifyGoogleDriveApiError(response.status, payload);
    return `${classified.code}: ${classified.message}`;
  }
  return `${label} listing failed (HTTP ${response.status})`;
}

describe('cloud-import google drive errors', () => {
  it('returns GOOGLE_DRIVE_API_NOT_ENABLED for accessNotConfigured', () => {
    const message = cloudProviderError('Google Drive', { status: 403 }, {
      error: {
        errors: [{ reason: 'accessNotConfigured' }],
        message: 'Google Drive API has not been used in project 491774771733 before or it is disabled.',
      },
    });
    expect(message).toContain('GOOGLE_DRIVE_API_NOT_ENABLED');
  });

  it('returns INSUFFICIENT_SCOPE for scope failures', () => {
    const message = cloudProviderError('Google Drive', { status: 403 }, {
      error: {
        errors: [{ reason: 'insufficientPermissions' }],
        message: 'Insufficient Permission: Request had insufficient authentication scopes.',
      },
    });
    expect(message).toContain('INSUFFICIENT_SCOPE');
  });

  it('returns ACCESS_DENIED for file permission failures', () => {
    const message = cloudProviderError('Google Drive', { status: 403 }, {
      error: {
        errors: [{ reason: 'insufficientFilePermissions' }],
        message: 'The user does not have sufficient permissions for this file.',
      },
    });
    expect(message).toContain('ACCESS_DENIED');
  });
});
