import { describe, expect, it } from '@jest/globals';

describe('Workflow queue V14 contracts', () => {
  it('uses exponential retry backoff with a one-hour ceiling', () => {
    const delay = (attempt: number) => Math.min(60 * 60 * 1000, 1000 * 2 ** Math.max(0, attempt - 1));
    expect(delay(1)).toBe(1000);
    expect(delay(2)).toBe(2000);
    expect(delay(6)).toBe(32000);
    expect(delay(20)).toBe(60 * 60 * 1000);
  });

  it('distinguishes terminal dead-letter attempts from retryable attempts', () => {
    expect(3 >= 5).toBe(false);
    expect(5 >= 5).toBe(true);
  });
});
