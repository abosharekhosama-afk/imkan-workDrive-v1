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

/** Only a confirmed 401 from IMKAN /auth/me ends the browser session. */
export function shouldEndImkanSession(status: number): boolean {
  return status === 401;
}
