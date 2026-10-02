import assert from 'node:assert/strict';

export function expect<T>(actual: T) {
  return {
    toBe(expected: unknown) { assert.strictEqual(actual, expected); },
    toContain(expected: unknown) {
      assert.ok((actual as any)?.includes?.(expected), `Expected value to contain ${String(expected)}`);
    },
    toHaveLength(expected: number) { assert.strictEqual((actual as any)?.length, expected); },
  };
}
