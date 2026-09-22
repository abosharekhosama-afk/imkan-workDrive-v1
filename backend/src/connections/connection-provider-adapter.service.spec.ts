import { ConnectionProviderAdapterService } from './connection-provider-adapter.service';

describe('ConnectionProviderAdapterService', () => {
  const adapter = new ConnectionProviderAdapterService();

  it('extracts Google authorized account details', async () => {
    const originalFetch = global.fetch;
    global.fetch = (async () => new Response(JSON.stringify({ user: { emailAddress: 'osama@example.com', displayName: 'Osama', sub: 'g-123' } }), { status: 200 })) as any;
    try {
      const account = await adapter.probe({ key: 'google', name: 'Google', category: 'Cloud', authTypes: ['OAUTH2'], oauth: true, capabilities: ['oauth', 'probe'], scopes: [], defaultScopes: [], probeUrl: 'https://example.test/user' }, 'google', 'token');
      expect(account).toEqual({ id: 'g-123', email: 'osama@example.com', name: 'Osama', username: 'osama@example.com' });
    } finally { global.fetch = originalFetch; }
  });

  it('rejects providers that return HTTP 200 with ok=false', async () => {
    const originalFetch = global.fetch;
    global.fetch = (async () => new Response(JSON.stringify({ ok: false, error: 'invalid_auth' }), { status: 200 })) as any;
    try {
      await expect(adapter.probe({ key: 'slack', name: 'Slack', category: 'Collaboration', authTypes: ['OAUTH2'], oauth: true, capabilities: ['oauth', 'probe'], scopes: [], defaultScopes: [], probeUrl: 'https://example.test/auth.test' }, 'slack', 'bad-token')).rejects.toThrow('invalid_auth');
    } finally { global.fetch = originalFetch; }
  });
});
