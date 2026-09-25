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

export function providerBrowseErrorCode(error: unknown, provider?: string): { code: string; message: string } {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const message = raw.trim();
  const lower = message.toLowerCase();

  if (/insufficient_scope|reconnect to grant google drive/i.test(lower)) {
    return { code: 'INSUFFICIENT_SCOPE', message: 'Reconnect to grant Google Drive file access.' };
  }
  if (/401|invalid_grant|token expired|expired\. reconnect/i.test(lower)) {
    return { code: 'TOKEN_EXPIRED', message: 'Your connection expired. Reconnect to continue.' };
  }
  if (/403|access denied|forbidden|access was denied/i.test(lower)) {
    if (provider === 'google') {
      return { code: 'ACCESS_DENIED', message: 'Google Drive access was denied. Reconnect and grant file read access.' };
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
