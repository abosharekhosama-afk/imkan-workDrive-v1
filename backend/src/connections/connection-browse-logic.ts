export function googleDriveScopeGranted(scope: string | null | undefined): boolean {
  const granted = String(scope ?? '')
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return granted.some((item) =>
    item === 'https://www.googleapis.com/auth/drive.readonly'
    || item === 'https://www.googleapis.com/auth/drive'
    || item === 'https://www.googleapis.com/auth/drive.file',
  );
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
}) {
  const identity = resolveGoogleIdentityCapability(input.provider, input.authType, input.scope);
  const driveRead = resolveGoogleDriveCapability(input.provider, input.authType, input.scope);
  const driveReconnectRequired = input.errorCode === 'DRIVE_SCOPE_REQUIRED' || driveRead === 'required';
  return {
    identity,
    driveRead: driveReconnectRequired && driveRead !== 'not_applicable' ? 'required' as const : driveRead,
    driveReconnectRequired,
    items: input.provider === 'google' && input.authType === 'OAUTH2'
      ? [
          { key: 'google.identity', label: 'Identity', state: identity },
          { key: 'google.drive.read', label: 'Drive file access', state: driveReconnectRequired ? 'required' as const : driveRead },
        ]
      : [],
  };
}

export function googleDriveActivationError(scope: string | null | undefined): { errorCode: string; errorMessage: string } | null {
  if (googleDriveScopeGranted(scope)) return null;
  return {
    errorCode: 'DRIVE_SCOPE_REQUIRED',
    errorMessage: 'Google Drive file access is not authorized for this connection.',
  };
}

export function mapGoogleDriveApiError(status: number, payload: unknown): { code: string; message: string } {
  const record = payload && typeof payload === 'object' ? payload as Record<string, any> : {};
  const reason = String(record?.error?.errors?.[0]?.reason ?? record?.error?.message ?? '').toLowerCase();
  if (status === 401) {
    return { code: 'TOKEN_EXPIRED', message: 'Your connection expired. Reconnect to continue.' };
  }
  if (status === 404) {
    return { code: 'NOT_FOUND', message: 'The requested folder or file was not found.' };
  }
  if (status === 403) {
    if (/insufficientfilepermissions|cannotmodify|cannotshare|filenotshareable|sharing/.test(reason)) {
      return { code: 'ACCESS_DENIED', message: 'Google Drive access was denied for this resource.' };
    }
    if (/insufficientpermissions|forbidden/.test(reason)) {
      return { code: 'ACCESS_DENIED', message: 'Google Drive access was denied for this resource.' };
    }
    if (/insufficient.*scope|accessnotconfigured|autherror/.test(reason) && /scope|auth/.test(reason)) {
      return { code: 'INSUFFICIENT_SCOPE', message: 'Google Drive file access is not authorized for this connection.' };
    }
    return { code: 'ACCESS_DENIED', message: 'Google Drive access was denied for this resource.' };
  }
  const message = String(record?.error?.message ?? status).trim();
  return { code: 'PROVIDER_ERROR', message: message || 'We could not access this folder.' };
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
