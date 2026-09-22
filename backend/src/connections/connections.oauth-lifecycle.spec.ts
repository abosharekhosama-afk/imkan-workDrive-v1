import { ConnectionsService } from './connections.service';
import { ConnectionProviderRegistry } from './provider-registry.service';
import { ConnectionAuthType } from '@prisma/client';

describe('ConnectionsService OAuth lifecycle phase 1', () => {
  const service = new ConnectionsService({} as any, {} as any, {} as any, new ConnectionProviderRegistry(), {} as any) as any;

  it('defaults OAuth return paths to the connections page', () => {
    expect(service.normalizeOAuthReturnPath(undefined)).toBe('/files/connections');
    expect(service.normalizeOAuthReturnPath('')).toBe('/files/connections');
  });

  it('accepts internal return paths with query strings', () => {
    expect(service.normalizeOAuthReturnPath('/files/workflows/builder?id=123')).toBe('/files/workflows/builder?id=123');
  });

  it('rejects external and protocol-relative return paths', () => {
    expect(service.normalizeOAuthReturnPath('https://evil.example')).toBe('/files/connections');
    expect(service.normalizeOAuthReturnPath('//evil.example/path')).toBe('/files/connections');
  });

  it('rejects OAuth secrets from direct create/update input', () => {
    expect(() => service.validateSecretInput(ConnectionAuthType.OAUTH2, { accessToken: 'token' })).toThrow();
  });
});
