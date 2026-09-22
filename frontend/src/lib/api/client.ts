export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    if (code) this.code = code;
  }
}

/**
 * Resolve the public backend origin used by the browser.
 *
 * NEXT_PUBLIC_API_URL is the preferred production variable. The older
 * NEXT_PUBLIC_API_BASE_URL remains supported for compatibility.
 * A same-origin Vercel URL is never a valid backend URL for this app's
 * split frontend/backend deployment, so it is rejected instead of silently
 * sending API POSTs such as /auth/signup to the Next.js frontend.
 */
export function getApiBaseUrl(): string {
  const preferred = process.env.NEXT_PUBLIC_API_URL?.trim();
  const legacy = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  const configured = preferred || legacy;

  if (!configured) {
    if (typeof window === "undefined") return "http://localhost:3001";
    throw new Error(
      "Backend API URL is not configured. Set NEXT_PUBLIC_API_URL in the Vercel project settings."
    );
  }

  const normalized = configured.replace(/\/+$/, "");

  if (typeof window !== "undefined") {
    try {
      const configuredUrl = new URL(normalized, window.location.origin);
      const currentOrigin = window.location.origin.replace(/\/+$/, "");

      if (configuredUrl.origin === currentOrigin) {
        throw new Error(
          "Backend API URL points to the frontend origin. Set NEXT_PUBLIC_API_URL to the deployed NestJS/Render backend URL."
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Backend API URL points")) {
        throw error;
      }
      // Preserve the configured value so fetch can report an actionable URL error.
    }
  }

  return normalized;
}

export async function getAccessToken(): Promise<string | null> {
  // 1. إذا كان الكود يعمل في المتصفح (Client-side)
  if (typeof window !== "undefined") {
    const localToken =
      window.localStorage.getItem("workdrive_access_token") ||
      window.localStorage.getItem("access_token") ||
      window.localStorage.getItem("token");

    if (localToken) return localToken;

    const match = document.cookie.match(new RegExp("(^| )workdrive_access_token=([^;]+)"));
    return match ? decodeURIComponent(match[2]) : null;
  }

  // 2. إذا كان الكود يعمل على السيرفر (Server-side / SSR)
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
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/auth")) {
      window.location.href = "/auth/login";
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
      if (typeof parsed.message === "string" && parsed.message.length > 0) message = parsed.message;
      if (typeof parsed.code === "string" && parsed.code.length > 0) code = parsed.code;
    } catch {
      // Preserve the original plain-text response body.
    }
    throw new ApiError(response.status, message, code);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  // API calls must never silently consume an HTML Next.js page. When a
  // deployment accidentally points NEXT_PUBLIC_API_URL at the frontend
  // origin, fetch can return HTTP 200 with an HTML error/document. Treat that
  // as an API configuration failure instead of letting JSON.parse throw and
  // taking down the current page.
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json") && !contentType.includes("application/problem+json")) {
    throw new ApiError(502, "WORKFLOW_API_INVALID_RESPONSE");
  }

  return (await response.json()) as T;
}

export function isUnauthorizedError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

export function redirectToLoginOnExpiredSession(error: unknown): boolean {
  if (!isUnauthorizedError(error)) return false;
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/auth")) {
    window.location.href = "/auth/login";
  }
  return true;
}
