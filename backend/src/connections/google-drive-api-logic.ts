export type GoogleDriveApiErrorCode =
  | 'GOOGLE_DRIVE_API_NOT_ENABLED'
  | 'INSUFFICIENT_SCOPE'
  | 'ACCESS_DENIED'
  | 'TOKEN_EXPIRED'
  | 'NOT_FOUND'
  | 'PROVIDER_ERROR';

export type StructuredCloudImportError = {
  code: GoogleDriveApiErrorCode;
  message: string;
  connectionId?: string;
  retryable: boolean;
  action?: string;
  googleReason?: string;
  googleProject?: string;
};

export const GOOGLE_DRIVE_API_BASE_URL = 'https://www.googleapis.com/drive/v3';

export function oauthClientIdFingerprint(clientId: string | null | undefined): string | null {
  const trimmed = String(clientId ?? '').trim();
  if (!trimmed) return null;
  return trimmed.length > 10 ? `...${trimmed.slice(-10)}` : trimmed;
}

export function extractGoogleProjectFromMessage(message: string | null | undefined): string | null {
  const text = String(message ?? '');
  const projectMatch = text.match(/project[:\s]+([0-9]+)/i);
  if (projectMatch?.[1]) return projectMatch[1];
  const namedMatch = text.match(/project[:\s]+([a-z0-9-]+)/i);
  return namedMatch?.[1] ?? null;
}

export function parseGoogleApiError(payload: unknown): { reason: string; message: string; status: string } {
  const record = payload && typeof payload === 'object' ? payload as Record<string, any> : {};
  const reason = String(record?.error?.errors?.[0]?.reason ?? '').trim();
  const message = String(record?.error?.message ?? record?.error_description ?? record?.message ?? '').trim();
  const status = String(record?.error?.status ?? record?.error?.code ?? '').trim();
  return { reason, message, status };
}

export function isGoogleDriveApiNotEnabled(input: { reason?: string; message?: string; status?: string }): boolean {
  const blob = `${input.reason ?? ''} ${input.message ?? ''} ${input.status ?? ''}`.toLowerCase();
  return /accessnotconfigured|service_disabled|servicedisabled|has not been used in project|it is disabled|api has not been enabled/.test(blob);
}

export function isGoogleDriveInsufficientScope(input: { reason?: string; message?: string; status?: string }): boolean {
  const blob = `${input.reason ?? ''} ${input.message ?? ''} ${input.status ?? ''}`.toLowerCase();
  if (isGoogleDriveApiNotEnabled(input)) return false;
  return /insufficient.*scope|insufficientpermissions.*scope|autherror|invalid_scope/.test(blob);
}

export function classifyGoogleDriveApiError(status: number, payload: unknown): StructuredCloudImportError {
  const parsed = parseGoogleApiError(payload);
  const googleProject = extractGoogleProjectFromMessage(parsed.message);

  if (status === 401) {
    return {
      code: 'TOKEN_EXPIRED',
      message: 'Your connection expired. Reconnect to continue.',
      retryable: false,
      action: 'RECONNECT',
      googleReason: parsed.reason || undefined,
    };
  }

  if (status === 404) {
    return {
      code: 'NOT_FOUND',
      message: 'The requested folder or file was not found.',
      retryable: false,
      googleReason: parsed.reason || undefined,
    };
  }

  if (status === 403) {
    if (isGoogleDriveApiNotEnabled(parsed)) {
      return {
        code: 'GOOGLE_DRIVE_API_NOT_ENABLED',
        message: 'Google Drive API is not enabled for the Google Cloud project used by this OAuth connection.',
        retryable: false,
        action: 'ENABLE_GOOGLE_DRIVE_API',
        googleReason: parsed.reason || 'accessNotConfigured',
        googleProject: googleProject ?? undefined,
      };
    }
    if (isGoogleDriveInsufficientScope(parsed)) {
      return {
        code: 'INSUFFICIENT_SCOPE',
        message: 'Google Drive file access is not authorized for this connection.',
        retryable: false,
        action: 'RECONNECT_GOOGLE_DRIVE',
        googleReason: parsed.reason || undefined,
      };
    }
    if (/insufficientfilepermissions|cannotmodify|cannotshare|filenotshareable|sharing/.test(parsed.reason.toLowerCase())) {
      return {
        code: 'ACCESS_DENIED',
        message: 'Google Drive access was denied for this resource.',
        retryable: false,
        googleReason: parsed.reason || undefined,
      };
    }
    return {
      code: 'ACCESS_DENIED',
      message: 'Google Drive access was denied for this resource.',
      retryable: false,
      googleReason: parsed.reason || undefined,
    };
  }

  const message = parsed.message || `Google Drive request failed (HTTP ${status})`;
  return {
    code: 'PROVIDER_ERROR',
    message: message.length < 260 ? message : 'We could not access Google Drive.',
    retryable: status === 429,
    googleReason: parsed.reason || undefined,
    googleProject: googleProject ?? undefined,
  };
}

export function buildStructuredCloudImportError(
  error: StructuredCloudImportError,
  connectionId?: string | null,
): StructuredCloudImportError {
  return {
    ...error,
    connectionId: connectionId ?? error.connectionId,
  };
}

export type GoogleDriveApiStatus = {
  operational: boolean;
  checkedAt: string;
  errorCode?: GoogleDriveApiErrorCode;
  googleReason?: string;
  googleProject?: string;
  driveApiBaseUrl?: string;
};

export function buildGoogleDriveApiStatus(
  operational: boolean,
  error?: StructuredCloudImportError | null,
): GoogleDriveApiStatus {
  return {
    operational,
    checkedAt: new Date().toISOString(),
    driveApiBaseUrl: GOOGLE_DRIVE_API_BASE_URL,
    ...(error ? {
      errorCode: error.code,
      googleReason: error.googleReason,
      googleProject: error.googleProject,
    } : {}),
  };
}

export function resolveDriveApiOperationalState(status: GoogleDriveApiStatus | null | undefined): 'enabled' | 'not_enabled' | 'unknown' {
  if (!status || !status.checkedAt) return 'unknown';
  return status.operational ? 'enabled' : 'not_enabled';
}

export function resolveCloudImportReady(input: {
  driveScopeGranted: boolean;
  driveApiOperational: 'enabled' | 'not_enabled' | 'unknown';
}): 'ready' | 'blocked' {
  if (!input.driveScopeGranted) return 'blocked';
  if (input.driveApiOperational === 'not_enabled') return 'blocked';
  return 'ready';
}
