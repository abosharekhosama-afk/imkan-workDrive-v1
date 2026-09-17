/**
 * Normalize URLs returned by the backend so user-facing links always point to
 * the public frontend, never a local development host.
 */
export function normalizePublicAppUrl(value: string | null | undefined): string {
  const fallback = typeof window !== "undefined" ? window.location.origin : "";
  if (!value) return fallback;

  try {
    const url = new URL(value, fallback || "http://localhost");
    const isLocalHost =
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "::1";

    if (isLocalHost && fallback) {
      return `${fallback}${url.pathname}${url.search}${url.hash}`;
    }
    return url.toString();
  } catch {
    return value;
  }
}
