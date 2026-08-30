import { ApiError } from "./api/client.ts";
import type { MessageKey } from "../i18n";

const PERMISSION_CODES = new Set([
  "INSUFFICIENT_PERMISSIONS",
  "PERMISSION_NOT_MET",
  "FORBIDDEN",
  "RBAC_DENIED",
  "INSUFFICIENT_PERMISSION",
]);

/** Pulls the machine-readable `code` off an API error (mirrors ApiError). */
export function errorCodeOf(cause: unknown): string | null {
  if (cause instanceof ApiError) return cause.code ?? null;
  if (cause && typeof cause === "object" && "code" in cause) {
    const value = (cause as { code?: unknown }).code;
    return typeof value === "string" && value.length > 0 ? value : null;
  }
  return null;
}

export function errorStatusOf(cause: unknown): number | undefined {
  if (cause instanceof ApiError) return cause.status;
  return undefined;
}

/**
 * Maps a thrown value to a context-aware, i18n-safe error message key.
 * 401 → "unauthenticated", 403 & rbac codes → the friendly user-grade
 * "sufficient permissions" message, anything else → generic.
 */
export function friendlyErrorMessageKey(cause: unknown): MessageKey {
  const status = errorStatusOf(cause);
  const code = errorCodeOf(cause) ?? "";
  if (status === 401 || code === "UNAUTHENTICATED") return "error.unauthenticated";
  if (
    status === 403 ||
    PERMISSION_CODES.has(code) ||
    /FORBIDDEN|PERMISSION/i.test(code)
  ) {
    return "error.permissionDenied";
  }
  return "error.generic";
}