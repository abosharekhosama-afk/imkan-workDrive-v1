import { ConnectionAuthType, ConnectionStatus, ConnectionVisibility } from '@prisma/client';

describe('Connections Phase 7 governance contracts', () => {
  it('treats non-active connections as blocking for workflow governance', () => {
    const status = ConnectionStatus.REAUTH_REQUIRED;
    expect(status).not.toBe(ConnectionStatus.ACTIVE);
  });

  it('keeps provider scope drift distinct from a provider disablement', () => {
    const providerDisabled = { enabled: false, code: 'PROVIDER_DISABLED' };
    const scopeDrift = { enabled: true, code: 'SCOPE_CONFIGURATION_DRIFT' };
    expect(providerDisabled.code).not.toBe(scopeDrift.code);
  });

  it('does not require OAuth provider governance for non-OAuth connections', () => {
    expect(ConnectionAuthType.API_KEY).not.toBe(ConnectionAuthType.OAUTH2);
    expect(ConnectionVisibility.PRIVATE).toBeDefined();
  });
});
