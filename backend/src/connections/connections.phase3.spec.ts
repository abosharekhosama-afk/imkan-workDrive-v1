import { ConnectionType } from '@prisma/client';

describe('Connections Phase 3 identity contract', () => {
  it('supports user, system and admin connection types', () => {
    expect(ConnectionType.USER).toBe('USER');
    expect(ConnectionType.SYSTEM).toBe('SYSTEM');
    expect(ConnectionType.ADMIN).toBe('ADMIN');
  });

  it('uses stable link-name normalization rules', () => {
    const normalize = (seed: string) => seed.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'connection';
    expect(normalize('Google Drive / Main')).toBe('google_drive_main');
    expect(normalize('  Slack  ')).toBe('slack');
    expect(normalize('')).toBe('connection');
  });
});
