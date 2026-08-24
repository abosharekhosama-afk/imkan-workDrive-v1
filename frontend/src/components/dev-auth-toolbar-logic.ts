import { getAccessToken } from "../lib/api/client";

export const TOKEN_STORAGE_KEY = "workdrive_access_token";
export type DevAuthStatus = "loading" | "authenticated" | "unauthenticated";

export function isDevelopment(): boolean {
  return process.env.NODE_ENV !== "production";
}

export async function readDevAuthStatus(): Promise<Exclude<DevAuthStatus, "loading">> {
  try {
    const token = await getAccessToken();
    return token ? "authenticated" : "unauthenticated";
  } catch {
    return "unauthenticated";
  }
}

export function setDevAuthToken(value: string): void {
  const token = value.trim();
  if (!token) throw new Error("TOKEN_REQUIRED");
  if (typeof window !== "undefined") {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    const isSecure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${TOKEN_STORAGE_KEY}=${token}; path=/; max-age=28800; SameSite=Lax${isSecure}`;
  }
}

export function clearDevAuthToken(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    document.cookie = `${TOKEN_STORAGE_KEY}=; path=/; max-age=0; SameSite=Lax;`;
  }
}