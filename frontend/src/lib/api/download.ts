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