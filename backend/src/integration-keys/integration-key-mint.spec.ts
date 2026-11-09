import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  parseMintChildKey,
  parseWebhookRegistration,
  scopesAreSubset,
} from './integration-key-mint';

describe('mint child integration keys', () => {
  const parent = [
    'files:read',
    'files:write',
    'folders:read',
    'folders:write',
    'keys:manage',
  ];
  const root = '00000000-0000-4000-8000-000000000001';

  it('accepts a confined child key and optional quota', () => {
    const r = parseMintChildKey(
      {
        name: ' tenant-a ',
        scopes: ['files:read', 'folders:read'],
        rootFolderId: root,
        quotaBytes: 1024,
      },
      parent,
    );
    expect(r).toMatchObject({
      name: 'tenant-a',
      scopes: ['files:read', 'folders:read'],
      rootFolderId: root,
    });
    expect(r.quotaBytes).toBe(1024n);
  });

  it('rejects keys:manage and parent-scope escalation', () => {
    expect(() =>
      parseMintChildKey(
        { name: 'x', scopes: ['keys:manage'], rootFolderId: root },
        parent,
      ),
    ).toThrow(ForbiddenException);
    expect(() =>
      parseMintChildKey(
        { name: 'x', scopes: ['files:write'], rootFolderId: root },
        ['files:read', 'keys:manage'],
      ),
    ).toThrow(ForbiddenException);
    expect(scopesAreSubset(['files:write'], ['files:read'])).toBe(false);
  });

  it('requires a root folder id', () => {
    expect(() =>
      parseMintChildKey({ name: 'x', scopes: ['files:read'] }, parent),
    ).toThrow(BadRequestException);
  });
});

describe('webhook registration payload', () => {
  it('accepts https URLs and local http', () => {
    expect(
      parseWebhookRegistration({
        url: 'https://oma.example/hook',
        events: ['file.trashed'],
      }).url,
    ).toContain('https://');
    expect(
      parseWebhookRegistration({
        url: 'http://127.0.0.1:3000/h',
        events: ['file.deleted'],
      }).url,
    ).toContain('127.0.0.1');
  });
  it('rejects non-https remote URLs', () => {
    expect(() =>
      parseWebhookRegistration({
        url: 'http://evil.example/h',
        events: ['file.trashed'],
      }),
    ).toThrow(BadRequestException);
  });
});
