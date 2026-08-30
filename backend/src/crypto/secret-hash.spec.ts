import { hashSecret, verifySecret } from './secret-hash';

describe('secret-hash', () => {
  it('verifies a matching secret and rejects a wrong one', async () => {
    const stored = await hashSecret('correct-horse');
    expect(stored.includes('correct-horse')).toBe(false);
    await expect(verifySecret('correct-horse', stored)).resolves.toBe(true);
    await expect(verifySecret('wrong-password', stored)).resolves.toBe(false);
  });
});
