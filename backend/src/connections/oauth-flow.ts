export const PRODUCTION_FRONTEND_ORIGIN = 'https://imkan-work-drive-v1.vercel.app';

export function resolveOAuthFrontendOrigin(
  configured: string | undefined | null,
  apiUrl: string | undefined | null,
  nodeEnv: string | undefined,
): string {
  const fallback = nodeEnv === 'production' ? PRODUCTION_FRONTEND_ORIGIN : 'http://localhost:3000';
  const trimmed = configured?.trim();
  let value = trimmed || fallback;
  try {
    if (trimmed && apiUrl?.trim() && new URL(trimmed).origin === new URL(apiUrl.trim()).origin) {
      value = fallback;
    }
  } catch {
    value = fallback;
  }
  return value.replace(/\/$/, '');
}

export function buildOAuthBrowserUrl(frontend: string, pathAndQuery: string): string {
  const base = frontend.replace(/\/$/, '');
  const path = pathAndQuery.startsWith('/') ? pathAndQuery : `/${pathAndQuery}`;
  try {
    const url = new URL(path, `${base}/`);
    if (url.origin !== new URL(base).origin) return `${base}/files/connections`;
    return url.toString();
  } catch {
    return `${base}/files/connections`;
  }
}

export function oauthFailurePreservesActive(status: string | null | undefined): boolean {
  return status === 'ACTIVE';
}

export type ProbeTarget = { url: string; method: 'GET' | 'POST' };

/**
 * Identity probes that match the scopes actually granted.
 * Google's Drive about endpoint is only a fallback: a successful OpenID
 * token is rejected there when the Drive API or a Drive scope is absent.
 */
export function probeTargets(provider: string, configuredProbeUrl?: string | null): ProbeTarget[] {
  const urls: ProbeTarget[] = [];
  const add = (url: string | null | undefined, method: 'GET' | 'POST' = 'GET') => {
    const value = url?.trim();
    if (!value || urls.some((item) => item.url === value && item.method === method)) return;
    urls.push({ url: value, method });
  };
  if (provider === 'google') add('https://openidconnect.googleapis.com/v1/userinfo');
  if (provider === 'github') add('https://api.github.com/user');
  const dropboxAccount = provider === 'dropbox' && (configuredProbeUrl ?? '').includes('get_current_account');
  add(configuredProbeUrl, dropboxAccount ? 'POST' : 'GET');
  return urls;
}

export function safeOrigin(value: string): string {
  try { return new URL(value).origin; } catch { return 'invalid-origin'; }
}

export function safeOAuthErrorCode(message: string): string {
  const http = message.match(/HTTP (\d{3})/);
  if (/redirect_uri/i.test(message)) return 'redirect_uri_mismatch';
  if (/invalid_grant/i.test(message)) return 'invalid_grant';
  if (/invalid_client/i.test(message)) return 'invalid_client';
  if (http) return `HTTP_${http[1]}`;
  if (/state is invalid/i.test(message)) return 'state_invalid';
  return 'oauth_error';
}
