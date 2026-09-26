import { classifyGoogleDriveApiError, resolveCloudImportReady, resolveDriveApiOperationalState, type GoogleDriveApiStatus } from './google-drive-api-logic';

export function normalizeOAuthScopes(scope: string | null | undefined): string[] {
  return [...new Set(String(scope ?? '').split(/\s+/).map((item) => item.trim()).filter(Boolean))];
}

export function missingOAuthScopes(requested: string[] | null | undefined, granted: string | null | undefined): string[] {
  const grantedSet = new Set(normalizeOAuthScopes(granted));
  return [...new Set((requested ?? []).map((item) => String(item).trim()).filter(Boolean))].filter((item) => !googleScopeSatisfied(item, grantedSet));
}

function googleScopeSatisfied(requested: string, grantedSet: Set<string>): boolean {
  if (grantedSet.has(requested)) return true;
  if (requested === 'email') return grantedSet.has('https://www.googleapis.com/auth/userinfo.email');
  if (requested === 'profile') return grantedSet.has('https://www.googleapis.com/auth/userinfo.profile');
  return false;
}

export function googleDriveScopeGranted(scope: string | null | undefined): boolean {
  const granted = normalizeOAuthScopes(scope);
  return granted.some((item) =>
    item === 'https://www.googleapis.com/auth/drive.readonly'
    || item === 'https://www.googleapis.com/auth/drive',
  );
}



/** Google Drive browser/import access to arbitrary existing files requires full read access.
 * drive.file is intentionally not treated as sufficient because it only covers files
 * created/opened by the app and cannot guarantee that an arbitrary selected Drive file
 * can be listed/downloaded by the cloud importer.
 */
export function googleDriveAllFilesReadScopeGranted(scope: string | null | undefined): boolean {
  const granted = new Set(normalizeOAuthScopes(scope));
  return granted.has('https://www.googleapis.com/auth/drive.readonly')
    || granted.has('https://www.googleapis.com/auth/drive');
}

export type ConnectionCapabilityState = 'granted' | 'required' | 'not_applicable';

export function resolveGoogleDriveCapability(
  provider: string,
  authType: string,
  scope: string | null | undefined,
): ConnectionCapabilityState {
  if (provider !== 'google' || authType !== 'OAUTH2') return 'not_applicable';
  return googleDriveScopeGranted(scope) ? 'granted' : 'required';
}

export function resolveGoogleIdentityCapability(
  provider: string,
  authType: string,
  scope: string | null | undefined,
): ConnectionCapabilityState {
  if (provider !== 'google' || authType !== 'OAUTH2') return 'not_applicable';
  const granted = String(scope ?? '')
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (granted.some((item) => item === 'openid' || item.includes('userinfo') || item.includes('email'))) return 'granted';
  return 'required';
}

export function googleDriveScopeRequired(
  provider: string,
  authType: string,
  scope: string | null | undefined,
): boolean {
  return provider === 'google' && authType === 'OAUTH2' && !googleDriveScopeGranted(scope);
}

