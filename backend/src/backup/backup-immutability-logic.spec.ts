import { canApprovePurge, canAutoPurge, isRunImmutable } from './backup-immutability-logic';

describe('isRunImmutable', () => {
  it('locks indefinite when locked and no until', () => {
    expect(isRunImmutable({ locked: true, immutableUntil: null })).toBe(true);
  });
  it('unlocks after until', () => {
    expect(
      isRunImmutable({
        locked: true,
        immutableUntil: new Date('2020-01-01'),
        now: new Date('2026-01-01'),
      }),
    ).toBe(false);
  });
  it('not immutable when unlocked', () => {
    expect(isRunImmutable({ locked: false, immutableUntil: null })).toBe(false);
  });
});

describe('canAutoPurge', () => {
  it('never auto-purges locked runs', () => {
    expect(
      canAutoPurge({
        locked: true,
        immutableUntil: null,
        snapshotAt: new Date('2020-01-01'),
        retentionDays: 1,
        now: new Date('2026-01-01'),
      }),
    ).toBe(false);
  });
  it('purges unlocked expired runs', () => {
    expect(
      canAutoPurge({
        locked: false,
        immutableUntil: null,
        snapshotAt: new Date('2020-01-01'),
        retentionDays: 30,
        now: new Date('2026-01-01'),
      }),
    ).toBe(true);
  });
});

describe('canApprovePurge', () => {
  it('rejects self-approval', () => {
    expect(canApprovePurge('a', 'a')).toBe(false);
  });
  it('allows different admins', () => {
    expect(canApprovePurge('a', 'b')).toBe(true);
  });
});
