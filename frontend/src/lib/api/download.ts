/**
 * Forces a direct browser download without navigating the current page or
 * opening a new tab.
 *
 * - Same-origin links get the HTML5 `download` attribute (helps rename).
 * - Cross-origin presigned R2/S3 URLs rely on the signed
 *   `Content-Disposition: attachment` header baked into the URL at signing
 *   time — browsers always download such responses inline for the user.
 */
export function triggerDownload(url: string, fallbackName?: string): void {
  const link = document.createElement("a");
  link.href = url;
  link.rel = "noopener";
  if (fallbackName) {
    link.download = fallbackName;
  }
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/**
 * Starts one download per URL. Consecutive anchor clicks are page navigations
 * and cancel each other, so every file gets its own hidden iframe and the
 * downloads are spaced out to stay within the browser's multi-download limits.
 */
export async function triggerDownloads(resolveUrls: Array<() => Promise<string>>, spacingMs = 450): Promise<{ started: number; failed: number }> {
  let started = 0;
  let failed = 0;
  for (const resolveUrl of resolveUrls) {
    try {
      const url = await resolveUrl();
      const frame = document.createElement("iframe");
      frame.style.display = "none";
      frame.setAttribute("aria-hidden", "true");
      frame.src = url;
      document.body.appendChild(frame);
      window.setTimeout(() => frame.remove(), 120000);
      started += 1;
    } catch {
      failed += 1;
    }
    if (resolveUrls.length > 1) await new Promise((resolve) => window.setTimeout(resolve, spacingMs));
  }
  return { started, failed };
}