export function buildConnectionCapabilitySummary(input: {
  provider: string;
  authType: string;
  scope: string | null | undefined;
  errorCode?: string | null;
  googleDriveApi?: GoogleDriveApiStatus | null;
}) {
  const identity = resolveGoogleIdentityCapability(input.provider, input.authType, input.scope);
  const driveOAuthScope = resolveGoogleDriveCapability(input.provider, input.authType, input.scope);
  const driveApiOperational = resolveDriveApiOperationalState(input.googleDriveApi ?? null);
  const driveScopeGranted = driveOAuthScope === 'granted';
  const driveApiBlocked = driveApiOperational === 'not_enabled' || input.errorCode === 'GOOGLE_DRIVE_API_NOT_ENABLED';
  const driveReconnectRequired = input.errorCode === 'DRIVE_SCOPE_REQUIRED' || driveOAuthScope === 'required';
  const cloudImportReady = resolveCloudImportReady({ driveScopeGranted, driveApiOperational: driveApiBlocked ? 'not_enabled' : driveApiOperational });
  const driveApiState: ConnectionCapabilityState = input.provider !== 'google' || input.authType !== 'OAUTH2'
    ? 'not_applicable'
    : driveApiOperational === 'unknown'
      ? 'required'
      : driveApiBlocked
        ? 'required'
        : 'granted';
  const cloudImportState: ConnectionCapabilityState = input.provider !== 'google' || input.authType !== 'OAUTH2'
    ? 'not_applicable'
    : cloudImportReady === 'ready' ? 'granted' : 'required';
  return {
    identity,
    driveRead: driveReconnectRequired ? 'required' as const : driveOAuthScope,
    driveOAuthScope,
    driveApiOperational,
    driveApiState,
    cloudImportReady,
    cloudImportState,
    driveReconnectRequired,
    driveApiBlocked,
    items: input.provider === 'google' && input.authType === 'OAUTH2'
      ? [
          { key: 'google.identity', label: 'Identity', state: identity },
          { key: 'google.drive.oauth', label: 'Drive OAuth scope', state: driveReconnectRequired ? 'required' as const : driveOAuthScope },
          { key: 'google.drive.api', label: 'Google Drive API', state: driveApiState },
          { key: 'google.cloud_import', label: 'Cloud Import', state: cloudImportState },
        ]
      : [],
  };
}

export function googleDriveActivationError(
  scope: string | null | undefined,
  googleDriveApi?: GoogleDriveApiStatus | null,
): { errorCode: string; errorMessage: string } | null {
  if (!googleDriveAllFilesReadScopeGranted(scope)) {
    return {
      errorCode: 'DRIVE_SCOPE_REQUIRED',
      errorMessage: 'Google Drive file access is not authorized for this connection.',
    };
  }
  if (googleDriveApi && !googleDriveApi.operational && googleDriveApi.errorCode === 'GOOGLE_DRIVE_API_NOT_ENABLED') {
    return {
      errorCode: 'GOOGLE_DRIVE_API_NOT_ENABLED',
      errorMessage: 'Google Drive API is not enabled for the Google Cloud project used by this OAuth connection.',
    };
  }
  return null;
}

export function mapGoogleDriveApiError(status: number, payload: unknown): { code: string; message: string } {
  const mapped = classifyGoogleDriveApiError(status, payload);
  return { code: mapped.code, message: mapped.message };
}

export function providerBrowseErrorCode(error: unknown, provider?: string): { code: string; message: string } {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const message = raw.trim();
  const lower = message.toLowerCase();

  if (/insufficient_scope|drive_scope_required|google drive file access is not authorized|reconnect to grant google drive/i.test(lower)) {
    return { code: 'INSUFFICIENT_SCOPE', message: 'Google Drive file access is not authorized for this connection.' };
  }
  if (/401|invalid_grant|token expired|expired\. reconnect/i.test(lower)) {
    return { code: 'TOKEN_EXPIRED', message: 'Your connection expired. Reconnect to continue.' };
  }
  if (/403|access denied|forbidden|access was denied/i.test(lower)) {
    if (provider === 'google') {
      if (/scope|authorized|reconnect/i.test(lower)) {
        return { code: 'INSUFFICIENT_SCOPE', message: 'Google Drive file access is not authorized for this connection.' };
      }
      return { code: 'ACCESS_DENIED', message: 'Google Drive access was denied for this resource.' };
    }
    return { code: 'ACCESS_DENIED', message: 'Provider denied access to this folder.' };
  }
  if (/429|rate limit/i.test(lower)) {
    return { code: 'RATE_LIMITED', message: 'Provider rate limit reached. Try again shortly.' };
  }
  if (/not found|404/i.test(lower)) {
    return { code: 'NOT_FOUND', message: 'The requested folder or file was not found.' };
  }
  if (message.length > 0 && message.length < 260) {
    return { code: 'PROVIDER_ERROR', message };
  }
  return { code: 'PROVIDER_ERROR', message: 'We could not access this folder.' };
}
