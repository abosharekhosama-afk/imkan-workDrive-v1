import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Public token prefix for inbound integration keys. */
export const INTEGRATION_KEY_TOKEN_PREFIX = 'wdk_';

export const INTEGRATION_KEY_SCOPES = ['files:read', 'files:write', 'folders:read', 'folders:write'] as const;
export type IntegrationKeyScope = (typeof INTEGRATION_KEY_SCOPES)[number];

export type GeneratedIntegrationKey = {
  /** Full token, shown to the admin exactly once: `wdk_<lookup>_<secret>`. */
  token: string;
  /** Non-secret lookup id stored in clear and shown in the UI: `wdk_<lookup>`. */
  prefix: string;
  /** SHA-256 hex digest of the full token. */
  secretHash: string;
};

export function hashIntegrationKey(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function generateIntegrationKey(): GeneratedIntegrationKey {
  const lookup = randomBytes(6).toString('hex');
  const secret = randomBytes(32).toString('base64url');
  const prefix = `${INTEGRATION_KEY_TOKEN_PREFIX}${lookup}`;
  const token = `${prefix}_${secret}`;
  return { token, prefix, secretHash: hashIntegrationKey(token) };
}

export function isIntegrationKeyToken(token: string | undefined | null): token is string {
  return typeof token === 'string' && token.startsWith(INTEGRATION_KEY_TOKEN_PREFIX);
}

/** Returns the lookup prefix (`wdk_<12 hex>`) or null when the token is malformed. */
export function parseIntegrationKeyPrefix(token: string): string | null {
  const match = /^(wdk_[0-9a-f]{12})_[A-Za-z0-9_-]{43}$/.exec(token);
  return match ? match[1] : null;
}

export function verifyIntegrationKeyHash(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashIntegrationKey(token), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function normalizeScopes(value: unknown): IntegrationKeyScope[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(INTEGRATION_KEY_SCOPES);
  return [...new Set(value.filter((v): v is IntegrationKeyScope => typeof v === 'string' && allowed.has(v)))];
}
