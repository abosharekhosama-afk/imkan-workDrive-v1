export function parseJwt(token: string): { sub: string; org_id: string; email: string; role: string } | null {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

export function getCurrentUserId(): string | null {
  if (typeof window === "undefined") return null;
  const token = window.localStorage.getItem("workdrive_access_token");
  if (!token) return null;
  const payload = parseJwt(token);
  return payload?.sub ?? null;
}
export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('workdrive_access_token');
}
