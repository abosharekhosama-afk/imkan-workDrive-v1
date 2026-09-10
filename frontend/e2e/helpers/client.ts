/**
 * e2e helper — resolves the API base URL for Playwright-driven auth flows.
 * Mirrors the runtime contract in `src/lib/api/client.ts` so e2e helpers can
 * hit the same backend regardless of environment.
 */
export function getApiBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  return "https://imkan-workdrive-v1.onrender.com";
}