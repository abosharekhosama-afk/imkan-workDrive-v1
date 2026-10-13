import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Baseline HTTP security headers (helmet-like, zero dependency).
 * Applied to every response.
 */
export function securityHeadersMiddleware(
  _req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void,
) {
  // Prevent MIME sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  // Legacy XSS filter (still useful for older browsers)
  res.setHeader('X-XSS-Protection', '0'); // modern best practice: disable broken filter
  // Referrer leakage
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Restrict powerful browser features
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  );
  // HSTS only when explicitly enabled (TLS terminator in production)
  if (process.env.ENABLE_HSTS === '1' || process.env.ENABLE_HSTS === 'true') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  // API responses should not be cached by shared caches by default
  if (!res.getHeader('Cache-Control')) {
    res.setHeader('Cache-Control', 'no-store');
  }

  next();
}
