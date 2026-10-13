import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Lightweight in-memory sliding-window rate limiter (no external deps).
 * Suitable for single-instance deployments. For multi-instance use Redis.
 *
 * Keys are derived from client IP + optional path prefix.
 */
type Bucket = { timestamps: number[] };

export type RateLimitRule = {
  /** Unique name for metrics / headers */
  name: string;
  /** Max requests inside the window */
  limit: number;
  /** Window length in milliseconds */
  windowMs: number;
  /** Match request path (prefix or exact). If omitted, applies to all. */
  pathPrefix?: string;
  /** Only apply to these methods (uppercase). If omitted, all methods. */
  methods?: string[];
};

const DEFAULT_RULES: RateLimitRule[] = [
  // Global soft limit per IP
  { name: 'global', limit: 300, windowMs: 60_000 },
  // Auth endpoints — stricter to mitigate credential stuffing / OTP brute force
  { name: 'auth', limit: 20, windowMs: 60_000, pathPrefix: '/auth/' },
  { name: 'auth-login', limit: 10, windowMs: 60_000, pathPrefix: '/auth/login', methods: ['POST'] },
  { name: 'auth-signup', limit: 8, windowMs: 60_000, pathPrefix: '/auth/signup', methods: ['POST'] },
  { name: 'auth-otp', limit: 10, windowMs: 60_000, pathPrefix: '/auth/otp', methods: ['POST'] },
  { name: 'auth-refresh', limit: 30, windowMs: 60_000, pathPrefix: '/auth/refresh', methods: ['POST'] },
  // Bulk / expensive operations
  { name: 'bulk-download', limit: 10, windowMs: 60_000, pathPrefix: '/files/bulk/download', methods: ['POST'] },
  { name: 'upload', limit: 60, windowMs: 60_000, pathPrefix: '/files/upload', methods: ['POST'] },
];

export function createRateLimitMiddleware(rules: RateLimitRule[] = DEFAULT_RULES) {
  const store = new Map<string, Bucket>();
  const MAX_KEYS = 50_000;

  function clientIp(req: IncomingMessage): string {
    const xf = req.headers['x-forwarded-for'];
    if (typeof xf === 'string' && xf.length > 0) {
      return xf.split(',')[0]!.trim().slice(0, 64);
    }
    if (Array.isArray(xf) && xf[0]) return String(xf[0]).slice(0, 64);
    return (req.socket?.remoteAddress || 'unknown').slice(0, 64);
  }

  function prune(bucket: Bucket, windowMs: number, now: number) {
    const cutoff = now - windowMs;
    while (bucket.timestamps.length && bucket.timestamps[0]! < cutoff) {
      bucket.timestamps.shift();
    }
  }

  // Periodic cleanup to avoid unbounded memory growth
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of store) {
      prune(bucket, 120_000, now);
      if (bucket.timestamps.length === 0) store.delete(key);
    }
    if (store.size > MAX_KEYS) {
      // Drop oldest half of keys (Map iteration order is insertion order)
      let drop = store.size - Math.floor(MAX_KEYS / 2);
      for (const key of store.keys()) {
        if (drop-- <= 0) break;
        store.delete(key);
      }
    }
  }, 60_000);
  // Don't keep the process alive solely for this timer (Node workers / tests)
  if (typeof cleanupTimer.unref === 'function') cleanupTimer.unref();

  return function rateLimitMiddleware(
    req: IncomingMessage & { url?: string; method?: string },
    res: ServerResponse,
    next: (err?: unknown) => void,
  ) {
    const now = Date.now();
    const ip = clientIp(req);
    const path = (req.url || '/').split('?')[0] || '/';
    const method = (req.method || 'GET').toUpperCase();

    for (const rule of rules) {
      if (rule.pathPrefix && !path.startsWith(rule.pathPrefix) && path !== rule.pathPrefix.replace(/\/$/, '')) {
        continue;
      }
      if (rule.methods && !rule.methods.includes(method)) continue;

      const key = `${rule.name}:${ip}`;
      let bucket = store.get(key);
      if (!bucket) {
        bucket = { timestamps: [] };
        store.set(key, bucket);
      }
      prune(bucket, rule.windowMs, now);

      if (bucket.timestamps.length >= rule.limit) {
        const retryAfterSec = Math.max(
          1,
          Math.ceil((bucket.timestamps[0]! + rule.windowMs - now) / 1000),
        );
        res.statusCode = 429;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Retry-After', String(retryAfterSec));
        res.setHeader('X-RateLimit-Limit', String(rule.limit));
        res.setHeader('X-RateLimit-Remaining', '0');
        res.setHeader('X-RateLimit-Policy', rule.name);
        res.end(
          JSON.stringify({
            statusCode: 429,
            message: 'Too many requests. Please try again later.',
            error: 'Too Many Requests',
            retryAfterSeconds: retryAfterSec,
          }),
        );
        return;
      }

      bucket.timestamps.push(now);
      const remaining = Math.max(0, rule.limit - bucket.timestamps.length);
      res.setHeader('X-RateLimit-Limit', String(rule.limit));
      res.setHeader('X-RateLimit-Remaining', String(remaining));
    }

    next();
  };
}
