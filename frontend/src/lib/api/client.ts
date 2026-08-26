export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
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
    throw new ApiError(response.status, await response.text());
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}