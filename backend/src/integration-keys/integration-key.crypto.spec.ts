import { createHash } from 'node:crypto';
import {
  generateIntegrationKey,
  hashIntegrationKey,
  isIntegrationKeyToken,
  normalizeScopes,
  parseIntegrationKeyPrefix,
  verifyIntegrationKeyHash,
} from './integration-key.crypto';
import { parseCreateIntegrationKey } from './integration-keys.service';
import { parseEnsurePath } from '../folders/ensure-path.schema';

describe('integration key crypto', () => {
  it('generates unique wdk_ tokens whose hash is SHA-256 and not the token', () => {
    const a = generateIntegrationKey();
    const b = generateIntegrationKey();
    expect(a.token).not.toBe(b.token);
    expect(a.token).toMatch(/^wdk_[0-9a-f]{12}_[A-Za-z0-9_-]{43}$/);
    expect(a.secretHash).toBe(createHash('sha256').update(a.token).digest('hex'));
    expect(a.secretHash).not.toContain(a.token);
    expect(parseIntegrationKeyPrefix(a.token)).toBe(a.prefix);
    expect(isIntegrationKeyToken(a.token)).toBe(true);
  });

  it('verifies only the exact token', () => {
    const k = generateIntegrationKey();
    expect(verifyIntegrationKeyHash(k.token, k.secretHash)).toBe(true);
    expect(verifyIntegrationKeyHash(`${k.token}x`, k.secretHash)).toBe(false);
    expect(verifyIntegrationKeyHash(k.token, hashIntegrationKey('other'))).toBe(false);
    expect(verifyIntegrationKeyHash(k.token, 'zz')).toBe(false);
  });

  it('rejects malformed tokens and JWTs', () => {
    expect(parseIntegrationKeyPrefix('wdk_short')).toBeNull();
    expect(isIntegrationKeyToken('eyJhbGciOi')).toBe(false);
  });

  it('normalizes scopes', () => {
    expect(normalizeScopes(['files:read', 'files:read', 'bogus', 3])).toEqual(['files:read']);
    expect(normalizeScopes('files:read')).toEqual([]);
  });
});

describe('create key payload', () => {
  it('accepts a valid payload', () => {
    const r = parseCreateIntegrationKey({ name: ' OMA ', scopes: ['files:read', 'folders:write'], rootFolderId: '00000000-0000-4000-8000-000000000001' });
    expect(r).toMatchObject({ name: 'OMA', scopes: ['files:read', 'folders:write'], expiresAt: null });
  });
  it('rejects bad input', () => {
    expect(() => parseCreateIntegrationKey({ name: '', scopes: ['files:read'] })).toThrow();
    expect(() => parseCreateIntegrationKey({ name: 'x', scopes: ['root'] })).toThrow();
    expect(() => parseCreateIntegrationKey({ name: 'x', scopes: ['files:read'], rootFolderId: 'nope' })).toThrow();
    expect(() => parseCreateIntegrationKey({ name: 'x', scopes: ['files:read'], expiresAt: '2001-01-01' })).toThrow();
  });
});

describe('ensure-path payload', () => {
  it('splits and trims segments', () => {
    expect(parseEnsurePath({ path: '/OMA/ tenant /brand//posts/' }).segments).toEqual(['OMA', 'tenant', 'brand', 'posts']);
    expect(parseEnsurePath({ segments: ['a', 'b'] }).segments).toEqual(['a', 'b']);
  });
  it('rejects traversal, empty and oversized paths', () => {
    expect(() => parseEnsurePath({ path: '..' })).toThrow();
    expect(() => parseEnsurePath({ path: '' })).toThrow();
    expect(() => parseEnsurePath({ path: Array.from({ length: 21 }, (_, i) => `f${i}`).join('/') })).toThrow();
    expect(() => parseEnsurePath({ path: 'a', parentId: 'x' })).toThrow();
  });
});
