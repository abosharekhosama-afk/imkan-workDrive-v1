import { getAccessToken } from "../lib/api/client.ts";

export const TOKEN_STORAGE_KEY = "workdrive_access_token";
export type DevAuthStatus = "loading" | "authenticated" | "unauthenticated";

export function isDevelopment(): boolean {
  return process.env.NODE_ENV !== "production";
}

export function readDevAuthStatus(): Exclude<DevAuthStatus, "loading"> {
  try {
    return getAccessToken() ? "authenticated" : "unauthenticated";
  } catch {
    return "unauthenticated";
  }
}

export function setDevAuthToken(value: string): void {
  const token = value.trim();
  if (!token) throw new Error("TOKEN_REQUIRED");
  window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearDevAuthToken(): void {
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
}
