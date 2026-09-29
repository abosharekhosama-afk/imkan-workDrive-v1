import { parseInviteEmails } from './collection-email-logic';

describe('collection email invites', () => {
  it('splits, dedupes, and rejects invalid addresses', () => {
    const parsed = parseInviteEmails('A@imkan.test, a@imkan.test; not-an-email b@imkan.test');
    expect(parsed.emails).toEqual(['a@imkan.test', 'b@imkan.test']);
    expect(parsed.invalid).toEqual(['not-an-email']);
  });

  it('stops accepting addresses after the limit', () => {
    const parsed = parseInviteEmails(['one@imkan.test', 'two@imkan.test', 'three@imkan.test'], 2);
    expect(parsed.emails).toEqual(['one@imkan.test', 'two@imkan.test']);
    expect(parsed.invalid).toEqual(['three@imkan.test']);
  });
});
