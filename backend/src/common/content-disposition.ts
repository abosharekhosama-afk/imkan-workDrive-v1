/**
 * RFC 6266 / RFC 5987 compliant Content-Disposition builders.
 *
 * Browsers ignore UTF-8 characters in the legacy `filename` parameter, so a
 * sanitized ASCII fallback is always paired with the RFC 5987
 * `filename*UTF-8''…` form which carries the original (possibly Arabic)
 * file name.
 */
function sanitizeAscii(fileName: string): string {
  return fileName
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/["\\;]/g, '_')
    .trim();
}

export function contentDisposition(type: 'inline' | 'attachment', fileName: string): string {
  const ascii = sanitizeAscii(fileName) || 'download';
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export function contentDispositionInline(fileName: string): string {
  return contentDisposition('inline', fileName);
}

export function contentDispositionAttachment(fileName: string): string {
  return contentDisposition('attachment', fileName);
}