import {
  generateWebhookSecret,
  isIntegrationWebhookEvent,
  normalizeWebhookEvents,
  signWebhookBody,
  verifyWebhookSignature,
} from './integration-webhooks';

describe('integration webhook signatures', () => {
  it('round-trips HMAC-SHA256 over timestamp.payload', () => {
    const secret = generateWebhookSecret();
    const timestamp = '1710000000';
    const body = JSON.stringify({ id: 'evt_1', type: 'file.trashed' });
    const sig = signWebhookBody(secret, timestamp, body);
    expect(
      verifyWebhookSignature(secret, timestamp, body, `sha256=${sig}`),
    ).toBe(true);
    expect(verifyWebhookSignature(secret, timestamp, body, sig)).toBe(true);
    expect(verifyWebhookSignature(secret, timestamp, body + 'x', sig)).toBe(
      false,
    );
    expect(verifyWebhookSignature('other', timestamp, body, sig)).toBe(false);
  });

  it('filters unknown event types', () => {
    expect(isIntegrationWebhookEvent('file.trashed')).toBe(true);
    expect(isIntegrationWebhookEvent('file.exploded')).toBe(false);
    expect(
      normalizeWebhookEvents(['file.deleted', 'nope', 'file.deleted']),
    ).toEqual(['file.deleted']);
  });
});
