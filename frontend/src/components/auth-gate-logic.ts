export const IMKAN_ACCESS_TOKEN_KEY = "workdrive_access_token";

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
  return (
    storage.getItem(IMKAN_ACCESS_TOKEN_KEY) ||
    storage.getItem("access_token") ||
    storage.getItem("token") ||
    readCookieAccessToken(cookie)
  );
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
