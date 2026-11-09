import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  CHILD_KEY_SCOPES,
  normalizeScopes,
  type IntegrationKeyScope,
} from './integration-key.crypto';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type MintChildKeyInput = {
  name: string;
  scopes: IntegrationKeyScope[];
  rootFolderId: string;
  quotaBytes: bigint | null;
  expiresAt: Date | null;
};

export function scopesAreSubset(requested: string[], allowed: string[]) {
  const set = new Set(allowed);
  return requested.every((s) => set.has(s));
}

export function parseMintChildKey(
  body: unknown,
  parentScopes: string[],
  now = new Date(),
): MintChildKeyInput {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new BadRequestException('Invalid payload');
  const r = body as Record<string, unknown>;
  const name = typeof r.name === 'string' ? r.name.trim() : '';
  if (name.length < 1 || name.length > 120)
    throw new BadRequestException('Name must be between 1 and 120 characters');
  if (!Array.isArray(r.scopes) || r.scopes.some((s) => typeof s !== 'string')) {
    throw new BadRequestException(
      `scopes must be a subset of ${CHILD_KEY_SCOPES.join(', ')}`,
    );
  }
  if (r.scopes.includes('keys:manage')) {
    throw new ForbiddenException(
      'Child keys cannot receive the keys:manage scope',
    );
  }
  if (
    r.scopes.some(
      (s) => !(CHILD_KEY_SCOPES as readonly string[]).includes(s as string),
    )
  ) {
    throw new BadRequestException(
      `scopes must be a subset of ${CHILD_KEY_SCOPES.join(', ')}`,
    );
  }
  const scopes = normalizeScopes(r.scopes).filter((s) =>
    (CHILD_KEY_SCOPES as readonly string[]).includes(s),
  );
  if (scopes.length === 0)
    throw new BadRequestException('At least one scope is required');
  if (!scopesAreSubset(scopes, parentScopes)) {
    throw new ForbiddenException(
      'Child key scopes cannot exceed the parent key scopes',
    );
  }
  const rawRoot = r.rootFolderId ?? r.root_folder_id ?? null;
  if (typeof rawRoot !== 'string' || !UUID_RE.test(rawRoot))
    throw new BadRequestException(
      'rootFolderId is required and must be a folder id',
    );
  const rawQuota = r.quotaBytes ?? r.quota_bytes ?? null;
  let quotaBytes: bigint | null = null;
  if (rawQuota !== null && rawQuota !== '') {
    if (
      typeof rawQuota !== 'bigint' &&
      typeof rawQuota !== 'number' &&
      typeof rawQuota !== 'string'
    ) {
      throw new BadRequestException('quotaBytes must be a positive integer');
    }
    const n = typeof rawQuota === 'bigint' ? rawQuota : BigInt(rawQuota);
    if (n <= 0n)
      throw new BadRequestException('quotaBytes must be a positive integer');
    quotaBytes = n;
  }
  const rawExpires = r.expiresAt ?? r.expires_at ?? null;
  let expiresAt: Date | null = null;
  if (rawExpires !== null && rawExpires !== '') {
    if (
      typeof rawExpires !== 'string' &&
      typeof rawExpires !== 'number' &&
      !(rawExpires instanceof Date)
    ) {
      throw new BadRequestException('expiresAt must be a future date');
    }
    expiresAt = new Date(rawExpires);
    if (
      Number.isNaN(expiresAt.getTime()) ||
      expiresAt.getTime() <= now.getTime()
    )
      throw new BadRequestException('expiresAt must be a future date');
  }
  return { name, scopes, rootFolderId: rawRoot, quotaBytes, expiresAt };
}

export function parseWebhookRegistration(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new BadRequestException('Invalid payload');
  const r = body as Record<string, unknown>;
  const url = typeof r.url === 'string' ? r.url.trim() : '';
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new BadRequestException('A valid https webhook URL is required');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) {
    throw new BadRequestException('Webhook URL must use https');
  }
  if (!Array.isArray(r.events) || r.events.some((e) => typeof e !== 'string')) {
    throw new BadRequestException('events must be an array of event names');
  }
  const secret =
    typeof r.secret === 'string' && r.secret.trim() ? r.secret.trim() : null;
  return { url: parsed.toString(), events: r.events as string[], secret };
}
