import { ConnectionsService } from './connections.service';
import { ConnectionProviderRegistry } from './provider-registry.service';

describe('ConnectionsService Phase 6 security/version helpers', () => {
  const service = new ConnectionsService({} as any, {} as any, {} as any, new ConnectionProviderRegistry(), {} as any) as any;

  it('creates a complete encrypted snapshot when rotating only one field', () => {
    const existing = { apiKey: 'old-key', bearerToken: 'old-bearer', username: null };
    const snapshot = service.mergeSecretSnapshot(existing, { apiKey: 'new-key' });
    expect(snapshot).toEqual({ apiKey: 'new-key', bearerToken: 'old-bearer' });
  });

  it('blocks private IPv4 and IPv6 targets', () => {
    expect(service.isPrivateFunctionIp('10.0.0.8')).toBe(true);
    expect(service.isPrivateFunctionIp('192.168.1.4')).toBe(true);
    expect(service.isPrivateFunctionIp('172.16.10.2')).toBe(true);
    expect(service.isPrivateFunctionIp('::1')).toBe(true);
    expect(service.isPrivateFunctionIp('fd00::1')).toBe(true);
    expect(service.isPrivateFunctionIp('::ffff:192.168.1.10')).toBe(true);
    expect(service.isPrivateFunctionIp('100.64.1.1')).toBe(true);
    expect(service.isPrivateFunctionIp('198.18.0.1')).toBe(true);
    expect(service.isPrivateFunctionIp('2001:db8::1')).toBe(true);
  });

  it('rejects invalid credential fields and OAuth manual secret writes', () => {
    expect(() => service.validateSecretInput('OAUTH2', { accessToken: 'x' })).toThrow();
    expect(() => service.validateSecretInput('API_KEY', { bearerToken: 'x' })).toThrow();
    expect(() => service.validateSecretInput('CUSTOM_HEADER', { customHeaders: '{\"Authorization\":\"x\"}' })).toThrow();
  });

  it('allows a public IPv4 target', () => {
    expect(service.isPrivateFunctionIp('8.8.8.8')).toBe(false);
  });
});
