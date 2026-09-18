import { ConnectionProviderRegistry } from './provider-registry.service';

describe('ConnectionProviderRegistry', () => {
  it('exposes registered providers and capabilities', () => {
    const r = new ConnectionProviderRegistry();
    expect(r.get('rest').capabilities).toContain('request');
    expect(r.supports('google', 'OAUTH2')).toBe(true);
    expect(r.supports('google', 'API_KEY')).toBe(false);
  });
});
