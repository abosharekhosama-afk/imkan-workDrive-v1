export const IMKAN_ACCESS_TOKEN_KEY = "workdrive_access_token";

const OAUTH_TOKEN_BACKUP_KEY = "workdrive_oauth_token_backup";

export const OAUTH_RESUME_HASH_KEY = "imkan_resume";

export type AuthGatePhase = "loading" | "authenticated" | "unauthenticated";

export function readOAuthResumeToken(hash: string): string | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  if (params.get("imkan_session")) return null;
  const token = params.get(OAUTH_RESUME_HASH_KEY);
  return token && token.length > 20 ? token : null;
}

export function authGatePhase(input: { exchanging: boolean; hasToken: boolean; meStatus: number | null }): AuthGatePhase {
  if (input.exchanging) return "loading";
  if (!input.hasToken) return "unauthenticated";
  if (input.meStatus === null) return "loading";
  if (input.meStatus === 401) return "unauthenticated";
  return "authenticated";
}

export function shouldRedirectToLogin(phase: AuthGatePhase): boolean {
  return phase === "unauthenticated";
}

export function stashBrowserAccessTokenForOAuth(token: string | null): void {
  if (typeof window === "undefined" || !token) return;
  try { sessionStorage.setItem(OAUTH_TOKEN_BACKUP_KEY, token); } catch { /* storage may be unavailable */ }
}

export function restoreBrowserAccessTokenAfterOAuth(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const token = sessionStorage.getItem(OAUTH_TOKEN_BACKUP_KEY);
    if (!token) return null;
    persistBrowserAccessToken(token);
    sessionStorage.removeItem(OAUTH_TOKEN_BACKUP_KEY);
    return token;
  } catch { return null; }
}

export function readCookieAccessToken(cookie: string): string | null {
  const match = cookie.match(/(?:^| )workdrive_access_token=([^;]+)/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function readBrowserAccessToken(storage: Pick<Storage, "getItem">, cookie: string): string | null {
  const primary = storage.getItem(IMKAN_ACCESS_TOKEN_KEY);
  if (primary) return primary;
  const cookieToken = readCookieAccessToken(cookie);
  if (cookieToken) return cookieToken;
  return storage.getItem("access_token") || storage.getItem("token");
}

export function persistBrowserAccessToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(IMKAN_ACCESS_TOKEN_KEY, token);
  localStorage.removeItem("access_token");
  localStorage.removeItem("token");
  const isSecure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `workdrive_access_token=${encodeURIComponent(token)}; path=/; max-age=28800; SameSite=Lax${isSecure}`;
}

const TRANSIENT_AUTH_STATUSES = new Set([0, 502, 503, 504]);

export function shouldRetryAuthCheck(status: number, attempt: number, maxAttempts = 4): boolean {
  return attempt < maxAttempts - 1 && TRANSIENT_AUTH_STATUSES.has(status);
}

export function authCheckRetryDelayMs(attempt: number): number {
  return 400 * 2 ** attempt;
}

export function shouldEndImkanSession(status: number): boolean {
  return status === 401;
}

export function buildAuthLoginNextPath(pathname: string, search: string): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (!search) return path;
  return search.startsWith("?") ? `${path}${search}` : `${path}?${search}`;
}

export type AuthGateDiagnostic = {
  stage: string;
  hasAccessToken: boolean;
  hasCookie: boolean;
  authMeStatus?: number;
  redirectTarget?: string;
  oauthResult?: string | null;
  provider?: string | null;
  connectionId?: string | null;
};

export function buildAuthGateDiagnostic(detail: AuthGateDiagnostic): AuthGateDiagnostic {
  return detail;
}
