export const SESSION_EXPIRED_QUERY = "expired=true";

function isAuthPath(pathname: string): boolean {
  return pathname.startsWith("/auth");
}

/** Clears every cached session artifact before bouncing to the login screen. */
export function clearSessionStorage(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem("workdrive_access_token");
    window.localStorage.removeItem("access_token");
    window.localStorage.removeItem("token");
    window.localStorage.removeItem("workdrive_user");
  } catch {
    // Storage may be unavailable (private mode); the redirect still proceeds.
  }
}

/**
 * Central 401 handling so an expired session can never strand the user on a
 * dead page. Server-side renders use the Next.js redirect mechanism, while
 * client-side callers get a hard navigation that also wipes stale tokens.
 */
export async function redirectToLoginOnExpiredSession(): Promise<never> {
  if (typeof window === "undefined") {
    const { redirect } = await import("next/navigation");
    redirect(`/auth/login?${SESSION_EXPIRED_QUERY}`);
  }
  clearSessionStorage();
  window.location.assign(`/auth/login?${SESSION_EXPIRED_QUERY}`);
  // Keep the async contract; navigation aborts the current render anyway.
  return new Promise<never>(() => {});
}

export class ApiError extends Error {
  status: number;
  /** Machine-readable error code carried by structured API responses (e.g. MEMBER_ALREADY_EXISTS). */
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** True when the thrown value is a 401 ApiError raised by the API client. */
export function isUnauthorizedError(cause: unknown): cause is ApiError {
  return cause instanceof ApiError && cause.status === 401;
}

export function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
}

export async function getAccessToken(): Promise<string | null> {
  // 1. إذا كان الكود يعمل في المتصفح (Client-side)
  if (typeof window !== "undefined") {
    // قراءة التوكن من localstorage أو من document.cookie
    const localToken =
      window.localStorage.getItem("workdrive_access_token") ||
      window.localStorage.getItem("access_token") ||
      window.localStorage.getItem("token");

    if (localToken) return localToken;

    const match = document.cookie.match(new RegExp("(^| )workdrive_access_token=([^;]+)"));
    return match ? decodeURIComponent(match[2]) : null;
  }

  // 2. إذا كان الكود يعمل على السيرفر (Server-side / SSR)
  // استدعاء الموديول ديناميكياً فقط على السيرفر لتجنب خطأ الـ Build في الـ Client
  try {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const tokenCookie = cookieStore.get("workdrive_access_token")?.value;
    return tokenCookie ?? process.env.NEXT_PUBLIC_DEV_JWT ?? null;
  } catch {
    return process.env.NEXT_PUBLIC_DEV_JWT ?? null;
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();

  if (!token) {
    if (typeof window !== "undefined" && !isAuthPath(window.location.pathname)) {
      await redirectToLoginOnExpiredSession();
    }
    throw new ApiError(401, "UNAUTHENTICATED");
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const rawBody = await response.text();
    let message = rawBody;
    let code: string | undefined;
    try {
      const parsed = JSON.parse(rawBody) as { message?: unknown; code?: unknown };
      if (typeof parsed.message === "string") {
        message = parsed.message;
      } else if (Array.isArray(parsed.message)) {
        message = parsed.message
          .filter((item): item is string => typeof item === "string")
          .join(", ");
      }
      if (typeof parsed.code === "string" && parsed.code.length > 0) {
        code = parsed.code;
      }
    } catch {
      // Body was plain text (or empty); fall back to the raw text.
    }
    // An expired/invalid token is a session problem, not a page problem:
    // bounce the user to the login screen from either rendering environment.
    if (response.status === 401 && !isAuthPath(typeof window !== "undefined" ? window.location.pathname : "")) {
      await redirectToLoginOnExpiredSession();
    }
    throw new ApiError(response.status, message || "Request failed", code);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}